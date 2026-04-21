"""SQLite access with WAL and versioned migrations."""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Generator

from cash_cat.settings import settings


def connect() -> sqlite3.Connection:
    settings.db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(settings.db_path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def get_db() -> Generator[sqlite3.Connection, None, None]:
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


def current_schema_version(conn: sqlite3.Connection) -> int:
    row = conn.execute("PRAGMA user_version").fetchone()
    return int(row[0]) if row else 0


def apply_migrations(conn: sqlite3.Connection, migrations_dir: Path) -> None:
    """Apply numbered SQL files 001_*.sql, 002_*.sql, ..."""
    files = sorted(migrations_dir.glob("*.sql"))
    version = current_schema_version(conn)
    for path in files:
        num = int(path.name[:3])
        if num > version:
            sql = path.read_text(encoding="utf-8")
            conn.executescript(sql)
            conn.execute(f"PRAGMA user_version = {num}")
            conn.commit()


def init_db() -> None:
    migrations = Path(__file__).resolve().parent / "migrations"
    conn = connect()
    try:
        apply_migrations(conn, migrations)
    finally:
        conn.close()
