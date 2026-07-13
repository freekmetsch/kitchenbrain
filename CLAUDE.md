# Project Instructions — Keukenbrein

Self-hosted grocery, meal-plan, recipe, and freezer-inventory PWA with an AI chat assistant and an Albert Heijn (Dutch supermarket) basket-push integration. Single-household app: no multi-tenancy, no SaaS layer, no signup flow — users are seeded from an env var.

This file is the root of the repo; the app itself lives in this directory (SvelteKit).

## Stack

- **SvelteKit 2 + Svelte 5** (runes), Tailwind v4 + daisyUI, adapter-node.
- **SQLite** via `better-sqlite3` + Drizzle ORM. Migrations in `drizzle/`; the journal is append-only — never squash it, self-hosters' existing DBs replay it on upgrade.
- **AI**: OpenRouter (OpenAI-compatible), BYOK. Any OpenRouter-listed model works; defaults favor a cheap/fast tier since every chat turn and background job is metered against your own key.
- No build step beyond `vite build`; no separate backend service.

## Local development

```
cp .env.example .env   # fill in OPENROUTER_API_KEY at minimum
npm install
npm run dev
```

- `npm run check` — svelte-check (types + template diagnostics).
- `npm run test:unit` — vitest, no network calls, no cost.
- `npm run build` — production bundle; also the fastest way to catch a broken Tailwind class or Svelte compile error.

Run all three before opening a PR.

This repo is the canonical dev repo for the app — it's what Railway (or any other deploy target) builds from directly, at the repo root.

**Windows contributors:** commit `start.sh` with LF line endings only — a CRLF-corrupted shebang breaks `exec ./start.sh` in the container (`./start.sh: not found`). The repo's own git blobs are already clean LF; this only bites if your local `core.autocrlf` rewrites it on checkout and you then deploy from that local working copy directly instead of through git.

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
