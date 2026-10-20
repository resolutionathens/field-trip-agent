import { defineTool } from '@flue/runtime';
import { env } from 'cloudflare:workers';
import * as v from 'valibot';

// The supplier takes 45 s between reserving and confirming: long
// enough to redeploy mid-booking and watch recovery (cp7's demo).
const SUPPLIER_WAIT_MS = 45_000;

const isoDate = v.pipe(v.string(), v.isoDate());

// durable: true — if the Worker restarts mid-call, recovery re-runs this function.
// Each step.do() records its result, so completed steps replay from their records
// instead of calling the supplier again. Only the unfinished step runs.
export const bookOffsite = defineTool({
  name: 'book_offsite',
  description:
    'Book the offsite venue for the saved trip: quote, reserve, then confirm with the supplier. Takes about a minute. Call it once, only when the user asks to book.',
  input: v.object({
    city: v.string(),
    startDate: isoDate,
    endDate: isoDate,
    headcount: v.pipe(v.number(), v.integer(), v.minValue(1)),
  }),
  durable: true,
  async run({ data, step, toolCallId }) {
    const api = env.BookingApi.get(env.BookingApi.idFromName('supplier'));
    const quote = await step.do('quote', () => api.quote(data));
    // Steps are at-least-once: a crash just after the supplier answered re-runs the
    // step, so the idempotency key (stable per tool call) makes the repeat harmless.
    const reservation = await step.do('reserve', () => api.reserve(`${toolCallId}:reserve`, data));
    await step.do('supplier-wait', () => new Promise<boolean>((done) => setTimeout(() => done(true), SUPPLIER_WAIT_MS)));
    const confirmed = await step.do('confirm', () => api.confirm(`${toolCallId}:confirm`, reservation.reservationId));
    return { output: { venue: quote.venue, totalEur: quote.totalEur, ...confirmed } };
  },
});
