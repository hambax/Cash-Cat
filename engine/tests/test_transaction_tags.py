"""Transaction manual tags (tags_json)."""

from __future__ import annotations

import importlib
from collections.abc import Generator

import pytest


@pytest.fixture
def conn(tmp_path, monkeypatch) -> Generator:
    db = tmp_path / "txn_tags.db"
    monkeypatch.setenv("CASH_CAT_DB_PATH", str(db))
    import cash_cat.db as db_mod
    import cash_cat.settings as settings_mod

    importlib.reload(settings_mod)
    importlib.reload(db_mod)
    from cash_cat.db import connect, init_db

    init_db()
    c = connect()
    yield c
    c.close()


def _insert_txn(
    conn, dedupe: str, amount_cents: int, day: str = "2026-01-01", description_raw: str = "x"
) -> int:
    conn.execute(
        """
        INSERT INTO transactions (txn_date, amount_cents, description_raw, dedupe_hash, source_label)
        VALUES (?, ?, ?, ?, ?)
        """,
        (day, amount_cents, description_raw, dedupe, "test"),
    )
    conn.commit()
    row = conn.execute("SELECT id FROM transactions WHERE dedupe_hash = ?", (dedupe,)).fetchone()
    assert row
    return int(row["id"])


def test_list_and_patch_tags(conn) -> None:
    import importlib
    import cash_cat.app as app_mod

    importlib.reload(app_mod)
    from fastapi.testclient import TestClient

    tid = _insert_txn(conn, "tag1", -1000)
    client = TestClient(app_mod.app)
    r = client.get("/transactions?limit=50")
    assert r.status_code == 200
    items = r.json()["items"]
    row = next(x for x in items if x["id"] == tid)
    assert row["tags"] == []

    p = client.patch(f"/transactions/{tid}", json={"tags": ["transfer", "review"]})
    assert p.status_code == 200
    assert p.json()["tags"] == ["review", "transfer"]

    r2 = client.get("/transactions?limit=50")
    row2 = next(x for x in r2.json()["items"] if x["id"] == tid)
    assert row2["tags"] == ["review", "transfer"]


def test_patch_category_and_tags(conn) -> None:
    import importlib
    import cash_cat.app as app_mod

    importlib.reload(app_mod)
    from fastapi.testclient import TestClient

    tid = _insert_txn(conn, "tag2", -500)
    conn.execute(
        "INSERT INTO category_assignments (transaction_id, category_key, is_override) VALUES (?, 'groceries', 1)",
        (tid,),
    )
    conn.commit()

    client = TestClient(app_mod.app)
    p = client.patch(f"/transactions/{tid}", json={"category_key": "other", "tags": ["business"]})
    assert p.status_code == 200
    body = p.json()
    assert body["category_key"] == "other"
    assert body["tags"] == ["business"]


def test_patch_included(conn) -> None:
    import importlib
    import cash_cat.app as app_mod

    importlib.reload(app_mod)
    from fastapi.testclient import TestClient

    tid = _insert_txn(conn, "inc1", -1000)
    client = TestClient(app_mod.app)
    p = client.patch(f"/transactions/{tid}", json={"included": False})
    assert p.status_code == 200
    assert p.json()["included"] == 0
    row = conn.execute("SELECT included FROM transactions WHERE id = ?", (tid,)).fetchone()
    assert int(row["included"]) == 0
    p2 = client.patch(f"/transactions/{tid}", json={"included": True})
    assert p2.status_code == 200
    assert p2.json()["included"] == 1


def test_bulk_assign_by_description_and_same_description_count(conn) -> None:
    import importlib
    import cash_cat.app as app_mod

    importlib.reload(app_mod)
    from fastapi.testclient import TestClient

    desc = "Coffee Shop — same text"
    tid1 = _insert_txn(conn, "bd1", -1000, description_raw=desc)
    tid2 = _insert_txn(conn, "bd2", -500, description_raw=desc)
    _insert_txn(conn, "bd3", -200, description_raw="other")

    client = TestClient(app_mod.app)
    r = client.get("/transactions?limit=50")
    assert r.status_code == 200
    items = r.json()["items"]
    for tid in (tid1, tid2):
        row = next(x for x in items if x["id"] == tid)
        assert row["same_description_count"] == 2

    p = client.post(
        "/transactions/bulk-assign-by-description",
        json={"category_key": "groceries", "description_raw": desc},
    )
    assert p.status_code == 200
    assert p.json() == {"status": "ok", "updated": 2, "matched": 2}

    r2 = client.get("/transactions?limit=50")
    for tid in (tid1, tid2):
        row = next(x for x in r2.json()["items"] if x["id"] == tid)
        assert row["category_key"] == "groceries"


def test_reset_imported_data_keeps_akahu_credentials(conn) -> None:
    """POST /settings/reset-database clears transactions but not Akahu tokens."""
    import importlib
    import cash_cat.app as app_mod

    importlib.reload(app_mod)
    from fastapi.testclient import TestClient

    client = TestClient(app_mod.app)
    assert client.post("/akahu/credentials", json={"app_token": "tok_a", "user_token": "tok_u"}).status_code == 200
    _insert_txn(conn, "reset_dedupe_1", -500)
    r = client.post("/settings/reset-database")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["deleted_transactions"] == 1
    assert client.get("/transactions?limit=5").json()["total"] == 0
    assert client.get("/akahu/credentials").json() == {"app_token": "tok_a", "user_token": "tok_u"}


def test_invalid_tag_rejected(conn) -> None:
    import importlib
    import cash_cat.app as app_mod

    importlib.reload(app_mod)
    from fastapi.testclient import TestClient

    tid = _insert_txn(conn, "tag3", -100)
    client = TestClient(app_mod.app)
    p = client.patch(f"/transactions/{tid}", json={"tags": ["Bad Upper"]})
    assert p.status_code == 400
