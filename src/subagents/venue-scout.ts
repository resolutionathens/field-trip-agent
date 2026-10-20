// An ordinary module, NOT 'use agent': a subagent is a capability of the agent
// that mounts it, not a registered agent. It has no URL, no conversation id,
// no persistent state, and no useModel() (it inherits the parent's model).
import { defineSubagent, useTool } from '@flue/runtime';
import { getPlaceSummary } from '../tools/wikipedia.ts';

function VenueScout() {
  // The scout's world is only what it mounts here. The parent's tools,
  // instructions, conversation and state are NOT inherited.
  useTool(getPlaceSummary);

  return `You are venue-scout. You assess a few places for a team offsite.

You only see the task prompt, not the user's conversation. The prompt gives you up to 3 places (Wikipedia article titles) and details about the group.

1. Call \`get_place_summary\` for every place, all in one batch.
2. Then write your final answer. Use facts from the summary; you may add general knowledge, but mark estimates as estimates.

Your final answer is all the parent sees. Always finish with this exact format, one block per place, and nothing else:

**<place name>** (<Wikipedia URL>)
- What to do: <1–2 activities for a group>
- Typical visit: <e.g. ~1–2 h> (estimate)
- Weather: <indoor | outdoor | mixed>; <how rain or heat affects the visit>
- Group fit: <one sentence about this group size and interests>`;
}

export const venueScout = defineSubagent({
  name: 'venue-scout',
  description:
    'Assesses up to 3 places for a team offsite: activities, typical visit length, weather dependency, and group fit. Prompt with the exact Wikipedia titles, the city, the headcount, and the interests.',
  agent: VenueScout,
  model: 'cloudflare/@cf/meta/llama-4-scout-17b-16e-instruct',
});
