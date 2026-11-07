"""LAN PIN gate for Spoolman; Caddy handles HTTP and WebSocket proxying."""
from __future__ import annotations

import hashlib
import hmac
import ipaddress
import json
import re
import secrets
import sqlite3
import threading
import time
from datetime import timedelta
from pathlib import Path
from urllib.parse import quote, urlsplit

from flask import Flask, abort, redirect, render_template_string, request, session

HOSTS = {"192.168.2.213:7916"}
LAN = ipaddress.ip_network("192.168.2.0/24")
COOKIE = "nextquest_pin_session"
LOGIN_HTML = """<!doctype html><html lang=de><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>{{ brand }} – Anmeldung</title><style>body{font:16px system-ui;background:#f4efe9;color:#332b26;min-height:100vh;display:grid;place-items:center;margin:0}.box{background:#fffaf5;padding:2rem;border-radius:1rem;box-shadow:0 8px 30px #30251b20;width:min(88vw,24rem)}h1{font-size:1.4rem}input,button{box-sizing:border-box;width:100%;padding:.8rem;margin-top:.7rem;border-radius:.6rem;border:1px solid #c9bdb2;font:inherit}button{background:#a85438;color:white;border:0;cursor:pointer}.err{color:#a32222}</style><main class=box><h1>{{ brand }}</h1><p>Bitte mit deiner Cockpit-PIN anmelden.</p>{% if error %}<p class=err>{{ error }}</p>{% endif %}<form method=post action='/_auth/login'><input type=hidden name=csrf value='{{ csrf }}'><input type=hidden name=next value='{{ next }}'><label>PIN / Passwort<input type=password name=pin autocomplete=current-password required autofocus></label><button type=submit>Anmelden</button></form></main></html>"""


def _client_ip() -> ipaddress.IPv4Address | ipaddress.IPv6Address:
    raw = request.remote_addr or ""
    # The gate binds to loopback. Caddy overwrites this private hop header from the
    # actual socket peer; never trust a client-supplied forwarding header directly.
    if ipaddress.ip_address(raw).is_loopback and request.headers.get("X-Client-IP"):
        raw = request.headers["X-Client-IP"].strip()
    return ipaddress.ip_address(raw)


def _safe_return(value: str) -> str:
    if (not value.startswith("/") or value.startswith("//") or "\\" in value
            or any(ord(c) < 32 or ord(c) == 127 for c in value)):
        return "/"
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc:
        return "/"
    return value


def create_app(auth: dict, *, rate_path: str | Path = ":memory:", hosts: set[str] | None = None) -> Flask:
    app = Flask(__name__)
    app.secret_key = hmac.digest(auth["session_secret"].encode(), b"nextquest-pin-session-v1", "sha256")
    app.config.update(
        SESSION_COOKIE_NAME=COOKIE,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Strict",
        SESSION_COOKIE_SECURE=False,  # HTTP only on the trusted LAN, matching the existing AdGuard PIN gate.
        PERMANENT_SESSION_LIFETIME=timedelta(hours=2),
        MAX_CONTENT_LENGTH=8192,
    )
    allowed_hosts = hosts or HOSTS
    db = sqlite3.connect(str(rate_path), check_same_thread=False)
    db.execute("CREATE TABLE IF NOT EXISTS failures (ip TEXT NOT NULL, at REAL NOT NULL)")
    db.commit()
    lock = threading.Lock()

    @app.before_request
    def guard():
        external_host = request.headers.get("X-Original-Host", request.host)
        if external_host not in allowed_hosts:
            abort(403)
        try:
            addr = _client_ip()
        except ValueError:
            abort(403)
        if not (addr.is_loopback or addr in LAN):
            abort(403)
        origin = request.headers.get("Origin")
        if origin and origin != "http://" + external_host:
            abort(403)
        if request.headers.get("Sec-Fetch-Site") not in (None, "none", "same-origin"):
            abort(403)
        if request.endpoint == "verify":
            if request.headers.get("X-Forwarded-Method", "GET").upper() not in ("GET", "HEAD", "OPTIONS"):
                if origin != "http://" + external_host:
                    abort(403)
            if not session.get("authenticated"):
                next_url = _safe_return(request.headers.get("X-Forwarded-Uri", "/"))
                return redirect("/_auth/login?next=" + quote(next_url, safe="/"), code=302)
            return ("", 204)
        if request.endpoint not in ("login", "logout"):
            abort(404)
        if request.endpoint == "logout" and not session.get("authenticated"):
            return redirect("/_auth/login")
        if request.method == "POST":
            if origin != "http://" + external_host or request.headers.get("Sec-Fetch-Site") not in (None, "same-origin"):
                abort(403)
            candidate = request.form.get("csrf", "")
            if not candidate or not session.get("csrf") or not hmac.compare_digest(candidate, session["csrf"]):
                abort(403)

    @app.after_request
    def security(response):
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
        return response

    @app.route("/_auth/login", methods=["GET", "POST"])
    def login():
        next_url = _safe_return(request.values.get("next", "/"))
        brand = "NextQuest"
        error = None
        status = 200
        if request.method == "POST":
            ip = str(_client_ip())
            with lock, db:
                now = time.time()
                db.execute("DELETE FROM failures WHERE at < ?", (now - 900,))
                total = db.execute("SELECT COUNT(*) FROM failures").fetchone()[0]
                own = db.execute("SELECT COUNT(*) FROM failures WHERE ip = ?", (ip,)).fetchone()[0]
                if own >= 5 or total >= 60:
                    return render_template_string(LOGIN_HTML, csrf=session.setdefault("csrf", secrets.token_urlsafe(32)), next=next_url, error="Zu viele Versuche. Bitte 15 Minuten warten.", brand=brand), 429
                candidate = request.form.get("pin", "")
                try:
                    valid = len(candidate) <= 128 and hmac.compare_digest(
                        hashlib.scrypt(candidate.encode(), salt=bytes.fromhex(auth["pin_salt"]), n=2**14, r=8, p=1, dklen=32).hex(),
                        auth["pin_hash"],
                    )
                except (ValueError, KeyError):
                    valid = False
                if valid:
                    db.execute("DELETE FROM failures WHERE ip = ?", (ip,))
                    session.clear()
                    session.update(authenticated=True, csrf=secrets.token_urlsafe(32))
                    session.permanent = True
                    return redirect(next_url)
                db.execute("INSERT INTO failures VALUES (?, ?)", (ip, now))
                error = "PIN/Passwort stimmt nicht."
                status = 401
        csrf = session.setdefault("csrf", secrets.token_urlsafe(32))
        return render_template_string(LOGIN_HTML, csrf=csrf, next=next_url, error=error, brand=brand), status

    @app.post("/_auth/logout")
    def logout():
        session.clear()
        return redirect("/_auth/login")

    @app.get("/_auth/verify")
    def verify():
        # Authentication and redirect handling happen in before_request.
        return ("", 204)

    return app


def runtime() -> Flask:
    auth_path = Path.home() / ".config/hermes-secrets/nova_cockpit_auth.json"
    auth = json.loads(auth_path.read_text())
    return create_app(auth, rate_path=Path.home() / "nextquest/deploy/state/login.sqlite3")


if __name__ == "__main__":
    from waitress import serve
    serve(runtime(), listen="127.0.0.1:7917", threads=6, clear_untrusted_proxy_headers=True, max_request_body_size=8192)
