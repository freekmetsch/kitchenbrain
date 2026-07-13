# Keukenbrein

Keukenbrein is een zelf te hosten app voor boodschappen, maaltijdplanning, recepten en voorraadbeheer in de vriezer, met een AI-chatassistent en een directe koppeling naar het online winkelmandje van Albert Heijn. De app is gebouwd voor één huishouden: geen inlogsysteem voor meerdere klanten, geen abonnement, gewoon een app die je zelf host en zelf beheert.

Recepten en een maaltijdplan voeden een boodschappenlijst. Die boodschappenlijst gaat rechtstreeks naar het Albert Heijn-mandje. De AI-chat regelt de kleine, vervelende taken: **voeg** een recept toe vanaf een link, **noteer** wat er in de vriezer ligt, of **vraag** wat je kunt koken met wat er al in huis is.

De Albert Heijn-koppeling is niet officieel: ze bootst na wat de Albert Heijn-app zelf doet, in plaats van een door Albert Heijn aangeboden API te gebruiken. Ze kan dus stoppen met werken zodra Albert Heijn iets aan hun kant verandert. Meer daarover staat verderop, bij "Albert Heijn koppelen".

Dit project wordt zelf gehost, niet als een dienst aangeboden. Albert Heijn stelt geen officiële API beschikbaar voor dit soort koppelingen; deze app praat in plaats daarvan met dezelfde niet-officiële mobiele API die de Albert Heijn-app zelf gebruikt. Een gedeelde omgeving bouwen rondom een koppeling die Albert Heijn op elk moment kan aanpassen, is geen stabiele basis voor een dienst die voor meerdere huishoudens tegelijk moet werken. Vandaar de keuze: een generieke versie van dezelfde app, die je zelf host met je eigen AI-sleutel (bring your own key).

## Wat zit erin

- **Recepten** — opgeslagen met Nederlandse ingrediëntnamen (nodig om producten bij Albert Heijn te kunnen matchen), plus een Engelse vertaling voor de weergave; **importeer** een recept rechtstreeks vanaf een link.
- **Maaltijdplan** — een doorlopende kalender die je vult vanuit je receptenlijst; gekookte maaltijden loggen automatisch naar een geschiedenis.
- **Voorraad** — houdt bij wat er echt in de koelkast, voorraadkast en vriezer ligt, inclusief vriezerbasics die je altijd op voorraad wilt hebben.
- **Boodschappenlijst** — samengesteld uit het maaltijdplan en de gaten in de voorraad, en te controleren voordat hij ergens naartoe gaat.
- **Albert Heijn-koppeling** — **stuur** de gecontroleerde boodschappenlijst rechtstreeks naar je AH-winkelmandje, gematcht aan echte producten.
- **AI-chat** — **vraag** de chat een recept toe te voegen vanaf een link, te loggen wat je net hebt gekookt, te checken wat er bijna op is, of de boodschappenlijst voor volgende week samen te stellen. De chat heeft toegang tot alle functies hierboven.
- **Instellingen** — **wissel** van AI-model (elk model op OpenRouter werkt), **stel** een dagelijks uitgavenplafond in, **koppel** Albert Heijn, en **beschrijf** je huishouden zodat de AI context heeft.

## Hosting

Hieronder staan drie manieren om Keukenbrein te draaien, plus een uitleg waarom Vercel niet werkt.

### Railway

Railway is de optie zonder technische rompslomp: je volgt de stappen, en Railway bouwt en host de app voor je vanuit dezelfde Docker-container die hieronder bij "Zelf hosten met een persistent volume" staat beschreven. Je hoeft zelf geen server te beheren.

