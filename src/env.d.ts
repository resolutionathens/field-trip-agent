// Vite `?raw` imports return the file contents as a string (used for the chat UI).
declare module '*.html?raw' {
  const content: string;
  export default content;
}

// cp5: the Sandbox binding from wrangler.jsonc, typed for `import { env } from 'cloudflare:workers'`.
declare module 'cloudflare:workers' {
  // cp7: the base class for application-owned Durable Objects (src/shared/mock-booking-api.ts).
  export abstract class DurableObject<Env = unknown> {
    protected ctx: import('@cloudflare/workers-types').DurableObjectState;
    protected env: Env;
    constructor(ctx: import('@cloudflare/workers-types').DurableObjectState, env: Env);
  }
  export const env: {
    Sandbox: Parameters<typeof import('@cloudflare/sandbox').getSandbox>[0];
    // cp7: the mock booking API.
    BookingApi: {
      idFromName(name: string): unknown;
      get(id: unknown): Pick<import('./shared/mock-booking-api.ts').BookingApi, 'quote' | 'reserve' | 'confirm' | 'log'>;
    };
  };
}
