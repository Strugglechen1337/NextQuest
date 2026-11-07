#!/usr/bin/env python3
"""NextQuest checks; use the existing Hermes Telegram transport."""
import datetime as dt
import fcntl
import http.client
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import urllib.request

from backup import BACKUPS, NAME

BASE = os.environ.get('NEXTQUEST_URL', 'http://127.0.0.1:7918').rstrip('/')
GATE_HOST = '192.168.2.213'
GATE_PORT = 7916
SERVICES = ('nextquest', 'nextquest-gate', 'nextquest-proxy')
STATE_DIR = Path.home() / '.local/state/nextquest-ops'
UTC = dt.timezone.utc


def timestamp(value):
    try:
        parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
        if parsed.tzinfo is None:
            raise ValueError('missing timezone')
        return parsed.astimezone(UTC)
    except (AttributeError, TypeError, ValueError):
        return None


def get_json(path):
    # Bypass environment proxy and never send requests outside the configured origin.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(BASE + path, timeout=10) as response:
        data = response.read(1024 * 1024 + 1)
    if len(data) > 1024 * 1024:
        raise ValueError('Antwort zu groß')
    result = json.loads(data)
    if not isinstance(result, dict):
        raise ValueError('Antwort ist kein Objekt')
    return result


def backup_status(now):
    result = subprocess.run(['systemctl', '--user', 'show', 'nextquest-backup.service',
                             '--property=Result', '--value'], capture_output=True, text=True, timeout=10, check=True).stdout.strip()
    if result != 'success':
        return 'Sicherungsdienst fehlgeschlagen oder noch nicht gelaufen (' + result[:80] + ')'
    try:
        snapshots = [p for p in BACKUPS.iterdir() if NAME.fullmatch(p.name) and not p.is_symlink() and p.is_file()]
        latest = max((p.stat().st_mtime for p in snapshots), default=0)
    except OSError:
        latest = 0
    if now.timestamp() - latest > 26 * 3600 or latest > now.timestamp() + 300:
        return 'Keine aktuelle Sicherung der letzten 26 Stunden gefunden'
    return None


def assess(fetch=get_json, check_backup=backup_status, now=None):
    now = now or dt.datetime.now(UTC)
    alerts = []
    try:
        if fetch('/api/health').get('ok') is not True:
            alerts.append('Gesundheitsprüfung meldet nicht OK')
    except Exception:
        alerts.append('Gesundheitsprüfung nicht erreichbar oder ungültig')
    try:
        status = fetch('/api/jobs')
        last = status.get('last')
        running = status.get('running')
        if not isinstance(last, dict) or last.get('kind') != 'sync-all':
            alerts.append('Letzter Job ist kein sync-all; ein Lauf in den letzten 26 Stunden ist nicht belegbar')
        else:
            started = timestamp(last.get('startedAt'))
            if started is None or not dt.timedelta(0) <= now - started <= dt.timedelta(hours=26):
                alerts.append('Kein nachweisbarer sync-all-Start in den letzten 26 Stunden')
        for job in (last, running):
            if not isinstance(job, dict):
                continue
            if not job.get('endedAt'):
                alerts.append('Job ohne endedAt (läuft möglicherweise noch oder wurde unterbrochen)')
            if job.get('kind') != 'sync-all':
                continue
            platforms = job.get('platforms')
            if not isinstance(platforms, dict):
                alerts.append('sync-all-Plattformstatus fehlt oder ist ungültig')
            else:
                for name, value in platforms.items():
                    if isinstance(value, dict) and value.get('ok') is False:
                        alerts.append(str(name)[:100] + ': Plattform meldet Fehler')
            errors = job.get('errors')
            if isinstance(errors, dict):
                for name in errors:
                    if not isinstance(platforms, dict) or name not in platforms:
                        alerts.append(str(name)[:100] + ': Job meldet Fehler')
        auto = status.get('auto')
        if not isinstance(auto, dict) or auto.get('enabled') is not True:
            alerts.append('Automatischer Abgleich ist deaktiviert oder Status fehlt')
    except Exception:
        alerts.append('Jobstatus nicht erreichbar oder ungültig')
    try:
        settings = fetch('/api/settings')
        expiry = settings.get('psn.refreshExpires')
        if expiry:
            expires = timestamp(expiry)
            if expires is None:
                alerts.append('PlayStation-Ablaufdatum ist ungültig')
            elif expires - now < dt.timedelta(days=7):
                alerts.append('PlayStation-Anmeldung läuft ab bzw. ist abgelaufen: ' + str(expiry)[:80])
    except Exception:
        alerts.append('Einstellungen nicht erreichbar oder ungültig')
    try:
        problem = check_backup(now)
        if problem:
            alerts.append(problem)
    except Exception:
        alerts.append('Sicherungsstatus konnte nicht geprüft werden')
    return list(dict.fromkeys(alerts))


