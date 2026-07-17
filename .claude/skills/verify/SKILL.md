---
name: verify
description: Build, launch, and drive Keukenbrein locally to verify a change end-to-end (login, seeded data, cook mode, Playwright).
---

# Verifying Keukenbrein changes in a running app

## Launch

```bash
cp .env.example .env    # then set the values below
# HOUSEHOLD_USERS=chef:test1234   (login user, seeded at boot)
# DATABASE_URL=<scratch path>.db  (keep test DBs out of the repo)
# OPENROUTER_API_KEY can be a dummy value unless the flow under test calls AI.
set -a; . ./.env; set +a; npm run dev   # .env is NOT auto-loaded into process.env in dev —
                                        # db bootstrap reads process.env directly, so export it.
```

Wait for `curl -s http://localhost:5173/login` → 200.

## Sandbox gotcha: paraglide i18n plugin fetch

In sandboxes where `cdn.jsdelivr.net` is blocked by an egress proxy, the inlang
plugin fetch "succeeds" with the proxy's 403 error page, every `m.*()` message
function fails to compile, and `npm run check` drowns in hundreds of bogus
`m.foo is not a function`-style errors. Fix (no tracked files touched):

1. `npm pack @inlang/plugin-message-format@latest` (npm registry is allowed),
   extract, copy `package/dist/index.js` over the file in
   `project.inlang/cache/plugins/`.
2. Patch `node_modules/@inlang/sdk/dist/plugin/importPlugins.js` `fetchPlugin`
   to `throw` when `!response.ok` — the SDK is network-first and only falls
   back to the cache when the fetch throws.

## Seeding data without AI calls

Cook mode renders from `recipes.cook_mode_json` (cached bench sheet). Insert a
recipe row with a pre-built `CookModeRecipe` (see `src/lib/types.ts`:
`mise_en_place`, `streams`, `steps[]` with `timer_seconds`, `stream_id`,
`merges_from`) via `better-sqlite3` against `DATABASE_URL` — no OpenRouter key
needed. Timestamps are unix seconds; `slug` is the URL (`/recipes/<slug>`).

## Driving with Playwright

- Playwright is installed globally: `import { chromium } from
  '/opt/node22/lib/node_modules/playwright/index.mjs'` with
  `executablePath: '/opt/pw-browsers/chromium'`.
- Login: fill `input[name="username"]` / `input[name="password"]`, click
  submit, then `waitForURL((u) => !u.pathname.includes('/login'))` —
  `waitForNavigation` races the session cookie.
- Timer chips: the step ROW button contains the chip's text too — locate the
  chip with an exact-text filter (`/^⏱ 5m$/`), not `hasText: '⏱'`.
- The floating timer pill is `[data-timer-id]`; drag with `mouse.down()` +
  stepped `mouse.move` (3 px threshold) + `mouse.up()`. Edge snap: left edge
  x=12 or right edge viewport−12; minimize keeps y and the right edge.
