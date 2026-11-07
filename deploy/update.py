#!/usr/bin/env python3
"""Update a native NextQuest installation with a verified rollback point."""
import argparse
from contextlib import closing
import datetime as dt
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import tempfile
import threading
import time

import backup
import monitor

REPOSITORY = 'https://github.com/Strugglechen1337/NextQuest.git'


def run_command(args, cwd=None):
    result = subprocess.run(args, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            text=True, timeout=1800, check=False)
    if result.returncode:
        raise RuntimeError('Befehl fehlgeschlagen: ' + ' '.join(args[:3]))
    return result.stdout.strip()


def timestamp():
    return dt.datetime.now(dt.timezone.utc).isoformat().replace('+00:00', 'Z')


def counts(path):
    uri = Path(path).resolve().as_uri() + '?mode=ro'
    with closing(sqlite3.connect(uri, uri=True)) as connection:
        return tuple(connection.execute('SELECT COUNT(*) FROM ' + table).fetchone()[0]
                     for table in ('games', 'ownerships'))


class Updater:
    def __init__(self, root, directory, run=run_command, fetch=monitor.get_json,
                 sleep=time.sleep, snapshot=backup.backup, check=monitor.availability,
                 notify=monitor.send, db=None):
        self.root = Path(root)
        self.directory = Path(directory)
        self.run, self.fetch, self.sleep = run, fetch, sleep
        self.snapshot, self.check, self.notify = snapshot, check, notify
        self.db = Path(db or backup.DB)
        self.status = {'state': 'running', 'step': '', 'from': '', 'to': '',
                       'startedAt': timestamp(), 'endedAt': None, 'source': 'manual',
                       'message': '', 'log': []}

    def publish(self, step, state=None, message=''):
        self.status.update(step=step, message=message)
        if state:
            self.status.update(state=state, endedAt=timestamp())
        self.status['log'] = (self.status['log'] + [step + (': ' + message if message else '')])[-50:]
        self.atomic_write(self.directory / 'status.json', json.dumps(self.status, ensure_ascii=False))

    @staticmethod
    def atomic_write(path, content):
        fd, name = tempfile.mkstemp(prefix='.update-', dir=path.parent)
        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as output:
                output.write(content)
                output.flush()
                os.fsync(output.fileno())
            os.replace(name, path)
        finally:
            Path(name).unlink(missing_ok=True)

    def git(self, *args):
        return self.run(['git', *args], cwd=self.root)

    def service(self, action):
        self.run(['systemctl', '--user', action, 'nextquest.service'])

    def set_commit(self, sha):
        self.atomic_write(self.directory / 'app.env', 'NEXTQUEST_COMMIT=' + sha + '\n')

    def verify(self, before):
        for attempt in range(13):
            try:
                if self.fetch('/api/health').get('ok') is True:
                    break
            except Exception:
                pass
            if attempt == 12:
                raise RuntimeError('Gesundheitsprüfung fehlgeschlagen')
            self.sleep(5)
        problems = self.check()
        if problems:
            raise RuntimeError('Erreichbarkeitsprüfung fehlgeschlagen: ' + '; '.join(problems))
        if any(after < prior for after, prior in zip(counts(self.db), before)):
            raise RuntimeError('Datenbank enthält weniger Zeilen als vor dem Update')

    def restore_db(self, snapshot):
        # The app is stopped: preserve the failed DB and associated WAL files for diagnosis.
        suffix = '.before-rollback-' + dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
        fd, name = tempfile.mkstemp(prefix='.restore-', dir=self.db.parent)
        os.close(fd)
        try:
            shutil.copyfile(snapshot, name)
            os.chmod(name, 0o600)
            for path in (self.db, Path(str(self.db) + '-wal'), Path(str(self.db) + '-shm')):
                if path.exists():
                    path.rename(Path(str(path) + suffix))
            os.replace(name, self.db)
        finally:
            Path(name).unlink(missing_ok=True)

    def execute(self, auto=False):
        if auto and self.fetch('/api/update').get('auto') is not True:
            return
        self.directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.status['source'] = 'auto' if auto else 'manual'
        with backup.operation_lock():
            self._execute_locked(auto)

    def _execute_locked(self, auto):
        lock = self.directory / 'maintenance.lock'
        active, previous = self.root / '.next', self.directory / 'previous-build'
        candidate = None
        held = switched = advanced = stopped = False
        old = ''
        snapshot = before = None
        heartbeat_stop = threading.Event()
        heartbeat = None
        try:
            if not auto:
                (self.directory / 'request.json').unlink(missing_ok=True)
            fd = os.open(lock, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            held = True
            os.close(fd)
            # The application treats a two-hour-old lock as stale.
            def refresh():
                while not heartbeat_stop.wait(60):
                    try:
                        os.utime(lock, None)
                    except OSError:
                        return
            heartbeat = threading.Thread(target=refresh, daemon=True)
            heartbeat.start()
            self.publish('Warten auf Abgleich')
            for attempt in range(61):
                jobs = self.fetch('/api/jobs')
                if 'running' not in jobs:
                    raise RuntimeError('Jobstatus ungültig')
                if jobs['running'] is None:
                    break
                if attempt == 60:
                    raise RuntimeError('Update verschoben, Abgleich lief')
                self.sleep(30)
            self.publish('Version prüfen')
            old = self.git('rev-parse', 'HEAD')
            self.status['from'] = old
            self.git('fetch', '--no-tags', REPOSITORY, 'main')
            target = self.git('rev-parse', 'FETCH_HEAD')
            self.status['to'] = target
            if old == target:
                self.publish('Abgeschlossen', 'up-to-date', 'Bereits aktuell')
                return
            if self.git('status', '--porcelain', '--untracked-files=normal'):
                raise RuntimeError('Lokale Änderungen im Arbeitsbaum')
            self.git('merge-base', '--is-ancestor', old, target)
            self.publish('Sicherung')
            snapshot = self.snapshot()
            before = counts(snapshot)
            candidate = Path(tempfile.mkdtemp(prefix='nextquest-update-', dir=self.root.parent))
            candidate.rmdir()
            self.git('worktree', 'add', '--detach', str(candidate), target)
            for step, args in [('Abhängigkeiten', ['npm', 'ci', '--ignore-scripts']),
                               ('Tests', ['npm', 'test']), ('Lint', ['npm', 'run', 'lint']),
                               ('Build', ['npm', 'run', 'build'])]:
                self.publish(step)
                self.run(args, cwd=candidate)
            standalone = candidate / '.next/standalone'
            shutil.copytree(candidate / 'public', standalone / 'public', dirs_exist_ok=True)
            shutil.copytree(candidate / '.next/static', standalone / '.next/static', dirs_exist_ok=True)
            self.git('merge', '--ff-only', target)
            advanced = True
            self.publish('Neustart')
            stopped = True
            self.service('stop')
            if previous.exists():
                shutil.rmtree(previous)
            active.rename(previous)
            switched = True
            (candidate / '.next').rename(active)
            self.set_commit(target)
            self.service('start')
            stopped = False
            self.publish('Prüfung')
            self.verify(before)
            self.publish('Abgeschlossen', 'success', 'Update erfolgreich')
        except Exception as exc:
            detail = str(exc)[:1000] or type(exc).__name__
            if switched:
                try:
                    self.publish('Rollback', message=detail)
                    self.service('stop')
                    if active.exists():
                        shutil.rmtree(active)
                    previous.rename(active)
                    self.git('reset', '--hard', old)
                    advanced = False
                    self.set_commit(old)
                    self.restore_db(snapshot)
                    self.service('start')
                    self.verify(before)
                    self.publish('Rollback abgeschlossen', 'rolled-back', detail)
                except Exception as rollback_error:
                    self.publish('Rollback fehlgeschlagen', 'failed', detail + '; Rollback: ' + str(rollback_error)[:500])
            else:
                try:
                    if advanced:
                        self.git('reset', '--hard', old)
                    if stopped:
                        self.service('start')
                except Exception as recovery_error:
                    detail += '; Wiederherstellung: ' + str(recovery_error)[:500]
                self.publish('Update fehlgeschlagen', 'failed', detail)
        finally:
            if candidate and candidate.exists():
                try:
                    self.git('worktree', 'remove', '--force', str(candidate))
                except Exception:
                    pass
            heartbeat_stop.set()
            if heartbeat:
                heartbeat.join()
            if held:
                lock.unlink(missing_ok=True)
            if self.status['state'] in ('failed', 'rolled-back') or (auto and self.status['state'] in ('success', 'up-to-date')):
                try:
                    self.notify('NextQuest-Update: ' + self.status['state'] + ' – ' + self.status['message'])
                except Exception as exc:
                    print('Telegram-Versand fehlgeschlagen:', type(exc).__name__)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--auto', action='store_true')
    args = parser.parse_args()
    updater = Updater(Path.home() / 'nextquest', Path(os.environ['NEXTQUEST_UPDATE_DIR']))
    updater.execute(args.auto)
    if updater.status['state'] in ('failed', 'rolled-back'):
        raise SystemExit(1)


if __name__ == '__main__':
    main()