def availability():
    alerts = []
    for service in SERVICES:
        try:
            result = subprocess.run(['systemctl', '--user', 'show', service + '.service',
                                     '--property=ActiveState', '--value'], capture_output=True,
                                    text=True, timeout=10, check=False)
            state = result.stdout.strip()
            if result.returncode:
                alerts.append(service + ': Statusabfrage fehlgeschlagen (systemctl Exit ' + str(result.returncode) + ')')
            elif state != 'active':
                alerts.append(service + ': ' + (state or 'Status fehlt'))
        except (OSError, subprocess.TimeoutExpired) as exc:
            alerts.append(service + ': Statusabfrage fehlgeschlagen (' + type(exc).__name__ + ')')
    connection = http.client.HTTPConnection(GATE_HOST, GATE_PORT, timeout=5)
    try:
        connection.request('GET', '/')
        status = connection.getresponse().status
        if status not in (200, 302):
            alerts.append('Gate ' + GATE_HOST + ':' + str(GATE_PORT) + ': HTTP ' + str(status) + ' (erwartet 200 oder 302)')
    except (OSError, http.client.HTTPException) as exc:
        detail = type(exc).__name__
        if isinstance(exc, OSError) and exc.errno is not None:
            detail += ', errno ' + str(exc.errno)
        if isinstance(exc, socket.timeout):
            detail += ', Zeitüberschreitung'
        alerts.append('Gate ' + GATE_HOST + ':' + str(GATE_PORT) + ': Verbindungsfehler (' + detail + ')')
    finally:
        connection.close()
    return alerts


def notify_availability(check=None):
    # Serialize daily and frequent checks; persist only after confirmed delivery.
    STATE_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    with (STATE_DIR / 'availability.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        alerts = (check or availability)()
        state_file = STATE_DIR / 'availability.json'
        try:
            state = json.loads(state_file.read_text())
        except FileNotFoundError:
            state = {'outage': False}
        if not isinstance(state, dict) or not isinstance(state.get('outage'), bool):
            raise ValueError('Ungültiger Überwachungszustand')
        outage = bool(alerts)
        if outage == state['outage']:
            return
        if outage:
            send('NextQuest-Erreichbarkeit ausgefallen:\n' + '\n'.join('- ' + x for x in alerts))
        else:
            send('NextQuest-Erreichbarkeit wiederhergestellt: Alle drei Dienste aktiv und Gate antwortet.')
        fd, temporary = tempfile.mkstemp(dir=STATE_DIR, prefix='.availability-')
        try:
            with os.fdopen(fd, 'w') as output:
                json.dump({'outage': outage}, output)
            os.replace(temporary, state_file)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)


def send(text):
    scripts = os.environ.get('HERMES_SCRIPTS', str(Path.home() / '.hermes/scripts'))
    sys.path.insert(0, scripts)
    from telegram_ack_button import load_env_file, _post_telegram
    chat = os.environ.get('NEXTQUEST_TELEGRAM_CHAT_ID')
    if not chat or not chat.isdecimal():
        raise RuntimeError('Telegram-Ziel fehlt')
    token = load_env_file().get('TELEGRAM_BOT_TOKEN')
    if not token:
        raise RuntimeError('Telegram-Zugang fehlt')
    result = _post_telegram(token, 'sendMessage', {'chat_id': int(chat), 'text': text,
                            'disable_notification': False, 'disable_web_page_preview': True})
    message = result.get('result', {})
    if not result.get('ok') or str(message.get('chat', {}).get('id')) != chat or message.get('text') != text or not message.get('message_id'):
        raise RuntimeError('Telegram-Versand nicht bestätigt')
    print('Telegram bestätigt, Nachricht-ID:', message['message_id'])


def main():
    if sys.argv[1:] == ['--test-message']:
        send('NextQuest-Überwachung eingerichtet')
        return
    if sys.argv[1:] == ['--check-availability']:
        alerts = availability()
        print('\n'.join(alerts) if alerts else 'Alle drei Dienste aktiv; Gate antwortet mit HTTP 200 oder 302.')
        if alerts:
            raise SystemExit(1)
        return
    if sys.argv[1:] == ['--availability']:
        notify_availability()
        return
    if sys.argv[1:]:
        raise SystemExit('Unbekannte Option')
    notify_availability()
    alerts = assess()
    if alerts:
        send('NextQuest-Überwachung:\n' + '\n'.join('- ' + x for x in alerts)[:3500])
        print('Warnungen:', len(alerts))
    else:
        print('Alle Prüfungen OK; keine Telegram-Nachricht.')


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        # HTTP exceptions may contain the bot token; never print their text.
        print('Überwachung/Versand fehlgeschlagen:', type(exc).__name__, file=sys.stderr)
        sys.exit(1)
