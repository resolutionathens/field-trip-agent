# Field Trip Agent

Build and deploy a **durable AI agent** with the [Flue Framework](https://flueframework.com)
on **Cloudflare Workers**, backed by **Durable Objects** for persistence and recovery.

This repo is set up for the **Cloudflare Connect 2026 · Build It** session. It holds
the starter code, a working agent at every checkpoint, and a skill for your coding agent.

- **Workshop guide (start here):** <https://flue-field-day-workshop.steph.workers.dev/>.
  It covers setup and pre-work, plus a step-by-step walkthrough of every checkpoint.
- **Live demo:** <https://field-trip-agent.omkk.workers.dev/>

> **Using a coding agent** (OpenCode, Claude Code, Cursor, ...)? Point it at this
> README and the skill in [`.agents/skills/build-field-trip-agent/`](.agents/skills/build-field-trip-agent/SKILL.md).
> Rules for agents are at the [bottom of this file](#for-coding-agents).

---

## What you'll learn

| Concept | How you'll see it |
|---|---|
| Creating an agent | An agent *is* a function that returns its instructions, marked with `'use agent'` |
| The Flue hook model | `useModel`, `usePersistentState`, `useTool`, `useSubagent`, `useSandbox`: the agent re-renders before every model call |
| Tools that call external APIs | `defineTool` + [valibot](https://valibot.dev) schemas → Open-Meteo and Wikipedia |
| Sub-agent delegation | A `venue-scout` sub-agent with its own tool, its own model, and a fresh context |
| Sandbox strategies | No sandbox → in-memory virtual sandbox → Cloudflare Computer → Cloudflare Sandbox container (built) |
| Deploy, test, iterate | `vite dev` → `wrangler deploy` → test live → read traces |
| Durable Objects | One Durable Object per conversation; the brief survives sleeps and redeploys |

---

## The agent: `FieldTrip`

You tell it about an offsite (**city, dates, headcount, budget, interests**) and it:

1. Saves the **trip brief** and remembers it across messages.
2. Checks the **weather** for your dates.
3. Finds places nearby and asks its **`venue-scout`** sub-agent to assess them
   (activities, visit length, weather dependency), then matches them to the forecast.
4. Writes an **itinerary** to `itinerary.md` in its sandbox.

It runs on [Workers AI](https://developers.cloudflare.com/workers-ai/) through the
Worker's `AI` binding, and every external API it calls is free and keyless, so
**no API keys are needed**.

| API | Used for |
|---|---|
| [Open-Meteo Geocoding](https://open-meteo.com/en/docs/geocoding-api) | city → latitude/longitude |
| [Open-Meteo Forecast](https://open-meteo.com/en/docs) | daily forecast, up to 16 days ahead |
| [Wikipedia API](https://www.mediawiki.org/wiki/API:Geosearch) | places near a location + summaries |

---

## Checkpoints

The session is split into checkpoints. Each one is a **git tag** (`cp0`…`cp6`)
and a **branch** (`cp/1-hello-agent`…) with working code, so you can always
catch up. `cp6` is the final state of the agent.

| Tag | Branch | Checkpoint | You build | You verify |
|---|---|---|---|---|
| `cp0` | `main` | **Starter** | — | `npm run check`, `/api/ping` → `pong` |
| `cp1` | `cp/1-hello-agent` | **Hello agent + first deploy** | `src/agents/field-trip.ts`, mount it in `src/app.ts`, add a Durable Object migration | agent replies locally **and** on your `workers.dev` URL |
| `cp2` | `cp/2-hooks-state` | **Hooks + persistent state** | `usePersistentState('brief')` + a `save_trip_brief` tool | a second message remembers your headcount |
| `cp3` | `cp/3-api-tools` | **Tools calling external APIs** | `geocode_city`, `get_forecast` (Open-Meteo) | a weather question shows tool calls in the conversation |
| `cp4` | `cp/4-subagent` | **Sub-agent delegation** | Wikipedia tools; a `venue-scout` sub-agent with its own tool and model | the parent finds places, calls `task`, and combines the scout's assessment with the weather |
| `cp5` | `cp/5-sandbox` | **Sandbox** | a Cloudflare Sandbox container per conversation | the agent writes `itinerary.md` and reads it back |
| `cp6` | `cp/6-iterate-observe` | **Iterate + observe** | open the sandbox only when needed, turn on logs and traces, redeploy | new behavior live; traces in the Cloudflare dashboard |

### Fell behind? Catch up in one command

```bash
git stash                      # keep your work, if you want it
git fetch --all --tags
git switch -c my-cp3 cp3       # start from any checkpoint tag
npm install                    # later checkpoints may add dependencies
```

Then re-run that checkpoint's verify step. Or ask your coding agent: *"catch me up
to checkpoint 3"*. The skill knows how.

---

## Commands

| Command | What it does |
|---|---|
| `npm run check` | Checks the Node version, dependencies, and `wrangler whoami` |
| `npm run dev` | Local dev server on `http://localhost:5173` (runs in local `workerd`) |
| `npm run build` | Build the Worker into `dist/` |
| `npm run deploy` | Build and deploy to `https://field-trip-agent.<your-subdomain>.workers.dev` |
| `npm run smoke -- <base-url> <id> "<message>"` | Send a message to the agent and print its reply |

### Talking to your agent

**In the browser:** open <http://localhost:5173> (or your `workers.dev` URL). The
chat UI streams replies live, shows every tool call as an expandable chip, and
has example prompts for each checkpoint (click one, then **Send**). The conversation
id is in the URL (`/?id=…`): bookmark it, open several conversations in tabs, or
open a smoke conversation with `/?id=offsite-1`. **New conversation** starts a fresh
Durable Object.

**From the terminal:**

Every conversation lives at `/agents/field-trip/<id>`. The `<id>` is anything you
choose. Use the same id to continue a conversation.

```bash
# easiest
npm run smoke -- http://localhost:5173 offsite-1 "Plan an offsite in Lisbon for 12 people"

# or by hand: send (returns 202 immediately) ...
curl -X POST http://localhost:5173/agents/field-trip/offsite-1 \
  -H 'content-type: application/json' \
  -d '{"kind":"user","body":"Plan an offsite in Lisbon for 12 people"}'

# ... then read the conversation
curl 'http://localhost:5173/agents/field-trip/offsite-1?view=history'
```

Swap `http://localhost:5173` for your `workers.dev` URL to talk to the live agent.

---

## Project layout

What the repo looks like at the final checkpoint (`cp6`):

```
src/
├── app.ts                      # Hono app: chat UI at /, /agents/field-trip, /api/ping
├── ui/index.html               # browser chat UI (given; no build step)
├── agents/field-trip.ts        # 'use agent': the FieldTrip agent
├── subagents/venue-scout.ts    # sub-agent (not a registered agent)
├── tools/
│   ├── weather.ts              # Open-Meteo tools
│   └── wikipedia.ts            # Wikipedia tools
├── cloudflare.ts               # exports the Sandbox Durable Object class
└── env.d.ts                    # types for the HTML import and cloudflare:workers
Dockerfile                      # sandbox container image (cloudflare/sandbox:0.12.10)
vite.config.ts                  # plugins: [flue(), cloudflare({ config: flueWorkerConfig() })]
wrangler.jsonc                  # AI binding, Durable Object migrations, containers, observability
scripts/                        # check.mjs, smoke.mjs (plain Node, works on Windows too)
.agents/skills/build-field-trip-agent/   # skill for your coding agent
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `npm run check` says not logged in | `npx wrangler login`, then re-run the check |
| `Port 5173 is already in use` | Another dev server (maybe another project) is running. Stop it, or `npm run dev -- --port 5180` and smoke against `http://localhost:5180` |
| Dev server: "Cloudflare plugin is not receiving Flue's Worker configuration" | `vite.config.ts` must use `cloudflare({ config: flueWorkerConfig() })` |
| Deploy fails asking for a `workers.dev` subdomain | Open **Workers & Pages** in the dashboard once to create it |
| Deploy fails with a Durable Object / migration error | Every agent needs a `new_sqlite_classes` migration in `wrangler.jsonc` (see cp1) |
| `cloudflare/...` model errors under `flue run` | Workers AI models only run under `npm run dev` or deployed, not `flue run` |
| POST returns `202` but no reply yet | Replies are async. Poll `GET .../<id>?view=history` or use `npm run smoke` |
| Files the agent wrote are gone | The container was replaced (redeploy) or slept (~10 min idle); persistent state is what survives |
| Traces show one short `chat` span and no tool spans | Flue 2.1.x is installed. This repo pins 2.0.0: `npm install`, then redeploy |
| Stuck? | `git switch -c fresh cpN` and carry on |

More gotchas live in the skill's
[`references/troubleshooting.md`](.agents/skills/build-field-trip-agent/references/troubleshooting.md).

---

## Resources

- Workshop guide: <https://flue-field-day-workshop.steph.workers.dev/>
- Flue docs: <https://flueframework.com/docs/guide/getting-started/>
- Flue on Cloudflare: <https://flueframework.com/docs/ecosystem/deploy/cloudflare/>
- Durable Objects: <https://developers.cloudflare.com/durable-objects/>
- Workers AI: <https://developers.cloudflare.com/workers-ai/>
- Cloudflare Sandbox: <https://developers.cloudflare.com/sandbox/>
- Workers Observability: <https://developers.cloudflare.com/workers/observability/>

---

## For coding agents

You are helping a workshop attendee build this project checkpoint by checkpoint
(`cp0`…`cp6`; `cp6` is the final checkpoint).

**Load the skill first:** `.agents/skills/build-field-trip-agent/SKILL.md`. It
contains the verified code and verify command for every checkpoint
(`references/checkpoints/cpN-*.md`), a Flue cheatsheet, deploy notes, and
troubleshooting.

**Workflow:** detect the current checkpoint (`git describe --tags`, or inspect
`src/`) → implement only the *next* checkpoint → run its verify step → report.
If the attendee is behind, offer `git switch -c <name> cpN` instead of
hand-writing several checkpoints at once.

**Rules:**

1. **Adding an agent is a triple:** the `'use agent'` file, the `app.route(...)`
   mount in `src/app.ts`, and a uniquely tagged `new_sqlite_classes` migration in
   `wrangler.jsonc`. The Durable Object class is `Flue<Name>Agent`
   (`FieldTrip` → `FlueFieldTripAgent`). Append migrations; never rewrite existing ones.
2. **`flue()` comes before `cloudflare()`** in `vite.config.ts`, and
   `cloudflare()` receives `{ config: flueWorkerConfig() }` (from `@flue/vite`).
   Keep `flue({ providers: ['cloudflare'] })` unless you add another model provider.
   When the flueframework.com docs and the installed version disagree, trust
   `npx flue docs read <page>`, which ships with the installed version.
3. `wrangler.jsonc` keeps `compatibility_flags: ["nodejs_compat"]` and a
   `compatibility_date` of `2026-04-01` or later.
4. **Every exported capitalized function in a `'use agent'` file becomes an
   agent.** Never export sub-agent functions from it. Define sub-agents in
   `src/subagents/*.ts` with `defineSubagent`.
5. `useModel` is required and called **exactly once** per render. Sub-agents
   cannot call `useModel`, `useSandbox`, or `usePersistentState`. Set `model` on
   the sub-agent definition instead.
6. Use the Workers AI model `cloudflare/@cf/google/gemma-4-26b-a4b-it` (no API keys).
   `cloudflare/...` models only work under `vite dev` or when deployed, not `flue run`.
7. Reserved tool names: `task`, `activate_skill`, `read_skill_resource`, `read`,
   `write`, `edit`, `bash`, `grep`, `glob`.
8. Tools: validate input with valibot, return `{ output }` or a string, **throw**
   on failure so the model can recover, and pass `signal` to every `fetch`.
   Wikipedia requests need a descriptive `User-Agent` header.
9. Sandbox files (the cp5 container) don't survive a sleep or redeploy. Anything
   that must survive goes in `usePersistentState`. Keep `@cloudflare/sandbox` at
   `0.12.10` (not 1.x) and the `Dockerfile` tag equal to it.
10. Keep Flue pinned to `2.0.0` (with `agents` `0.20.1`). Don't upgrade: 2.1.x
    loses the `chat`/`execute_tool` spans in traces.
11. Never commit `.dev.vars`, `.env`, or secrets.
12. Stay within the attendee's current checkpoint; don't pull later checkpoints'
    code forward.
13. `src/ui/index.html` is given scaffolding. Don't edit it unless the attendee
    asks. It already renders tool calls and any `data-<name>` parts.

### Container alarm safeguard (SR-6063)

The `workshop` deployment applies `scripts/patch-container-alarm.mjs` after install
and before build/deploy. Unknown scheduled callbacks retain their payload and
retry after five minutes instead of re-arming an expired alarm. An SDK upgrade
requires review before this narrowly checked patch will apply.

`npm run test:alarm` exercises the installed Containers SDK alarm with real
Workers SQLite and simulated container lifecycle calls. Remove the patch only
when an upstream replacement passes these regressions. If install scripts are
disabled, run the patch explicitly before invoking Vite or Wrangler directly.
