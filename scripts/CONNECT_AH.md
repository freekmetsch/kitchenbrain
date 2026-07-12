# Connecting Albert Heijn

This links your household to your Albert Heijn account, so the app can send a
shopping list straight to the AH app on your phone. You do it once. After that
the app keeps the connection alive on its own, and you won't need this again
unless it ever gets disconnected.

## Why it's a script and not a button in the app

Albert Heijn's login is built for their own app, not for other tools. It shows a
captcha and emails or texts you a code whenever it sees a new device, so a real
person has to be at the login page to get through. A button inside this app
can't do that reliably — I tried, and the captcha won't load in an ordinary
browser tab. A small script that opens a clean browser for that one login step
works every time, so that's what you run.

**Note:** the script only talks to Albert Heijn during that login. It never
stores your AH password. It captures a login token and hands that token to the
app.

## What you need (once)

Python on your computer, then:

```
pip install playwright httpx
playwright install chromium
```

## Connect it (the simple way)

1. Run the script from the project folder:
   ```
   python scripts/ah_local_login.py
   ```
   If your app isn't at the default address, point it at your own:
   `python scripts/ah_local_login.py --app-url https://your-app-url`
2. A browser window opens on the Albert Heijn login page. Log in the way you
   normally would — this is where the captcha and the emailed or texted code
   happen. The window closes itself once you're through.
3. The script copies a short token to your clipboard and says so.
4. Open the app, go to **Settings → Albert Heijn**, and paste the token into the
   box. It checks the token and shows "Connected as \<your name\>". That's the
   last step.

No password is ever typed into the terminal. Pasting into the app is the whole
finish.

## Connect it automatically (optional)

If you'd rather not paste, or you want an AI agent to do this for you, give the
script your **app** login password — the one you sign in to this app with, not
your Albert Heijn password — through an environment variable. Then it logs into
the app and connects for you:

```
# macOS / Linux
HB_APP_PASSWORD='your-app-password' python scripts/ah_local_login.py

# Windows PowerShell
$env:HB_APP_PASSWORD='your-app-password'; python scripts/ah_local_login.py
```

You still do the Albert Heijn login in the browser. Only the last step becomes
automatic: on success it prints "Connected as \<your name\>" and there's nothing
to paste.

**Pro tip:** if you keep passwords in a manager (1Password, Bitwarden), read the
value from there rather than typing it into your shell, so it doesn't land in
your shell history.

## For an AI agent

If you're an AI agent setting this up for someone:

1. The Albert Heijn login needs a human. You can't solve the captcha or read the
   emailed code, so ask the person to complete the browser login when it opens.
2. Prefer the automatic path: set `HB_APP_PASSWORD` to the person's app password
   and run `python scripts/ah_local_login.py --app-url <their app url>`. Report
   the "Connected as …" line it prints — that's the confirmation.
3. If you don't have the app password, run
   `python scripts/ah_local_login.py --print-only`, capture the token it prints
   on stdout, and tell the person to paste it into Settings → Albert Heijn. You
   can't reach that page for them; it needs their login.
4. The token is one-shot. If a connect fails, don't reuse the printed token —
   run the script again for a fresh login.

## When it doesn't work

- **"App rejected the tokens" / "run again".** The token is single-use, and the
  app rotates it the moment it connects, so an old one won't work twice. Run the
  script again for a fresh login.
- **You pasted it but nothing happened.** Paste the whole line, including the
  `{` and `}`. The box expects the exact line the script printed.
- **The browser opened but no token came back.** The login didn't finish, or the
  window was closed too early. Run it again and log in fully.

Albert Heijn doesn't offer an official way to do this, so it can break if they
change their login. If it stops working one day, that's usually why.
