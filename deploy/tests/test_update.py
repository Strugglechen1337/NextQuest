import json
import os
from pathlib import Path
import shutil
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import update


class UpdateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.root = self.base / 'repo'
        self.root.mkdir()
        (self.root / '.next').mkdir()
        (self.root / '.next' / 'old').write_text('old')
        self.directory = self.base / 'state'
        self.directory.mkdir(mode=0o700)
        self.db = self.base / 'data.sqlite3'
        with sqlite3.connect(self.db) as con:
            con.execute('CREATE TABLE games (id INTEGER)')
            con.execute('CREATE TABLE ownerships (id INTEGER)')
            con.execute('INSERT INTO games VALUES (1)')
            con.execute('INSERT INTO ownerships VALUES (1)')
        self.backup = self.base / 'snapshot.sqlite3'
        self.calls = []
        self.target = 'b' * 40
        self.old = 'a' * 40
        self.dirty = False
        self.fail_test = False
        self.health_fails = False
        self.health_failure_permanent = False
        self.shrink = False
        self.running = False
        self.active_syncs = 0
        self.enabled = True
        self.notifications = []
        self.sleeps = []
        self.env = patch.dict(os.environ, {'NEXTQUEST_UPDATE_DIR': str(self.directory)})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.updater = update.Updater(self.root, self.directory, run=self.run_command,
                                      fetch=self.fetch, sleep=self.sleeps.append,
                                      snapshot=self.snapshot, check=lambda: [],
                                      notify=self.notifications.append, db=self.db)

    def snapshot(self):
        shutil.copyfile(self.db, self.backup)
        return self.backup

    def fetch(self, path):
        if path == '/api/update':
            return {'auto': self.enabled}
        if path == '/api/jobs':
            self.assertTrue((self.directory / 'maintenance.lock').exists())
            return {'running': {} if self.running else None, 'activeSyncs': self.active_syncs}
        if path == '/api/health':
            if self.health_failure_permanent:
                return {'ok': False}
            if self.health_fails:
                self.health_fails = False
                raise RuntimeError('simuliert')
            return {'ok': True}
        raise AssertionError(path)

    def run_command(self, args, cwd=None):
        self.calls.append(tuple(args))
        if args[:3] == ['git', 'rev-parse', 'HEAD']:
            return self.old
        if args[:3] == ['git', 'rev-parse', 'FETCH_HEAD']:
            return self.target
        if args[:2] == ['git', 'status']:
            return ' M changed' if self.dirty else ''
        if args[:3] == ['git', 'worktree', 'add']:
            candidate = Path(args[-2])
            (candidate / '.next/standalone/.next').mkdir(parents=True)
            (candidate / '.next/static').mkdir()
            (candidate / 'public').mkdir()
            (candidate / '.next/new').write_text('new')
        if args[:3] == ['git', 'worktree', 'remove']:
            shutil.rmtree(args[-1])
        if args == ['npm', 'test'] and self.fail_test:
            raise RuntimeError('Tests fehlgeschlagen')
        if args[:4] == ['systemctl', '--user', 'start', 'nextquest.service'] and self.shrink:
            with sqlite3.connect(self.db) as con:
                con.execute('DELETE FROM games')
            self.shrink = False
        if args[:4] == ['systemctl', '--user', 'start', 'nextquest.service'] and self.health_failure_permanent:
            starts = sum(call == tuple(args) for call in self.calls)
            if starts == 2:
                self.health_failure_permanent = False
        return ''

    def execute(self, auto=False):
        self.updater.execute(auto)
        self.assertFalse((self.directory / 'maintenance.lock').exists())
        status = json.loads((self.directory / 'status.json').read_text(encoding='utf-8'))
        self.assertLessEqual(len(status['log']), 50)
        return status

    def test_current(self):
        self.target = self.old
        self.assertEqual('up-to-date', self.execute()['state'])
        self.assertFalse(self.backup.exists())

    def test_success(self):
        self.assertEqual('success', self.execute()['state'])
        self.assertTrue((self.root / '.next/new').exists())
        self.assertTrue((self.directory / 'previous-build/old').exists())
        self.assertIn(self.target, (self.directory / 'app.env').read_text())
        self.assertFalse(self.notifications)

    def test_dirty(self):
        self.dirty = True
        self.assertEqual('failed', self.execute()['state'])
        self.assertFalse(self.backup.exists())
        self.assertTrue((self.root / '.next/old').exists())

    def test_failed_tests_do_not_switch(self):
        self.fail_test = True
        self.assertEqual('failed', self.execute()['state'])
        self.assertTrue((self.root / '.next/old').exists())
        self.assertFalse(any(call[:2] == ('git', 'merge') for call in self.calls))

    def test_health_failure_rolls_back_and_restores_database(self):
        self.health_failure_permanent = True
        self.shrink = True
        self.assertEqual('rolled-back', self.execute()['state'])
        self.assertTrue((self.root / '.next/old').exists())
        self.assertEqual((1, 1), update.counts(self.db))
        self.assertIn(self.old, (self.directory / 'app.env').read_text())
        self.assertTrue(list(self.base.glob('data.sqlite3.before-rollback-*')))

    def test_fewer_rows_rolls_back(self):
        self.shrink = True
        self.assertEqual('rolled-back', self.execute()['state'])
        self.assertEqual((1, 1), update.counts(self.db))

    def test_running_job_waits_and_defers(self):
        self.running = True
        status = self.execute()
        self.assertEqual('failed', status['state'])
        self.assertIn('verschoben', status['message'])
        self.assertEqual([30] * 60, self.sleeps)
        self.assertFalse(self.calls)

    def test_direct_sync_waits_and_defers(self):
        # Ein Abgleich über den Knopf in der Einrichtung zählt wie ein laufender Job.
        self.active_syncs = 1
        status = self.execute()
        self.assertEqual('failed', status['state'])
        self.assertIn('verschoben', status['message'])
        self.assertEqual([30] * 60, self.sleeps)
        self.assertFalse(self.calls)

    def test_start_includes_gate_and_proxy(self):
        # Der Heimnetz-Zugang hängt per Requires= an der App und muss nach jedem Neustart mitstarten.
        self.execute()
        starts = [c for c in self.calls if c[:3] == ('systemctl', '--user', 'start')]
        self.assertTrue(starts)
        for call in starts:
            self.assertIn('nextquest-gate.service', call)
            self.assertIn('nextquest-proxy.service', call)

    def test_disabled_auto_is_silent(self):
        self.enabled = False
        self.updater.execute(True)
        self.assertFalse((self.directory / 'status.json').exists())
        self.assertEqual([], self.calls)
        self.assertEqual([], self.notifications)


if __name__ == '__main__':
    unittest.main()
