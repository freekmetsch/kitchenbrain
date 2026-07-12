#!/usr/bin/env python3
"""Connect the household app to Albert Heijn — run once, on your own computer.

Albert Heijn's login needs a real person: it shows a captcha and emails or
texts you a code. So this script opens a real browser for that one step,
you log in, and it captures a login token from Albert Heijn. Everything
after that is automatic.

There are two ways to finish, and NEITHER asks you to type a password into
this terminal (that part was unreliable on Windows and is gone):

  1. Paste (the default). The script copies a short token to your clipboard.
     Open the app, go to Settings -> Albert Heijn, and paste it. Done.

  2. Automatic. Set the HB_APP_PASSWORD environment variable to your app
     login password, and the script connects the app for you — no prompt,
     nothing typed here. This is the path an AI agent uses, and the one to
     pick if you'd rather not paste.

Full walkthrough (for a person or an AI agent): scripts/CONNECT_AH.md

First-time setup (once):
    pip install playwright httpx
    playwright install chromium

Usage:
    python scripts/ah_local_login.py                 # log in, copy token, paste into Settings
    python scripts/ah_local_login.py --print-only    # just print/copy the token, do nothing else
    python scripts/ah_local_login.py --app-url http://localhost:5173
    #  automatic connect (bash):  HB_APP_PASSWORD=... python scripts/ah_local_login.py
    #  automatic connect (pwsh):  $env:HB_APP_PASSWORD='...'; python scripts/ah_local_login.py

The token pair is one-shot: the app rotates the refresh token the moment it
connects, so a delivered pair has a single owner. Run this again any time
you need a fresh one.
"""

import argparse
import json
import os
import sys
import urllib.parse

try:
    import httpx
except ImportError:
    print("  [ERROR] httpx not installed. Run: pip install httpx", file=sys.stderr)
    sys.exit(1)

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("  [ERROR] playwright not installed. Run:", file=sys.stderr)
    print("    pip install playwright", file=sys.stderr)
    print("    playwright install chromium", file=sys.stderr)
    sys.exit(1)

AH_API_BASE = "https://api.ah.nl"
CLIENT_ID = "appie-ios"

AH_HEADERS = {
    "User-Agent": "Appie/9.28 (iPhone17,3; iPhone; CPU OS 26_1 like Mac OS X)",
    "Content-Type": "application/json",
    "x-client-name": "appie-ios",
    "x-client-version": "9.28",
    "x-application": "AHWEBSHOP",
}

LOGIN_URL = (
    "https://login.ah.nl/login"
    f"?client_id={CLIENT_ID}"
    "&response_type=code"
    "&redirect_uri=appie://login-exit"
)


DEFAULT_APP_URL = "http://localhost:5173"


def log(msg: str = "") -> None:
    print(msg, file=sys.stderr)


def parse_args():
    ap = argparse.ArgumentParser(description="AH login + connect the household app")
    ap.add_argument("--app-url", default=os.environ.get("HB_APP_URL", DEFAULT_APP_URL),
                    help=f"household app base URL (default: {DEFAULT_APP_URL})")
    ap.add_argument("--app-user", default=os.environ.get("HB_APP_USER"),
                    help="app username to connect as, only used with HB_APP_PASSWORD (no default — "
                         "pass --app-user or set HB_APP_USER)")
    ap.add_argument("--print-only", action="store_true",
                    help="just print/copy the token; never contact the app")
    return ap.parse_args()


def _copy_to_clipboard(text: str) -> bool:
    """Best-effort clipboard copy so the token can be pasted without hand-selecting it."""
    import subprocess

    if sys.platform == "win32":
        cmds = [["clip"]]
    elif sys.platform == "darwin":
        cmds = [["pbcopy"]]
    else:
        cmds = [["xclip", "-selection", "clipboard"], ["xsel", "--clipboard", "--input"]]
    for cmd in cmds:
        try:
            subprocess.run(cmd, input=text.encode("utf-8"), check=True)
            return True
        except Exception:
            continue
    return False


def print_payload(pair: dict) -> None:
    """The manual finish: copy the token and tell the user exactly where it goes."""
    payload = json.dumps(pair)
    copied = _copy_to_clipboard(payload)
    log()
    if copied:
        log("  Copied to your clipboard. Open the app, go to Settings -> Albert Heijn,")
        log("  and paste it there to connect. That's the last step.")
    else:
        log("  Paste the line below into the app, at Settings -> Albert Heijn, to connect:")
    log()
    print(payload)


