#!/usr/bin/env python3
"""Read-only NextQuest checks; use the existing Hermes Telegram transport."""
import datetime as dt
import json
import os
from pathlib import Path
import subprocess
import sys
import urllib.request

from backup import BACKUPS, NAME

BASE = os.environ.get('NEXTQUEST_URL', 'http://127.0.0.1:7918').rstrip('/')
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
    if sys.argv[1:]:
        raise SystemExit('Unbekannte Option')
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
