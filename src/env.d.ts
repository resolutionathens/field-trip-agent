// Vite `?raw` imports return the file contents as a string (used for the chat UI).
declare module '*.html?raw' {
  const content: string;
  export default content;
}

// cp5: the Sandbox binding from wrangler.jsonc, typed for `import { env } from 'cloudflare:workers'`.
declare module 'cloudflare:workers' {
  export const env: { Sandbox: Parameters<typeof import('@cloudflare/sandbox').getSandbox>[0] };
}