def deliver_to_app(pair: dict, args, password: str) -> bool:
    """Log in to the household app and hand the pair to /api/settings/ah.

    Only runs when HB_APP_PASSWORD is set. Returns True when the server
    confirms the connection. On any failure the token is still copied and
    printed, so it can be pasted into Settings by hand instead.
    """
    app = args.app_url.rstrip("/")

    with httpx.Client(timeout=30) as client:
        log(f"\n  Connecting {app} as '{args.app_user}'...")
        try:
            resp = client.post(
                f"{app}/login",
                data={"username": args.app_user, "password": password},
                # SvelteKit CSRF check: form POSTs must carry a same-origin Origin header.
                headers={"Origin": app},
            )
        except httpx.HTTPError as e:
            log(f"  [FAIL] Could not reach the app: {e}")
            print_payload(pair)
            return False

        # SvelteKit answers form actions either as a 303 redirect or as an
        # HTTP-200 JSON envelope ({"type":"redirect"|"failure",...}) — the
        # session cookie is the one reliable success signal in both shapes.
        if "session_id" not in resp.cookies:
            log(f"  [FAIL] App login rejected (HTTP {resp.status_code}). Wrong HB_APP_PASSWORD?")
            print_payload(pair)
            return False

        log("  [OK] App login. Validating tokens with Albert Heijn...")
        try:
            resp = client.post(f"{app}/api/settings/ah", json={"payload": json.dumps(pair)})
        except httpx.HTTPError as e:
            log(f"  [FAIL] Connect call failed mid-flight: {e}")
            log("  The token below MAY still work — paste it into Settings;")
            log("  if the app rejects it, just run this script again.")
            print_payload(pair)
            return False

        try:
            verdict = resp.json()
        except ValueError:
            verdict = {}

        if verdict.get("ok"):
            log()
            log(f"  [DONE] Connected as {verdict.get('memberName', '?')} — nothing left to do.")
            return True

        # The server already exercised the refresh token, so the pair is
        # consumed either way — a fresh login run is the only retry path.
        log(f"  [FAIL] {verdict.get('reason', f'App rejected the tokens (HTTP {resp.status_code}).')}")
        log("  Run this script again for a fresh login.")
        return False


def main():
    args = parse_args()
    log()
    log("=" * 55)
    log("  AH Local Login (Playwright)")
    log("=" * 55)
    log()
    log("  Opening browser — log in to Albert Heijn...")
    log("  (the browser will close automatically after login)")
    log()

    auth_code = None

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()

        # Intercept the appie:// redirect — capture the auth code
        def on_request(request):
            nonlocal auth_code
            url = request.url
            if url.startswith("appie://login-exit"):
                parsed = urllib.parse.urlparse(url)
                params = urllib.parse.parse_qs(parsed.query)
                code = params.get("code", [None])[0]
                if code:
                    auth_code = code
                    log("  [OK] Auth code captured!")

        page.on("request", on_request)

        # Also intercept via route in case the request event doesn't fire for custom protocols
        def route_appie(route):
            nonlocal auth_code
            url = route.request.url
            if "code=" in url:
                parsed = urllib.parse.urlparse(url)
                params = urllib.parse.parse_qs(parsed.query)
                code = params.get("code", [None])[0]
                if code:
                    auth_code = code
                    log("  [OK] Auth code captured via route!")
            route.abort()

        page.route("**/appie://**", route_appie)

        # Navigate to AH login
        page.goto(LOGIN_URL)

        # Wait for the auth code to be captured, or for the user to close the browser
        try:
            while auth_code is None:
                # Check if page/browser is still open
                try:
                    page.wait_for_timeout(500)
                except Exception:
                    break
        except KeyboardInterrupt:
            pass

        browser.close()

    if not auth_code:
        log("\n  [FAIL] No auth code captured. Did you complete the login?")
        sys.exit(1)

    # Exchange code for tokens
    log("\n  Exchanging auth code for tokens...")
    with httpx.Client(timeout=10) as client:
        resp = client.post(
            f"{AH_API_BASE}/mobile-auth/v1/auth/token",
            headers=AH_HEADERS,
            json={"clientId": CLIENT_ID, "code": auth_code},
        )
        data = resp.json()

    at = data.get("access_token", "")
    rt = data.get("refresh_token", "")

    if not at or not rt:
        log(f"  [FAIL] Token exchange failed: {json.dumps(data, indent=2)}")
        sys.exit(1)

    log("  [OK] Member tokens received.")

    pair = {"access_token": at, "refresh_token": rt}

    # Two ways to finish, neither types a password into this terminal:
    #   HB_APP_PASSWORD set -> connect the app automatically (agent / power path)
    #   otherwise           -> copy the token and tell the user where to paste it
    password = os.environ.get("HB_APP_PASSWORD")
    if args.print_only or not password:
        if not (args.print_only or password):
            log("\n  HB_APP_PASSWORD is not set — finishing the manual way.")
        print_payload(pair)
        return

    if not args.app_user:
        log("\n  HB_APP_PASSWORD is set but no username given — pass --app-user or set")
        log("  HB_APP_USER to the app login you want to connect as. Finishing manually instead.")
        print_payload(pair)
        return

    if not deliver_to_app(pair, args, password):
        sys.exit(1)


if __name__ == "__main__":
    main()
