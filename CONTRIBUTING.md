# Bijdragen

Dit is een nevenproject dat wordt onderhouden rond het daadwerkelijke gebruik ervan, niet door een bedrijf met een supportdesk. Dat bepaalt hoe bijdragen hier werken.

## Voordat je gaat programmeren

**Open** voor iets groters dan een kleine, voor de hand liggende fix eerst een issue waarin je beschrijft wat je wilt veranderen en waarom. Dat voorkomt dat je iets bouwt dat niet past bij de richting van het project: deze app is bewust beperkt tot één huishouden, zonder aanmeldflow, zonder multi-tenancy, en er zijn geen plannen om dat toe te voegen.

## Een wijziging maken

1. **Draai** `npm install`, daarna `npm run dev` (zie de [README](README.md) voor de volledige installatie).
2. **Draai** `npm run check` (svelte-check) en `npm run test:unit` (vitest) voordat je een pull request opent. Beide zijn gratis: geen netwerkverkeer, geen API-kosten.
3. **Houd** de twee architectuurinvarianten intact, beschreven in [CLAUDE.md](CLAUDE.md):
   - Het matchen bij Albert Heijn haalt altijd uit de Nederlandse receptvelden, nooit uit de Engelse weergavevertaling.
   - De LLM-provider blijft verwisselbaar achter `src/lib/server/ai/client.ts`; grijp elders niet naar een SDK.

## Wijzigingen aan Albert Heijn

Alles wat de AH-schrijfpaden in `src/lib/server/ai/executors.ts` raakt, verdient extra aandacht: het is een niet-officiële, nagebouwde koppeling, en een slechte wijziging daar kan een kapot mandje naar iemands echte AH-account sturen. **Beschrijf** in de pull request wat je handmatig hebt getest.

## Reactietijd

Pull requests worden beoordeeld zodra er tijd voor is, en dat is sommige weken niet veel. Als een pull request lang blijft liggen, is een vriendelijk duwtje prima.

---

# Contributing

This is a side project maintained around actually using it, not by a company with a support desk. That shapes how contributing works here.

## Before you write code

For anything beyond a small, obvious fix, **open** an issue first describing what you want to change and why. That avoids building something that does not fit the project's direction: this app is deliberately scoped to a single household, with no signup flow, no multi-tenancy, and no plans to add either.

## Making a change

1. **Run** `npm install`, then `npm run dev` (see the [README](README.md) for the full setup).
2. **Run** `npm run check` (svelte-check) and `npm run test:unit` (vitest) before opening a pull request. Both are free: no network calls, no API cost.
3. **Keep** the two architecture invariants intact, described in [CLAUDE.md](CLAUDE.md):
   - Albert Heijn matching always sources from the Dutch recipe fields, never the English display translation.
   - The LLM provider stays swappable behind `src/lib/server/ai/client.ts`; do not reach for an SDK anywhere else.

## Albert Heijn changes

Anything touching the AH write paths in `src/lib/server/ai/executors.ts` deserves extra care: it is an unofficial, reverse-engineered integration, and a bad change there can push a broken basket to someone's real Albert Heijn account. **Describe** what you tested manually in the pull request.

## Response time

Pull requests get reviewed when time allows, which some weeks is not much. If a pull request sits for a while, a friendly bump is fine.
