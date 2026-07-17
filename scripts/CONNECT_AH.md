# Albert Heijn koppelen

Dit koppelt je huishouden aan je Albert Heijn-account, zodat de app een boodschappenlijst rechtstreeks naar de Albert Heijn-app op je telefoon kan sturen. Je doet dit één keer. Daarna houdt de app de koppeling zelf in stand, en heb je dit alleen opnieuw nodig als de koppeling ooit wordt verbroken.

## Waarom het een script is en geen knop in de app

De inlogflow van Albert Heijn is gebouwd voor hun eigen app, niet voor andere tools. Ze toont een captcha en stuurt een code per e-mail of sms zodra ze een nieuw apparaat ziet, zodat er altijd een echt mens bij de inlogpagina moet zijn om erdoorheen te komen. Een knop in deze app kan dat niet betrouwbaar afhandelen: de captcha laadt niet in een gewone browsertab. Een klein script dat voor die ene inlogstap een schone browser opent, werkt wel elke keer, en dat is dan ook wat je draait.

**Let op:** het script praat alleen met Albert Heijn tijdens die ene login. Het bewaart je AH-wachtwoord nooit. Het vangt een inlogtoken op en geeft dat token door aan de app.

## Wat je nodig hebt (eenmalig)

Python op je computer, daarna:

```
pip install playwright httpx
playwright install chromium
```

## Koppelen (de eenvoudige manier)

1. **Draai** het script vanuit de projectmap:
   ```
   python scripts/ah_local_login.py
   ```
   Als je app niet op het standaardadres draait, **wijs** het script naar je eigen adres:
   `python scripts/ah_local_login.py --app-url https://jouw-app-adres`
2. Er opent een browservenster op de inlogpagina van Albert Heijn. **Log in** zoals je normaal zou doen; hier gebeuren de captcha en de gemailde of getexte code. Het venster sluit zichzelf zodra je erdoorheen bent.
3. Het script kopieert een kort token naar je klembord en meldt dat.
4. **Open** de app, **ga** naar **Instellingen → Albert Heijn**, klik **Albert Heijn verbinden**, en tik dan op **Token plakken & verbinden**. De app leest de token van je klembord, controleert hem en toont "Connected as \<jouw naam\>". Dat is de laatste stap — je hoeft niets zelf te selecteren of te plakken.

Lukt het lezen van het klembord niet (sommige browsers blokkeren dat), klik dan op **Plak hem handmatig** en plak de hele regel — inclusief de `{` en `}` — in het vak.

Er wordt nooit een wachtwoord in de terminal getypt. Eén tik in de app is de hele afronding.

## Automatisch koppelen (optioneel)

Als je liever niet plakt, of een AI-agent dit voor je wilt laten doen, **geef** het script je **app**-wachtwoord mee via een environment-variabele (het wachtwoord waarmee je op deze app inlogt, niet je Albert Heijn-wachtwoord). Het script logt dan zelf in op de app en voltooit de koppeling:

```
# macOS / Linux
HB_APP_PASSWORD='jouw-app-wachtwoord' python scripts/ah_local_login.py

# Windows PowerShell
$env:HB_APP_PASSWORD='jouw-app-wachtwoord'; python scripts/ah_local_login.py
```

De Albert Heijn-login in de browser doe je nog steeds zelf. Alleen de laatste stap wordt automatisch: bij succes print het script "Connected as \<jouw naam\>" en is er niets meer te plakken.

**Tip:** als je wachtwoorden in een wachtwoordmanager bewaart (1Password, Bitwarden), **haal** de waarde daar dan vandaan in plaats van hem te typen, zodat hij niet in je shell-geschiedenis belandt.

## Voor een AI-agent

Ben je een AI-agent die dit voor iemand instelt?

1. De Albert Heijn-login heeft een mens nodig. Je kunt de captcha niet oplossen en de gemailde code niet lezen, dus **vraag** de persoon om de browserlogin af te ronden zodra die opent.
2. **Kies** bij voorkeur de automatische route: **stel** `HB_APP_PASSWORD` in op het app-wachtwoord van de persoon en **draai** `python scripts/ah_local_login.py --app-url <hun app-adres>`. **Meld** de regel "Connected as …" die het script print; dat is de bevestiging.
3. Heb je het app-wachtwoord niet, **draai** dan `python scripts/ah_local_login.py --print-only`, **vang** het token op dat op stdout wordt geprint, en **vertel** de persoon dat token te plakken in Instellingen → Albert Heijn. Je kunt die pagina niet voor hen bereiken; daar is hun eigen login voor nodig.
4. Het token is eenmalig te gebruiken. Mislukt een koppeling, **hergebruik** het geprinte token dan niet; **draai** het script opnieuw voor een verse login.

