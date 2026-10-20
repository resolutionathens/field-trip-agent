import { defineTool } from '@flue/runtime';
import * as v from 'valibot';

// Wikipedia APIs: free, no API key, but a descriptive User-Agent is required.
// https://www.mediawiki.org/wiki/API:Etiquette
const HEADERS = {
  'User-Agent': 'FieldTripAgent/0.1 (Flue workshop demo; https://github.com/omkarkhair/field-trip-agent)',
  Accept: 'application/json',
};

export const findNearbyPlaces = defineTool({
  name: 'find_nearby_places',
  description:
    'List Wikipedia articles about places near a latitude/longitude (up to 10 km), with a one-line description and distance. Results include noise (stations, offices, events): pick the places that suit a group offsite.',
  input: v.object({
    latitude: v.number(),
    longitude: v.number(),
    radiusMeters: v.optional(v.pipe(v.number(), v.minValue(100), v.maxValue(10000)), 10000),
  }),
  async run({ data, signal }) {
    const coord = `${data.latitude}|${data.longitude}`;
    const params = new URLSearchParams({
      action: 'query',
      generator: 'geosearch',
      ggscoord: coord,
      ggsradius: String(Math.round(data.radiusMeters)),
      ggslimit: '20',
      prop: 'description|coordinates',
      codistancefrompoint: coord,
      colimit: 'max', // default is 10, which would leave half the results without a distance
      format: 'json',
      formatversion: '2',
    });
    const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, { headers: HEADERS, signal });
    if (!res.ok) throw new Error(`Wikipedia geosearch failed: HTTP ${res.status}`);
    const body = (await res.json()) as {
      query?: {
        pages: Array<{ title: string; description?: string; coordinates?: Array<{ dist: number }> }>;
      };
    };
    const pages = body.query?.pages ?? [];
    if (pages.length === 0) throw new Error('No Wikipedia places found here. Try a larger radius or check the coordinates.');
    return {
      output: pages
        .map((p) => ({
          title: p.title,
          description: p.description ?? '',
          distanceM: Math.round(p.coordinates?.[0]?.dist ?? 0),
        }))
        .sort((a, b) => a.distanceM - b.distanceM),
    };
  },
});

export const getPlaceSummary = defineTool({
  name: 'get_place_summary',
  description:
    'Get a short Wikipedia summary and URL for one place, by its exact article title (as returned by find_nearby_places).',
  input: v.object({
    title: v.pipe(v.string(), v.minLength(1)),
  }),
  async run({ data, signal }) {
    const slug = encodeURIComponent(data.title.replaceAll(' ', '_'));
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${slug}`, { headers: HEADERS, signal });
    if (res.status === 404) throw new Error(`No Wikipedia article titled "${data.title}". Use a title from find_nearby_places.`);
    if (!res.ok) throw new Error(`Wikipedia summary failed: HTTP ${res.status}`);
    const page = (await res.json()) as {
      title: string;
      description?: string;
      extract?: string;
      content_urls?: { desktop?: { page?: string } };
    };
    return {
      output: {
        title: page.title,
        description: page.description ?? '',
        // Keep tool output small: it goes into the model's context window.
        summary: (page.extract ?? '').slice(0, 600),
        url: page.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${slug}`,
      },
    };
  },
});
