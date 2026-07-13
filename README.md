# Keukenbrein

Dutch for "kitchen brain." A self-hosted grocery, meal-plan, recipe, and freezer-inventory app with an AI chat assistant and a direct push to Albert Heijn's (Dutch supermarket) online basket.

**Note:** the Albert Heijn integration is unofficial and reverse-engineered — there's more on what that means and why it's still worth using further down.

## Why I built this

My household runs on a shared grocery list, a rotating set of recipes, and a freezer that never matches what's actually in it. I built this app to fix that: recipes and a meal plan feed a shopping list, the shopping list pushes straight into our Albert Heijn basket, and an AI chat handles the fiddly parts — add a recipe from a URL, log what's in the freezer, ask what to cook with what's already in the house.

I thought about turning this into a hosted product. I didn't, for one blocking reason: the Albert Heijn integration talks to a reverse-engineered mobile API, not an official one. Charging for that felt wrong, and building multi-tenant infrastructure around an integration that AH could break at any time felt like the wrong bet. So instead: a scrubbed, generic version of what I actually run, released as something you host yourself with your own AI key.

## What's in here

- **Recipes** — stored with Dutch ingredient names (needed for Albert Heijn product matching) plus an English display translation; import a recipe straight from a URL.
- **Meal plan** — a rolling calendar you fill from your recipe list; cooked meals log to a history.
- **Inventory** — tracks what's actually in the fridge, pantry, and freezer, including freezer staples you always want in stock.
- **Shopping list** — built from the meal plan and inventory gaps, reviewed before it goes anywhere.
- **Albert Heijn push** — send the reviewed shopping list straight into your AH online basket, matched to real products.
- **AI chat** — ask it to add a recipe from a link, log what you just cooked, check what's running low, or build next week's shopping list. It has tool access to everything above.
- **Settings** — swap AI models (any OpenRouter model works), set daily spend caps, connect Albert Heijn, describe your household so the AI has context.

## Quick start (Docker)

```
git clone https://github.com/freekmetsch/kitchenbrain
cd kitchenbrain
cp .env.example .env
# edit .env: at minimum set OPENROUTER_API_KEY and HOUSEHOLD_USERS
docker compose up -d
```

Open `http://localhost:3000` and log in with one of the users from `HOUSEHOLD_USERS`.

**Pro tip:** the compose file mounts the database, recipe photos, and AH tokens into a single `data` volume, so `docker compose down` and back up again won't lose anything.

## Local development

```
git clone https://github.com/freekmetsch/kitchenbrain
cd kitchenbrain
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:5173`. Run `npm run check` and `npm run test:unit` before opening a PR — both are free, no network calls, no API cost.

## Connecting Albert Heijn

AH's login flow expects their own app, not a browser tab talking to a third-party server, so there's a one-time script instead of an in-app button. See [`scripts/CONNECT_AH.md`](scripts/CONNECT_AH.md) for the full walkthrough — it takes about two minutes.

This is an unofficial integration: it works today because it mimics what the AH app itself does, and it can stop working the day Albert Heijn changes something on their end. It's built for personal, single-household use — not as a dependency for anything that needs to keep working no matter what.

## Configuring the AI

Every chat turn and background job runs through [OpenRouter](https://openrouter.ai/keys), so you bring your own key — there's no bundled AI cost. The defaults point at a small set of cheap, fast models; once the app is running, all four model roles (chat, fallback, vision, background) are editable from Settings without a redeploy. `PWA_DAILY_EUR_CAP` and `PWA_BACKGROUND_DAILY_EUR_CAP` cap what a bad day can cost you.

## Maintenance

I built this for my own household and maintain it in whatever time I have between actually using it. Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) — but expect reviews to take a while, and expect the Albert Heijn integration in particular to occasionally lag behind AH's own app.

## License

MIT — see [LICENSE](LICENSE).
