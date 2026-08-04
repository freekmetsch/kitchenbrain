# Project Instructions — Keukenbrein

Self-hosted grocery, meal-plan, recipe, and freezer-inventory PWA with an AI chat assistant and an Albert Heijn (Dutch supermarket) basket-push integration. Single-household app: no multi-tenancy, no SaaS layer, no signup flow — users are seeded from an env var.

The household users are Freek and Ylfa. This is product context, not an authorization or credential
source; runtime accounts remain seeded from `HOUSEHOLD_USERS`.

This file is the root of the repo; the app itself lives in this directory (SvelteKit).

## App stage

`app_stage: beta`

- The canonical public repository owns development and deployment.
- Real household data may exist. Treat schema, auth, and destructive data changes as R3.

## Stack

- **SvelteKit 2 + Svelte 5** (runes), Tailwind v4 + daisyUI, adapter-node.
- **SQLite** via `better-sqlite3` + Drizzle ORM. Migrations in `drizzle/`; the journal is append-only — never squash it, self-hosters' existing DBs replay it on upgrade.
- **AI**: OpenRouter (OpenAI-compatible), BYOK. Any OpenRouter-listed model works; defaults favor a cheap/fast tier since every chat turn and background job is metered against your own key.
- No build step beyond `vite build`; no separate backend service.

## Local development

```
npm install
npm run dev
```

Do not copy `.env.example` to a plaintext env file. The standard verification commands below are
secret-free. Any flow that needs a real provider credential must use the global 1Password contract
and a committed repository wrapper; do not invent a local fallback.

- `npm test` — the complete gate: Svelte diagnostics, Vitest, production build, and authenticated Playwright smoke tests.
- `npm run test:unit` — focused Vitest run, with no network calls or cost.
- `npm run test:e2e` — focused Chromium run with the primary isolated test account.
- `npm run test:e2e:secondary` — the same browser checks with the second isolated account.
- `npm run check` / `npm run build` — focused diagnostics or production-bundle checks.

Run `npm run test:e2e:install` once to install Chromium, then run `npm test` before opening a PR. The
Playwright server recreates `.test-data/e2e/`, seeds fixed test-only users through `HOUSEHOLD_USERS`,
binds only to `localhost:4173`, and never reads the household database or real provider credentials.

This repo is the canonical dev repo for the app — it's what Railway (or any other deploy target) builds from directly, at the repo root.

**Windows contributors:** commit `start.sh` with LF line endings only — a CRLF-corrupted shebang breaks `exec ./start.sh` in the container (`./start.sh: not found`). The repo's own git blobs are already clean LF; this only bites if your local `core.autocrlf` rewrites it on checkout and you then deploy from that local working copy directly instead of through git.

### Production delivery truth

- Production is Railway project `a8fd74d7-2c0e-4d95-a310-7c13dc1c7936`, environment
  `production`, service `household-brain`, sourced from GitHub `freekmetsch/kitchenbrain` branch
  `main`.
- A pushed feature branch is not live. "Live" means Railway reports `SUCCESS`, source branch
  `main`, deployed commit equals the remote `main` tip, and the authenticated canary passes.
- This public repository has no GitHub CI gate. Merging to `main` initiates the production source
  deployment, so supervise the deployment through its terminal status and canary.
- Use `node scripts/production/railway-deployment-truth.mjs` for names-only revision evidence.
  Never use raw Railway variable/config reads for diagnostics: they can return plaintext values.
- Production variable writes use `scripts/production/stage-railway-config.ps1`, which accepts only
  fixed profiles and sends values through stdin with intermediate deploys disabled. Routine code
  delivery uses the configured GitHub source, never `railway up`.
- Do not retain authenticated screenshots, HAR files, cookies, `Set-Cookie` headers, response
  bodies, or household list contents as public evidence.
- **Production delivery is automatic in this repository.** Do not ask Freek for per-change
  deployment confirmation. After implementation, run the full `npm test` gate, diagnose and fix
  routine failures, deliver only the task commits to `main`, supervise Railway until it reports
  `SUCCESS` for the exact remote `main` tip, run the authenticated production canary, and report the
  deployed commit and canary result.
- **Agents own delivery recovery.** Diagnose and fix in-scope test, deployment, and canary failures,
  then rerun and continue automatically. If a failed canary leaves a bad task commit live and an
  immediate forward fix is not safer, `git revert` the delivered task commit(s), push that revert to
  `main`, supervise the recovery deployment, and rerun the canary before reporting. Never use
  `railway up`, force-push `main`, or weaken verification or secret handling to force a result.
- R3 work (schema, auth, or destructive household-data changes) is not routine code delivery. Meet
  its explicit decision, backup, and rollback preconditions before merging. Separate unrelated
  commits instead of publishing them with the task; routine delivery never waits for approval.

## Architecture invariants

**AH push always sources from Dutch fields.** Recipes store ingredients in Dutch (`recipes.ingredients[].name`) alongside an English display/cache translation. Albert Heijn's product search, basket API, and shopping-list derivation must only ever read the Dutch fields — English fields are display data and are not valid AH lookup keys. If you're touching anything under `src/lib/server/ah/` or shopping-list generation, keep this seam intact.

**LLM provider is swappable behind one seam.** `src/lib/server/ai/client.ts` is the only module that imports an LLM SDK as a runtime value; everywhere else (`history.ts`, `cache.ts`, etc.) only shares message *types*. Model choice resolves **DB preference → env var → hardcoded default** per role (chat / fallback / vision / background) via `src/lib/server/ai/config.ts` — editable at runtime from Settings, no redeploy needed. System prompts are plain markdown in `src/lib/server/ai/prompts/*.md`.

**Runtime config is `.env`-only.** No `PUBLIC_*` vars, no client-side secrets. Required: `OPENROUTER_API_KEY`. Everything else (DB path, recipe-image dir, AH token file path, model choices) has a working default — see `.env.example`.

## Deployment

Ships as a single Node process (`adapter-node`) plus a SQLite file and a directory for recipe images — both need to live on a persistent volume if you're running in a container. `Dockerfile` + `docker-compose.yml` are the supported path for self-hosting; any host that can mount a persistent volume and run `node build` works too.

## Connecting Albert Heijn

AH's login flow is built for their own app and challenges unfamiliar clients with a captcha + emailed/texted code, so there's no way to do this purely server-side. `scripts/ah_local_login.py` opens a real browser for that one login step and hands the resulting token to the app (Settings → Albert Heijn). See `scripts/CONNECT_AH.md` for the full walkthrough. This is an unofficial, reverse-engineered API — expect it to occasionally break when AH changes their app, and don't rely on it for anything beyond personal use.

## Testing discipline

All tests are free (vitest, no external API calls) — run them freely, no confirmation needed.
