"""HTTP contract tests for the FastAPI engine (isolated DB per test)."""

from __future__ import annotations

import importlib
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch) -> Generator[TestClient, None, None]:
    """Point the engine at a fresh SQLite file and reload modules so settings pick it up."""
    db = tmp_path / "route_test.db"
    monkeypatch.setenv("CASH_CAT_DB_PATH", str(db))

    import cash_cat.db as db_mod
    import cash_cat.settings as settings_mod
    import cash_cat.app as app_mod

    importlib.reload(settings_mod)
    importlib.reload(db_mod)
    importlib.reload(app_mod)

    with TestClient(app_mod.app) as tc:
        yield tc


def test_health_lists_capabilities_and_categories(client: TestClient) -> None:
    """Regression: stale uvicorn processes omitted /categories and capabilities."""
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body.get("ok") is True
    assert "version" in body
    assert "db_path" in body
    caps = body.get("capabilities")
    assert isinstance(caps, list)
    assert "categories" in caps
    assert "transactions" in caps


def test_get_categories_returns_items(client: TestClient) -> None:
    r = client.get("/categories")
    assert r.status_code == 200
    body = r.json()
    assert "items" in body
    assert isinstance(body["items"], list)
    keys = {x["key"] for x in body["items"]}
    assert "other" in keys


def test_akahu_credentials_round_trip(client: TestClient) -> None:
    r = client.get("/akahu/credentials")
    assert r.status_code == 200
    assert r.json() == {"app_token": "", "user_token": ""}
    r2 = client.post(
        "/akahu/credentials",
        json={"app_token": "app1", "user_token": "user1"},
    )
    assert r2.status_code == 200
    r3 = client.get("/akahu/credentials")
    assert r3.json() == {"app_token": "app1", "user_token": "user1"}


def test_akahu_sync_defaults_round_trip(client: TestClient) -> None:
    r = client.post(
        "/akahu/sync-defaults",
        json={"start": "2024-01-01", "end": "2024-12-31"},
    )
    assert r.status_code == 200
    r2 = client.get("/akahu/sync-defaults")
    assert r2.json() == {"start": "2024-01-01", "end": "2024-12-31"}


def test_analytics_txn_date_bounds_empty_db(client: TestClient) -> None:
    r = client.get("/analytics/txn-date-bounds")
    assert r.status_code == 200
    assert r.json() == {"min_date": None, "max_date": None}


def test_akahu_sync_without_body_requires_settings(client: TestClient) -> None:
    r = client.post("/akahu/sync", json={})
    assert r.status_code == 400
    detail = r.json().get("detail", "")
    assert "Missing Akahu sync settings" in detail
