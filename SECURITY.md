# Beveiliging

Dit is een zelfstandig onderhouden, zelf te hosten huishoudapp: er is geen beveiligingsteam en geen SLA, maar echte problemen worden serieus genomen.

## Een kwetsbaarheid melden

**Open** geen publiek issue voor iets dat uitgebuit kan worden voordat het is opgelost. **Gebruik** in plaats daarvan de private kwetsbaarheidsmelding van deze repository (tab Security → **Report a vulnerability**). Als die optie niet beschikbaar is, **open** dan een gewoon issue met het verzoek om een privékanaal; daar volgt dan een reactie op.

Een melding wordt binnen een paar dagen bevestigd. Hoe snel iets wordt opgelost, hangt af van de ernst en van de beschikbare tijd; dit is geen gefinancierd project.

## Wat binnen scope valt

- Alles waardoor de gegevens van het ene huishouden bij een andere zelf-gehoste installatie terechtkomen die daar geen toegang toe zou moeten hebben.
- Het omzeilen van authenticatie, fouten in sessieafhandeling, of een manier om als een andere gebruiker binnen hetzelfde huishouden te handelen.
- Een manier waarop de app het Albert Heijn-token, de OpenRouter-sleutel, of andere `.env`-geheimen lekt.

## Wat expliciet buiten scope valt

- De eigen API of accountbeveiliging van Albert Heijn; dit project consumeert die alleen. Problemen aan de kant van Albert Heijn horen bij Albert Heijn gemeld te worden.
- Het feit dat de AH-koppeling niet-officieel en nagebouwd is. Dat staat gedocumenteerd en is geen kwetsbaarheid.
- Problemen die alleen optreden als de app is gedeployed met geheimen die in een publieke repository zijn gecommit, of met een blootgesteld `.env`-bestand. Dat is een deploymentfout, geen codekwetsbaarheid, al is een duidelijkere documentatie op dat punt altijd welkom.

---

# Security

This is a solo-maintained, self-hosted household app: there is no security team and no SLA, but real problems are taken seriously.

## Reporting a vulnerability

**Do not open** a public issue for anything that could be exploited before it is fixed. **Use** this repository's private vulnerability reporting instead (Security tab → **Report a vulnerability**). If that option is not available, **open** a regular issue asking for a private channel, and a reply will follow there.

A report gets acknowledged within a few days. How quickly it gets fixed depends on severity and available time; this is not a funded project.

## What's in scope

- Anything that lets one household's data reach another self-hosted instance that should not have access to it.
- Auth bypass, session handling bugs, or a way to act as another user within the same household.
- A way for the app to leak the Albert Heijn token, the OpenRouter key, or other `.env` secrets.

## What's explicitly out of scope

- Albert Heijn's own API or account security; this project only consumes it. Report Albert Heijn-side issues to Albert Heijn.
- The fact that the Albert Heijn integration is unofficial and reverse-engineered. That is documented, not a vulnerability.
- Issues that only apply when the app has been deployed with secrets committed to a public repository, or with an exposed `.env` file. That is a deployment mistake, not a code vulnerability, though clearer documentation on that point is always welcome.