1. **Maak** een account op [railway.com](https://railway.com).
2. **Maak** een nieuw project en **kies** "Deploy from GitHub repo." **Wijs** naar je eigen fork van deze repository, of naar `https://github.com/freekmetsch/kitchenbrain` als je zelf niet wijzigt. Railway herkent de `Dockerfile` in de repository automatisch.
3. **Voeg** een volume toe aan de service (in de service-instellingen, onder "Volumes") en **koppel** het aan het pad `/data`. Hier bewaart de app de database, de receptfoto's en het Albert Heijn-token; zonder dit volume gaat alles verloren bij elke nieuwe deploy.
4. **Zet** de omgevingsvariabelen uit `.env.example` klaar bij de service, onder "Variables" — minstens `OPENROUTER_API_KEY` en `HOUSEHOLD_USERS`, plus `DATABASE_URL=/data/v2.db`, `RECIPE_IMAGES_DIR=/data/recipe_images` en `AH_TOKEN_FILE=/data/ah_tokens.json` zodat ze allemaal naar het volume van stap 3 wijzen. Zonder die laatste variabele verdwijnt je Albert Heijn-token bij elke nieuwe deploy.
5. Railway **deployt** de app automatisch en geeft je een publieke URL. **Log in** met een van de gebruikers uit `HOUSEHOLD_USERS`.

### Zelf hosten met een persistent volume

Elk platform dat een blijvende schijf (een persistent volume, een schijf die een herstart overleeft) aanbiedt en een langlopend Node-proces kan draaien, werkt hiervoor: Docker Compose op een VPS, Fly.io, Render, of vergelijkbare hosts. Het is dezelfde container als bij Railway, alleen op een ander adres.

### Alleen op je eigen computer

Als je de app alleen voor jezelf wilt draaien, zonder hem te delen met de rest van het huishouden, hoef je niets te hosten. **Draai** `npm install && npm run dev` en **open** `http://localhost:5173`, of **draai** `docker compose up` en **open** `http://localhost:3000`. Er is niets om te deployen en niets dat blootstaat aan het internet.

### Waarom Vercel (en vergelijkbare serverless platforms) niet werkt

Keukenbrein bewaart zijn gegevens in een SQLite-bestand, plus een lokale map voor receptfoto's en het Albert Heijn-inlogtoken. Serverless functies op Vercel hebben geen blijvend, gedeeld bestandssysteem: alles wat tijdens één request naar schijf wordt geschreven, is bij het volgende request weg, of onzichtbaar voor een andere serverinstantie die het request afhandelt. Om Keukenbrein op Vercel te laten werken, zou SQLite moeten worden vervangen door een gehoste database, en de lokale opslag van foto's en tokens door iets als een object-storage bucket. Dat is een echte herbouw, geen configuratiewijziging, en valt buiten de scope van dit project.

## Aan de slag

Deze stappen zetten de app op met Docker, de aanbevolen manier om te beginnen.

1. **Installeer** Docker Desktop (het programma dat de app in een afgesloten "container" draait, zodat je zelf geen Node.js of andere afhankelijkheden hoeft te installeren): [docker.com/get-started](https://www.docker.com/get-started/).
2. **Installeer** Git (het programma waarmee je een kopie van de broncode ophaalt): [git-scm.com/downloads](https://git-scm.com/downloads).
3. **Open** een terminal (een tekstvenster waarin je opdrachten typt in plaats van te klikken) en **clone** de repository (download een kopie van de broncode naar je computer):
   ```
   git clone https://github.com/freekmetsch/kitchenbrain
   cd kitchenbrain
   ```
4. **Kopieer** het environment-bestand (een bestand met instellingen en sleutels die alleen jouw eigen exemplaar van de app nodig heeft, zoals API-sleutels en inlogwachtwoorden; het staat los van de broncode zodat je het nooit per ongeluk deelt):
   ```
   cp .env.example .env
   ```
5. **Open** `.env` in een teksteditor en **vul** minstens `OPENROUTER_API_KEY` in (een gratis account op [openrouter.ai/keys](https://openrouter.ai/keys) geeft je deze sleutel) en `HOUSEHOLD_USERS`.
6. **Start** de container:
   ```
   docker compose up -d
   ```
7. **Open** `http://localhost:3000` in je browser en **log in** met een van de gebruikers uit `HOUSEHOLD_USERS`.

De compose-configuratie bewaart de database, de receptfoto's en de Albert Heijn-tokens allemaal in hetzelfde `data`-volume. `docker compose down` en weer `up` raakt dus niets kwijt.

## Lokaal ontwikkelen

Voor wie aan de code zelf wil werken, in plaats van de kant-en-klare container te draaien:

```
git clone https://github.com/freekmetsch/kitchenbrain
cd kitchenbrain
cp .env.example .env
npm install
npm run dev
```

**Open** `http://localhost:5173`. **Draai** `npm run check` en `npm run test:unit` voordat je een pull request opent; beide zijn gratis, zonder netwerkverkeer en zonder API-kosten.

## Albert Heijn koppelen

De inlogflow van Albert Heijn is gebouwd voor hun eigen app, niet voor een browsertab die met een externe server praat. Daarom is er een eenmalig script in plaats van een knop in de app. **Zie** [`scripts/CONNECT_AH.md`](scripts/CONNECT_AH.md) voor de volledige uitleg; het kost ongeveer twee minuten.

Dit is een niet-officiële koppeling: ze werkt vandaag omdat ze nabootst wat de Albert Heijn-app zelf doet, en kan stoppen met werken zodra Albert Heijn iets aan hun kant verandert. Ze is gebouwd voor persoonlijk gebruik door één huishouden, niet als infrastructuur waar andere systemen van afhankelijk zijn.

## AI configureren

Elke chatbeurt en elke achtergrondtaak loopt via [OpenRouter](https://openrouter.ai/keys), dus je gebruikt je eigen sleutel; de app zelf brengt geen AI-kosten mee. De standaardinstellingen wijzen naar een klein aantal goedkope, snelle modellen. Zodra de app draait, zijn alle vier de modelrollen (chat, fallback, vision, achtergrond) aan te passen via Instellingen, zonder opnieuw te hoeven deployen. `PWA_DAILY_EUR_CAP` en `PWA_BACKGROUND_DAILY_EUR_CAP` begrenzen wat de kosten op een slechte dag maximaal kunnen oplopen.

## Onderhoud

Dit project wordt onderhouden in de tijd die overblijft naast het gebruik ervan. Issues en pull requests zijn welkom (zie [CONTRIBUTING.md](CONTRIBUTING.md)), maar reviews kunnen even duren, en de Albert Heijn-koppeling in het bijzonder kan achterlopen op de eigen app van Albert Heijn.

## Licentie

MIT — zie [LICENSE](LICENSE).

---

# Keukenbrein

Keukenbrein (Dutch for "kitchen brain") is a self-hosted app for groceries, meal planning, recipes, and freezer inventory, with an AI chat assistant and a direct push into Albert Heijn's (a Dutch supermarket) online shopping basket. The app is built for a single household: no multi-tenant login, no subscription, just an app you host and manage yourself.

Recipes and a meal plan feed a shopping list. That shopping list pushes straight into the Albert Heijn basket. The AI chat handles the fiddly parts: **add** a recipe from a URL, **log** what is in the freezer, or **ask** what to cook with what is already in the house.

The Albert Heijn integration is unofficial: it mimics what the Albert Heijn app itself does, rather than using an API Albert Heijn provides for this purpose. It can stop working the moment Albert Heijn changes something on their end. More on that further down, under "Connecting Albert Heijn."

This project is self-hosted only; it is not offered as a hosted service. Albert Heijn does not provide an official API for this kind of integration, so this app talks to the same unofficial mobile API the Albert Heijn app itself uses. Building shared, multi-tenant infrastructure around an integration Albert Heijn could change at any time is not a solid foundation for a service meant to run for multiple households at once. Hence the choice made here: a generic version of the same app, released for self-hosting with your own AI key (bring your own key).

## What's in here

- **Recipes** — stored with Dutch ingredient names (needed to match products at Albert Heijn), plus an English display translation; **import** a recipe straight from a URL.
- **Meal plan** — a rolling calendar you fill from your recipe list; cooked meals log automatically to a history.
- **Inventory** — tracks what is actually in the fridge, pantry, and freezer, including freezer staples you always want in stock.
- **Shopping list** — built from the meal plan and the gaps in your inventory, and reviewed before it goes anywhere.
- **Albert Heijn push** — **send** the reviewed shopping list straight into your Albert Heijn basket, matched to real products.
- **AI chat** — **ask** it to add a recipe from a link, log what you just cooked, check what's running low, or build next week's shopping list. It has access to every feature above.
- **Settings** — **switch** AI models (any model on OpenRouter works), **set** a daily spend cap, **connect** Albert Heijn, and **describe** your household so the AI has context.

## Hosting

Below are three ways to run Keukenbrein, plus an explanation of why Vercel does not work.

### Railway

Railway is the option that needs no technical setup beyond following the steps: Railway builds and hosts the app from the same Docker container described under "Self-host anywhere with a persistent volume" below. There is no server for you to manage yourself.

1. **Create** an account at [railway.com](https://railway.com).
2. **Create** a new project and **choose** "Deploy from GitHub repo." **Point** it at your own fork of this repository, or at `https://github.com/freekmetsch/kitchenbrain` if you are not changing anything yourself. Railway detects the `Dockerfile` in the repository automatically.
3. **Add** a volume to the service (in the service settings, under "Volumes") and **mount** it at the path `/data`. This is where the app keeps the database, the recipe photos, and the Albert Heijn token; without this volume, everything is lost on every new deploy.
4. **Set** the environment variables from `.env.example` on the service, under "Variables" — at least `OPENROUTER_API_KEY` and `HOUSEHOLD_USERS`, plus `DATABASE_URL=/data/v2.db`, `RECIPE_IMAGES_DIR=/data/recipe_images`, and `AH_TOKEN_FILE=/data/ah_tokens.json` so they all point at the volume from step 3. Without that last variable, your Albert Heijn token is lost on every new deploy.
5. Railway **deploys** the app automatically and gives you a public URL. **Log in** with one of the users from `HOUSEHOLD_USERS`.

### Self-host anywhere with a persistent volume

Any platform that offers a persistent volume (a disk that survives restarts) and can run a long-lived Node process works: Docker Compose on a VPS, Fly.io, Render, or similar hosts. It is the same container as the Railway option, just at a different address.

### Just run it on your own computer

If you only want to run the app for yourself, without sharing it with the rest of the household, there is nothing to deploy. **Run** `npm install && npm run dev` and **open** `http://localhost:5173`, or **run** `docker compose up` and **open** `http://localhost:3000`. Nothing gets deployed and nothing is exposed to the internet.

### Why Vercel (and similar serverless platforms) do not work

Keukenbrein keeps its data in a SQLite file, plus a local folder for recipe photos and the Albert Heijn login token. Serverless functions on Vercel have no persistent, shared filesystem: anything written to disk during one request is gone by the next request, or invisible to a different server instance handling it. Making this app work on Vercel would mean swapping SQLite for a hosted database, and the local photo and token storage for something like an object-storage bucket. That is a real rework, not a configuration change, and it is out of scope for this project.

## Getting started

These steps set up the app with Docker, the recommended way to begin.

1. **Install** Docker Desktop (the program that runs the app inside a self-contained "container," so you never install Node.js or any dependencies directly on your own computer): [docker.com/get-started](https://www.docker.com/get-started/).
2. **Install** Git (the program that fetches a copy of the project's code): [git-scm.com/downloads](https://git-scm.com/downloads).
3. **Open** a terminal (a text-based window for typing commands instead of clicking) and **clone** the repository (download a copy of the project's code to your computer):
   ```
   git clone https://github.com/freekmetsch/kitchenbrain
   cd kitchenbrain
   ```
4. **Copy** the environment file (a file holding settings and keys that only your own copy of the app needs, like API keys and login passwords, kept separate from the code so you never accidentally share it):
   ```
   cp .env.example .env
   ```
5. **Open** `.env` in a text editor and **fill in** at least `OPENROUTER_API_KEY` (a free account at [openrouter.ai/keys](https://openrouter.ai/keys) gets you this key) and `HOUSEHOLD_USERS`.
6. **Start** the container:
   ```
   docker compose up -d
   ```
7. **Open** `http://localhost:3000` in your browser and **log in** with one of the users from `HOUSEHOLD_USERS`.

The compose configuration keeps the database, the recipe photos, and the Albert Heijn tokens together in the same `data` volume, so `docker compose down` and back up again loses nothing.

## Local development

For working on the code itself, rather than running the ready-made container:

```
git clone https://github.com/freekmetsch/kitchenbrain
cd kitchenbrain
cp .env.example .env
npm install
npm run dev
```

**Open** `http://localhost:5173`. **Run** `npm run check` and `npm run test:unit` before opening a pull request; both are free, with no network calls and no API cost.

## Connecting Albert Heijn

Albert Heijn's login flow is built for their own app, not for a browser tab talking to a third-party server, so there is a one-time script instead of a button inside the app. **See** [`scripts/CONNECT_AH.md`](scripts/CONNECT_AH.md) for the full walkthrough; it takes about two minutes.

This is an unofficial integration: it works today because it mimics what the Albert Heijn app itself does, and it can stop working the day Albert Heijn changes something on their end. It is built for personal use by a single household, not as infrastructure other systems depend on.

## Configuring the AI

Every chat turn and background job runs through [OpenRouter](https://openrouter.ai/keys), so you bring your own key; there is no AI cost bundled with the app. The defaults point at a small set of cheap, fast models. Once the app is running, all four model roles (chat, fallback, vision, background) are editable from Settings, with no redeploy needed. `PWA_DAILY_EUR_CAP` and `PWA_BACKGROUND_DAILY_EUR_CAP` cap how much a bad day can cost.

## Maintenance

This project is maintained in whatever time is left over alongside actually using it and other work. Issues and pull requests are welcome (see [CONTRIBUTING.md](CONTRIBUTING.md)), but reviews can take a while, and the Albert Heijn integration in particular may lag behind changes to Albert Heijn's own app.

## License

MIT — see [LICENSE](LICENSE).