## Als het niet werkt

- **"App rejected the tokens" / "run again".** Het token is eenmalig te gebruiken, en de app vervangt het zodra de koppeling lukt, dus een oud token werkt geen tweede keer. **Draai** het script opnieuw voor een verse login.
- **Je hebt geplakt, maar er gebeurde niets.** **Plak** de hele regel, inclusief de `{` en `}`. Het vak verwacht precies de regel die het script printte.
- **De browser opende, maar er kwam geen token terug.** De login is niet afgerond, of het venster werd te vroeg gesloten. **Draai** het opnieuw en log volledig in.

Albert Heijn biedt geen officiële manier om dit te doen, dus het kan kapotgaan als ze hun login veranderen. Als het op een dag stopt met werken, is dat meestal de reden.

---

# Connecting Albert Heijn

This links your household to your Albert Heijn account, so the app can send a shopping list straight to the Albert Heijn app on your phone. You do this once. After that, the app keeps the connection alive on its own, and you will not need this again unless it ever gets disconnected.

## Why it's a script and not a button in the app

Albert Heijn's login is built for their own app, not for other tools. It shows a captcha and emails or texts a code whenever it sees a new device, so a real person has to be at the login page to get through. A button inside this app cannot handle that reliably: the captcha does not load in an ordinary browser tab. A small script that opens a clean browser for that one login step works every time, so that is what you run.

**Note:** the script only talks to Albert Heijn during that login. It never stores your Albert Heijn password. It captures a login token and hands that token to the app.

## What you need (once)

Python on your computer, then:

```
pip install playwright httpx
playwright install chromium
```

## Connect it (the simple way)

1. **Run** the script from the project folder:
   ```
   python scripts/ah_local_login.py
   ```
   If your app is not at the default address, **point** it at your own:
   `python scripts/ah_local_login.py --app-url https://your-app-url`
2. A browser window opens on the Albert Heijn login page. **Log in** the way you normally would; this is where the captcha and the emailed or texted code happen. The window closes itself once you are through.
3. The script copies a short token to your clipboard and says so.
4. **Open** the app, **go to** Settings → Albert Heijn, click **Connect Albert Heijn**, then tap **Paste token & connect**. The app reads the token from your clipboard, checks it, and shows "Connected as \<your name\>." That is the last step — nothing to select or paste by hand.

If the browser won't let the app read the clipboard (some do block it), click **Paste it manually instead** and paste the whole line — including the `{` and `}` — into the box.

No password is ever typed into the terminal. One tap in the app is the whole finish.

## Connect it automatically (optional)

If you would rather not paste, or you want an AI agent to do this for you, **give** the script your **app** login password through an environment variable (the one you sign in to this app with, not your Albert Heijn password). It then logs into the app and connects for you:

```
# macOS / Linux
HB_APP_PASSWORD='your-app-password' python scripts/ah_local_login.py

# Windows PowerShell
$env:HB_APP_PASSWORD='your-app-password'; python scripts/ah_local_login.py
```

You still do the Albert Heijn login in the browser. Only the last step becomes automatic: on success it prints "Connected as \<your name\>" and there is nothing to paste.

**Pro tip:** if you keep passwords in a manager (1Password, Bitwarden), **read** the value from there rather than typing it into your shell, so it does not land in your shell history.

## For an AI agent

If you are an AI agent setting this up for someone:

1. The Albert Heijn login needs a human. You cannot solve the captcha or read the emailed code, so **ask** the person to complete the browser login when it opens.
2. **Prefer** the automatic path: **set** `HB_APP_PASSWORD` to the person's app password and **run** `python scripts/ah_local_login.py --app-url <their app url>`. **Report** the "Connected as …" line it prints; that is the confirmation.
3. If you do not have the app password, **run** `python scripts/ah_local_login.py --print-only`, **capture** the token it prints on stdout, and **tell** the person to paste it into Settings → Albert Heijn. You cannot reach that page for them; it needs their login.
4. The token is one-shot. If a connect fails, **do not reuse** the printed token; **run** the script again for a fresh login.

## When it doesn't work

- **"App rejected the tokens" / "run again."** The token is single-use, and the app rotates it the moment it connects, so an old one will not work twice. **Run** the script again for a fresh login.
- **You pasted it but nothing happened.** **Paste** the whole line, including the `{` and `}`. The box expects the exact line the script printed.
- **The browser opened but no token came back.** The login did not finish, or the window was closed too early. **Run** it again and log in fully.

Albert Heijn does not offer an official way to do this, so it can break if they change their login. If it stops working one day, that is usually why.
