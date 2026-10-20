import { DurableObject } from 'cloudflare:workers';
import type { DurableObjectState } from '@cloudflare/workers-types';

// cp7: a stand-in for a venue supplier's booking API. It lives in its own Durable
// Object so its records survive redeploys, which is what lets us prove the agent
// booked exactly once. Like a real payment or booking API, it honours an
// idempotency key: a repeated request with the same key returns the first result.
export type BookingRequest = { city: string; startDate: string; endDate: string; headcount: number };

export class BookingApi extends DurableObject {
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(
        'CREATE TABLE IF NOT EXISTS calls(at TEXT NOT NULL, op TEXT NOT NULL, idem_key TEXT NOT NULL, replayed INTEGER NOT NULL)',
      );
      this.ctx.storage.sql.exec(
        'CREATE TABLE IF NOT EXISTS results(idem_key TEXT PRIMARY KEY, json TEXT NOT NULL)',
      );
    });
  }

  // Records every call, then returns the stored result for a known key or runs `make` once.
  private once<T>(op: string, key: string, make: () => T): T {
    const known = this.ctx.storage.sql.exec('SELECT json FROM results WHERE idem_key = ?', key).toArray()[0];
    this.ctx.storage.sql.exec('INSERT INTO calls VALUES (?, ?, ?, ?)', new Date().toISOString(), op, key, known ? 1 : 0);
    if (known) return JSON.parse(known.json as string) as T;
    const result = make();
    this.ctx.storage.sql.exec('INSERT INTO results VALUES (?, ?)', key, JSON.stringify(result));
    return result;
  }

  async quote(request: BookingRequest) {
    const nights = Math.max(1, (Date.parse(request.endDate) - Date.parse(request.startDate)) / 86_400_000);
    return { venue: `${request.city} Offsite Loft`, totalEur: request.headcount * nights * 180 };
  }

  async reserve(key: string, request: BookingRequest) {
    return this.once('reserve', key, () => ({ reservationId: `RSV-${crypto.randomUUID().slice(0, 8)}`, ...request }));
  }

  async confirm(key: string, reservationId: string) {
    return this.once('confirm', key, () => ({ reservationId, confirmation: `CNF-${crypto.randomUUID().slice(0, 8)}` }));
  }

  // Every call the supplier received, newest first, for GET /api/bookings.
  async log() {
    return this.ctx.storage.sql.exec('SELECT * FROM calls ORDER BY at DESC LIMIT 50').toArray();
  }
}
