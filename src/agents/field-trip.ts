'use agent';

import { type AgentProps, useModel, usePersistentState, useSandbox, useSubagent, useTool } from '@flue/runtime';
import { cloudflareSandbox } from '@flue/runtime/cloudflare';
import { getSandbox } from '@cloudflare/sandbox';
import { env } from 'cloudflare:workers';
import * as v from 'valibot';
import { geocodeCity, getForecast } from '../tools/weather.ts';
import { findNearbyPlaces } from '../tools/wikipedia.ts';
import { venueScout } from '../subagents/venue-scout.ts';

// The trip brief the agent remembers for this conversation.
type TripBrief = {
  city?: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  headcount?: number;
  budget?: string;
  interests?: string[];
};

export function FieldTrip({ id }: AgentProps) {
  useModel('cloudflare/@cf/google/gemma-4-26b-a4b-it');

  // Durable, per-conversation state (stored in this conversation's Durable Object).
  // Shaped like React's useState, but it survives restarts and redeploys.
  const [brief, setBrief] = usePersistentState<TripBrief>('brief', {});

  // Tools can write state. The write commits together with the tool call.
  useTool({
    name: 'save_trip_brief',
    description:
      'Save or update the offsite trip brief. Call this whenever the user states or changes the city, dates, headcount, budget, or interests. Only include fields the user mentioned; they are merged into the saved brief.',
    input: v.object({
      city: v.optional(v.string()),
      startDate: v.optional(v.pipe(v.string(), v.isoDate())),
      endDate: v.optional(v.pipe(v.string(), v.isoDate())),
      headcount: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
      budget: v.optional(v.string()),
      interests: v.optional(v.array(v.string())),
    }),
    async run({ data }) {
      const updates = Object.fromEntries(
        Object.entries(data).filter(([, value]) => value !== undefined),
      ) as TripBrief;
      setBrief((previous) => ({ ...previous, ...updates }));
      return { output: { saved: updates } };
    },
  });

  // Tools that call an external API (Open-Meteo), defined in src/tools/weather.ts.
  useTool(geocodeCity);
  useTool(getForecast);

  // The parent finds candidate places (Wikipedia geosearch)...
  useTool(findNearbyPlaces);

  // ...and delegates assessing each one to a subagent. The model calls the
  // built-in `task` tool once per place; each scout runs in a fresh context
  // with its own tools, and only its final answer comes back here.
  useSubagent(venueScout);

  // A Linux container per conversation (adds read/write/edit/bash/grep/glob tools).
  useSandbox(cloudflareSandbox(getSandbox(env.Sandbox, id)));

  // The agent re-renders before every model call, so these instructions
  // always reflect the latest saved brief.
  const hasBrief = Object.keys(brief).length > 0;
  const today = new Date().toISOString().slice(0, 10);
  return `You are FieldTrip, a helpful team-offsite planner. You help groups plan memorable offsites by understanding their destination, dates, headcount, budget, and interests.

Rules:
1. If the user's message contains ANY trip detail (city, dates, headcount, budget, interests), your FIRST action is to call \`save_trip_brief\` with those fields. Do this before writing any reply.
2. Answer questions about the trip from the saved brief below. If a detail is missing, ask for it.
3. For weather questions: call \`geocode_city\` for the city, then \`get_forecast\` with its latitude/longitude and the trip dates (use the saved brief). If there is no end date, use the start date. Summarise the forecast per day in plain words; if a tool returns an error, explain it to the user.
4. For venue, activity or place suggestions:
   a. Call \`geocode_city\`, then \`find_nearby_places\` with its coordinates.
   b. Pick the 3 places that best fit the brief (skip stations, offices, hospitals, embassies, companies, events).
   c. Call \`task\` ONCE with agent \`venue-scout\` for all 3 places. The scout cannot see this conversation, so the prompt must be a complete briefing: the exact place titles, the city, the headcount, and the interests.
   d. Combine the results into a short plan, keeping the links. If you know the forecast, suggest outdoor places for dry days and indoor ones for rainy days.
5. For an itinerary: \`write\` it to itinerary.md (one section per day: places, timing, weather), then \`read\` it to check. Do not repeat the file in your reply (the user sees the read result); reply in one sentence.
6. Keep replies short: at most 120 words unless the user asks for more detail.

Today is ${today}.

## Saved trip brief
${hasBrief ? JSON.stringify(brief, null, 2) : '(nothing saved yet)'}`;
}
