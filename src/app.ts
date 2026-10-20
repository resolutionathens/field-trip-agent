import { Hono } from 'hono';
import { env } from 'cloudflare:workers';
import { createAgentRouter } from '@flue/runtime/routing';
import { FieldTrip } from './agents/field-trip.ts';
import chatUi from './ui/index.html?raw';

// src/app.ts is the Flue route map. Its default export owns every HTTP request
// the Worker receives. Agents get mounted here with createAgentRouter(...)
// starting in checkpoint 1.
const app = new Hono();

// A small chat UI for trying the agent in a browser, locally and on workers.dev.
app.get('/', (c) => c.html(chatUi));
app.get('/api/ping', (c) => c.text('pong'));
app.route('/agents/field-trip', createAgentRouter(FieldTrip));
// cp7: every call the mock supplier received, to check a booking happened exactly once.
app.get('/api/bookings', async (c) => c.json(await env.BookingApi.get(env.BookingApi.idFromName('supplier')).log()));

export default app;
