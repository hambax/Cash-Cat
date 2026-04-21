"""Tests for /settings/ai-provider endpoints."""

from __future__ import annotations

import importlib
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch) -> Generator[TestClient, None, None]:
    db = tmp_path / "ai_test.db"
    monkeypatch.setenv("CASH_CAT_DB_PATH", str(db))

    import cash_cat.db as db_mod
    import cash_cat.settings as settings_mod
    import cash_cat.app as app_mod

    importlib.reload(settings_mod)
    importlib.reload(db_mod)
    importlib.reload(app_mod)

    with TestClient(app_mod.app) as tc:
        yield tc


def test_health_includes_ai_capability(client: TestClient) -> None:
    r = client.get("/health")
    assert r.status_code == 200
    assert "ai" in r.json().get("capabilities", [])


def test_get_ai_provider_default(client: TestClient) -> None:
    r = client.get("/settings/ai-provider")
    assert r.status_code == 200
    body = r.json()
    assert body["provider"] == "none"
    assert body["has_key"] is False


def test_post_ai_provider_cloud_requires_key(client: TestClient) -> None:
    r = client.post(
        "/settings/ai-provider",
        json={"provider": "openai", "model": "gpt-4o-mini"},
    )
    assert r.status_code == 400


def test_post_ai_provider_save_and_mask_key(client: TestClient) -> None:
    r = client.post(
        "/settings/ai-provider",
        json={"provider": "openai", "api_key": "sk-testkey1234", "model": "gpt-4o-mini"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["provider"] == "openai"
    assert body["has_key"] is True
    assert body["key_hint"] == "...1234"
    assert "api_key" not in body

    g = client.get("/settings/ai-provider")
    assert g.json()["key_hint"] == "...1234"


def test_post_ai_provider_retains_key_when_omitted(client: TestClient) -> None:
    client.post(
        "/settings/ai-provider",
        json={"provider": "openai", "api_key": "sk-abcdefghijkl", "model": "gpt-4o"},
    )
    r = client.post(
        "/settings/ai-provider",
        json={"provider": "openai", "model": "gpt-4o-mini"},
    )
    assert r.status_code == 200
    assert r.json()["key_hint"] == "...ijkl"


def test_post_ai_provider_none_clears(client: TestClient) -> None:
    client.post(
        "/settings/ai-provider",
        json={"provider": "anthropic", "api_key": "sk-ant-xyz123456789", "model": "claude-sonnet-4-20250514"},
    )
    r = client.post("/settings/ai-provider", json={"provider": "none"})
    assert r.status_code == 200
    assert r.json()["provider"] == "none"
    assert r.json()["has_key"] is False


def test_get_models_cloud(client: TestClient) -> None:
    r = client.get("/settings/ai-provider/models", params={"provider": "openai"})
    assert r.status_code == 200
    data = r.json()
    assert data["provider"] == "openai"
    assert "gpt-5.4" in data["models"]


def test_get_models_ollama_unreachable_returns_empty(client: TestClient) -> None:
    r = client.get(
        "/settings/ai-provider/models",
        params={"provider": "ollama", "base_url": "http://127.0.0.1:59999"},
    )
    assert r.status_code == 200
    assert r.json()["models"] == []


def test_post_ollama_save(client: TestClient) -> None:
    r = client.post(
        "/settings/ai-provider",
        json={"provider": "ollama", "base_url": "http://localhost:11434", "model": "llama3"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["provider"] == "ollama"
    assert body["has_key"] is False
    assert body["base_url"] == "http://localhost:11434"
