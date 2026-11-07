import datetime as dt
import importlib.util
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch

DEPLOY = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(DEPLOY))
import backup
import monitor

NOW = dt.datetime(2026, 11, 7, 5, tzinfo=dt.timezone.utc)


def data():
    return {'/api/health': {'ok': True}, '/api/jobs': {
        'last': {'kind': 'sync-all', 'startedAt': '2026-11-07T04:00:00Z',
                 'endedAt': '2026-11-07T04:30:00Z', 'platforms': {'Steam': {'ok': True}}, 'errors': {}},
        'running': None, 'auto': {'enabled': True}}, '/api/settings': {'psn.refreshExpires': '2026-11-20T00:00:00Z'}}


class MonitorTests(unittest.TestCase):
    def check(self, values, backup_result=None):
        return monitor.assess(values.__getitem__, lambda now: backup_result, NOW)

    def test_normal_no_alert(self):
        self.assertEqual([], self.check(data()))

    def test_simulated_failure(self):
        values = data()
        values['/api/jobs']['last']['platforms']['Steam'] = {'ok': False, 'error': 'simulierter Fehler'}
        self.assertEqual(['Steam: Plattform meldet Fehler'], self.check(values))

    def test_main_sends_simulated_error_and_stays_quiet_when_normal(self):
        values = data()
        assess = monitor.assess
        with patch.object(sys, 'argv', ['monitor.py']), patch.object(monitor, 'send') as sender:
            with patch.object(monitor, 'assess', lambda: assess(values.__getitem__, lambda now: None, NOW)):
                monitor.main()
                sender.assert_not_called()
                values['/api/jobs']['last']['platforms']['Steam'] = {'ok': False, 'error': 'simulierter Fehler'}
                monitor.main()
                sender.assert_called_once_with('NextQuest-Überwachung:\n- Steam: Plattform meldet Fehler')

    def test_incomplete_stale_and_expiry(self):
        values = data()
        values['/api/jobs']['last']['startedAt'] = '2026-11-05T00:00:00Z'
        values['/api/jobs']['last'].pop('endedAt')
        values['/api/settings']['psn.refreshExpires'] = '2026-11-08T00:00:00Z'
        alerts = self.check(values, 'Sicherung fehlgeschlagen')
        self.assertTrue(any('26 Stunden' in x for x in alerts))
        self.assertTrue(any('endedAt' in x for x in alerts))
        self.assertTrue(any('PlayStation' in x for x in alerts))
        self.assertIn('Sicherung fehlgeschlagen', alerts)

    def test_other_job_is_not_proof_of_sync(self):
        values = data()
        values['/api/jobs']['last']['kind'] = 'descriptions'
        self.assertTrue(any('nicht belegbar' in x for x in self.check(values)))

    def test_health_and_unreachable(self):
        values = data()
        values['/api/health'] = {'ok': False}
        self.assertTrue(any('Gesundheitsprüfung' in x for x in self.check(values)))
        self.assertEqual(3, len(monitor.assess(lambda path: (_ for _ in ()).throw(OSError()), lambda now: None, NOW)))

    def test_expiry_boundary(self):
        values = data()
        values['/api/settings']['psn.refreshExpires'] = '2026-11-14T05:00:00Z'
        self.assertEqual([], self.check(values))
        values['/api/settings']['psn.refreshExpires'] = '2026-11-14T04:59:59Z'
        self.assertTrue(any('PlayStation' in x for x in self.check(values)))


class BackupTests(unittest.TestCase):
    def test_snapshot_permissions_integrity_and_retention(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            db, dest = root / 'live.db', root / 'nightly'
            with sqlite3.connect(db) as source:
                source.execute('PRAGMA journal_mode=WAL')
                source.execute('CREATE TABLE example (value TEXT)')
                source.execute('INSERT INTO example VALUES (?)', ('real snapshot',))
            dest.mkdir()
            old = dest / 'nextquest-20200101T000000.000000Z.sqlite3'
            old.write_text('old')
            os.utime(old, (1, 1))
            unrelated = dest / 'do-not-delete.sqlite3'
            unrelated.write_text('preserve')
            with patch.object(backup, 'DB', db), patch.object(backup, 'BACKUPS', dest):
                snapshot = backup.backup()
            self.assertFalse(old.exists())
            self.assertTrue(unrelated.exists())
            self.assertEqual(0o600, snapshot.stat().st_mode & 0o777)
            with sqlite3.connect(snapshot) as conn:
                self.assertEqual([('ok',)], conn.execute('PRAGMA integrity_check').fetchall())
                self.assertEqual('delete', conn.execute('PRAGMA journal_mode').fetchone()[0])
                self.assertEqual('real snapshot', conn.execute('SELECT value FROM example').fetchone()[0])
            self.assertFalse(Path(str(snapshot) + '-wal').exists())
            self.assertFalse(Path(str(snapshot) + '-shm').exists())

    def test_missing_database_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.object(backup, 'DB', root / 'absent.db'), patch.object(backup, 'BACKUPS', root / 'nightly'):
                with self.assertRaises(sqlite3.OperationalError):
                    backup.backup()
            self.assertFalse((root / 'absent.db').exists())


if __name__ == '__main__':
    unittest.main()
