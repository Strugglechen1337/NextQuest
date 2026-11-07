#!/usr/bin/env python3
"""Create and verify a private SQLite online backup, then expire our snapshots."""
import datetime as dt
from contextlib import closing, contextmanager
import fcntl
import os
from pathlib import Path
import re
import sqlite3
import stat
import tempfile
import time

DB = Path(os.environ.get('NEXTQUEST_DB', str(Path.home() / 'nextquest/data/nextquest.db')))
BACKUPS = Path(os.environ.get('NEXTQUEST_BACKUP_DIR', str(Path.home() / 'nextquest-backups/nightly')))
NAME = re.compile(r'nextquest-\d{8}T\d{6}\.\d{6}Z\.sqlite3\Z')


@contextmanager
def operation_lock():
    """Serialize backup and updater; callers must not recursively acquire it."""
    directory = Path(os.environ.get('NEXTQUEST_UPDATE_DIR', str(Path.home() / '.local/state/nextquest/update')))
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = directory.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise RuntimeError('Unsicheres Sperrverzeichnis')
    fd = os.open(directory / 'operation.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise RuntimeError('Unsichere Sperrdatei')
        fcntl.flock(fd, fcntl.LOCK_EX)
        yield
    finally:
        os.close(fd)


def backup():
    os.umask(0o077)
    BACKUPS.mkdir(mode=0o700, parents=True, exist_ok=True)
    if BACKUPS.is_symlink() or BACKUPS.stat().st_uid != os.getuid():
        raise RuntimeError('Unsicheres Sicherungsverzeichnis')
    os.chmod(BACKUPS, 0o700)
    fd, tmp_name = tempfile.mkstemp(prefix='.nextquest-', suffix='.tmp', dir=BACKUPS)
    os.close(fd)
    tmp = Path(tmp_name)
    try:
        # mode=ro prevents accidentally creating a new empty production database.
        with closing(sqlite3.connect(DB.resolve().as_uri() + '?mode=ro', uri=True, timeout=30)) as source:
            with closing(sqlite3.connect(tmp)) as target:
                source.backup(target, pages=256, sleep=0.1)
                # Publish a self-contained database, even when the source uses WAL.
                target.execute('PRAGMA journal_mode=DELETE')
                if target.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
                    raise RuntimeError('Integritätsprüfung der Sicherung fehlgeschlagen')
        os.chmod(tmp, 0o600)
        name = 'nextquest-' + dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ') + '.sqlite3'
        final = BACKUPS / name
        os.link(tmp, final)  # never replace an existing snapshot
        tmp.unlink()
        cutoff = time.time() - 7 * 24 * 60 * 60
        for path in BACKUPS.iterdir():
            if NAME.fullmatch(path.name) and not path.is_symlink() and path.is_file() and path.stat().st_mtime < cutoff:
                path.unlink()
        print('Sicherung erstellt und geprüft:', final)
        return final
    finally:
        tmp.unlink(missing_ok=True)


if __name__ == '__main__':
    with operation_lock():
        backup()
