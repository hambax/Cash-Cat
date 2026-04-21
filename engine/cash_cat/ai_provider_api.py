"""AI provider settings: local SQLite storage (plaintext; future: OS keychain via Tauri).

Endpoints under /settings/ai-provider — never return raw API keys.
"""

from __future__ import annotations

import re
import sqlite3
import time
from collections.abc import Generator
from typing import Any, Literal
from urllib.parse import quote

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from cash_cat.ai_provider_constants import (
    ANTHROPIC_API_VERSION,
    DEFAULT_MODELS,
    DEFAULT_OLLAMA_BASE_URL,
    MODEL_SUGGESTIONS,
)
from cash_cat.db import connect

router = APIRouter(tags=["settings"])

ProviderName = Literal["anthropic", "openai", "gemini", "ollama", "none"]


def get_conn() -> Generator[sqlite3.Connection, None, None]:
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


def _key_hint(api_key: str | None) -> tuple[bool, str | None]:
    if not api_key or not api_key.strip():
        return False, None
    s = api_key.strip()
    tail = s[-4:] if len(s) >= 4 else s
    return True, f"...{tail}"


def _prefix_warnings(provider: str, api_key: str | None) -> list[str]:
    if not api_key or not api_key.strip():
        return []
    k = api_key.strip()
    out: list[str] = []
    if provider == "anthropic" and not k.startswith("sk-ant-"):
        out.append("Anthropic API keys usually start with sk-ant-.")
    if provider == "openai" and not k.startswith("sk-"):
        out.append("OpenAI API keys usually start with sk-.")
    if provider == "gemini":
        if len(k) != 39 or not re.match(r"^[A-Za-z0-9_-]+$", k):
            out.append("Google AI Studio keys are often 39 characters (alphanumeric). Check your key.")
    return out


class AIProviderConfig(BaseModel):
    provider: ProviderName = "none"
    api_key: str | None = None
    base_url: str | None = None
    model: str | None = None


class AIProviderResponse(BaseModel):
    provider: str
    has_key: bool = False
    key_hint: str | None = None
    base_url: str | None = None
    model: str | None = None
    updated_at: str | None = None
    warnings: list[str] = Field(default_factory=list)


class AIProviderTestResult(BaseModel):
    success: bool
    message: str
    latency_ms: int | None = None


class AIProviderModelsResponse(BaseModel):
    provider: str
    models: list[str]


def _row_to_response(
    row: sqlite3.Row | None,
    *,
    warnings: list[str] | None = None,
) -> AIProviderResponse:
    if row is None:
        return AIProviderResponse(provider="none", warnings=warnings or [])
    prov = str(row["provider"] or "none")
    raw_key = row["api_key"]
    key_str = raw_key if isinstance(raw_key, str) else (str(raw_key) if raw_key is not None else "")
    has_key, hint = _key_hint(key_str)
    bu = row["base_url"]
    md = row["model"]
    ua = row["updated_at"]
    return AIProviderResponse(
        provider=prov,
        has_key=has_key,
        key_hint=hint,
        base_url=str(bu) if bu else None,
        model=str(md) if md else None,
        updated_at=str(ua) if ua else None,
        warnings=warnings or [],
    )


@router.get("/settings/ai-provider", response_model=AIProviderResponse)
def get_ai_provider(conn: sqlite3.Connection = Depends(get_conn)) -> AIProviderResponse:
    row = conn.execute("SELECT provider, api_key, base_url, model, updated_at FROM ai_provider WHERE id = 1").fetchone()
    return _row_to_response(row)


@router.post("/settings/ai-provider", response_model=AIProviderResponse)
def post_ai_provider(body: AIProviderConfig, conn: sqlite3.Connection = Depends(get_conn)) -> AIProviderResponse:
    prov = body.provider
    row = conn.execute("SELECT api_key, base_url, model FROM ai_provider WHERE id = 1").fetchone()
    existing_key = ""
    existing_base: str | None = None
    existing_model: str | None = None
    if row:
        ek = row["api_key"]
        existing_key = ek.strip() if isinstance(ek, str) and ek else ""
        eb = row["base_url"]
        existing_base = str(eb) if eb else None
        em = row["model"]
        existing_model = str(em) if em else None

    warnings: list[str] = []

    if prov == "none":
        conn.execute(
            """INSERT INTO ai_provider (id, provider, api_key, base_url, model, updated_at)
               VALUES (1, 'none', NULL, NULL, NULL, datetime('now'))
               ON CONFLICT(id) DO UPDATE SET
                 provider = 'none',
                 api_key = NULL,
                 base_url = NULL,
                 model = NULL,
                 updated_at = datetime('now')""",
        )
        conn.commit()
        return AIProviderResponse(provider="none")

    if prov == "ollama":
        base = (body.base_url or "").strip() or (existing_base or "").strip() or DEFAULT_OLLAMA_BASE_URL
        model = (body.model or "").strip() or (existing_model or "").strip() or DEFAULT_MODELS["ollama"]
        warnings.extend(_prefix_warnings("ollama", None))
        conn.execute(
            """INSERT INTO ai_provider (id, provider, api_key, base_url, model, updated_at)
               VALUES (1, ?, NULL, ?, ?, datetime('now'))
               ON CONFLICT(id) DO UPDATE SET
                 provider = excluded.provider,
                 api_key = NULL,
                 base_url = excluded.base_url,
                 model = excluded.model,
                 updated_at = datetime('now')""",
            (prov, base, model),
        )
        conn.commit()
        row2 = conn.execute("SELECT provider, api_key, base_url, model, updated_at FROM ai_provider WHERE id = 1").fetchone()
        return _row_to_response(row2, warnings=warnings)

    # Cloud providers
    incoming_key = body.api_key
    if incoming_key is not None and str(incoming_key).strip() != "":
        new_key = str(incoming_key).strip()
    else:
        new_key = existing_key

    if not new_key:
        raise HTTPException(
            status_code=400,
            detail="API key is required. Provide a key or save after connecting once.",
        )

    warnings.extend(_prefix_warnings(prov, new_key))

    model = (body.model or "").strip() or (existing_model or "").strip() or DEFAULT_MODELS.get(prov, "")
    if not model:
        raise HTTPException(status_code=400, detail="Model is required.")

    conn.execute(
        """INSERT INTO ai_provider (id, provider, api_key, base_url, model, updated_at)
           VALUES (1, ?, ?, NULL, ?, datetime('now'))
           ON CONFLICT(id) DO UPDATE SET
             provider = excluded.provider,
             api_key = excluded.api_key,
             base_url = NULL,
             model = excluded.model,
             updated_at = datetime('now')""",
        (prov, new_key, model),
    )
    conn.commit()
    row2 = conn.execute("SELECT provider, api_key, base_url, model, updated_at FROM ai_provider WHERE id = 1").fetchone()
    return _row_to_response(row2, warnings=warnings)


def _friendly_http_error(exc: httpx.HTTPStatusError, provider_label: str) -> str:
    code = exc.response.status_code
    if code in (401, 403):
        return "Invalid API key. Check your key and try again."
    if code == 404:
        return "Model not found. Check the model name."
    return f"Request failed ({code})."


async def _test_anthropic(api_key: str, model: str) -> tuple[dict[str, Any], float]:
    t0 = time.perf_counter()
    async with httpx.AsyncClient() as client:
        r = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": ANTHROPIC_API_VERSION,
                "content-type": "application/json",
            },
            json={
                "model": model,
                "max_tokens": 1,
                "messages": [{"role": "user", "content": "hi"}],
            },
            timeout=10.0,
        )
        r.raise_for_status()
        elapsed = time.perf_counter() - t0
        return r.json(), elapsed


async def _test_openai(api_key: str, model: str) -> tuple[dict[str, Any], float]:
    t0 = time.perf_counter()
    async with httpx.AsyncClient() as client:
        r = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "content-type": "application/json",
            },
            json={
                "model": model,
                "max_tokens": 1,
                "messages": [{"role": "user", "content": "hi"}],
            },
            timeout=10.0,
        )
        r.raise_for_status()
        elapsed = time.perf_counter() - t0
        return r.json(), elapsed


async def _test_gemini(api_key: str, model: str) -> tuple[dict[str, Any], float]:
    t0 = time.perf_counter()
    enc = quote(model, safe="")
    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{enc}:generateContent",
            params={"key": api_key},
            json={
                "contents": [{"parts": [{"text": "hi"}]}],
                "generationConfig": {"maxOutputTokens": 1},
            },
            timeout=10.0,
        )
        r.raise_for_status()
        elapsed = time.perf_counter() - t0
        return r.json(), elapsed


async def _test_ollama(base_url: str) -> tuple[dict[str, Any], float]:
    base = base_url.rstrip("/")
    url = f"{base}/api/tags"
    t0 = time.perf_counter()
    async with httpx.AsyncClient() as client:
        r = await client.get(url, timeout=10.0)
        r.raise_for_status()
        elapsed = time.perf_counter() - t0
        return r.json(), elapsed


def _load_stored_api_key(conn: sqlite3.Connection) -> str:
    row = conn.execute("SELECT api_key FROM ai_provider WHERE id = 1").fetchone()
    if not row:
        return ""
    ek = row["api_key"]
    return ek.strip() if isinstance(ek, str) and ek else ""


@router.post("/settings/ai-provider/test", response_model=AIProviderTestResult)
async def post_ai_provider_test(
    body: AIProviderConfig,
    conn: sqlite3.Connection = Depends(get_conn),
) -> AIProviderTestResult:
    prov = body.provider
    if prov == "none":
        return AIProviderTestResult(success=False, message="No provider selected.")

    try:
        if prov in ("anthropic", "openai", "gemini"):
            key = (body.api_key or "").strip() or _load_stored_api_key(conn)
            if not key:
                return AIProviderTestResult(success=False, message="API key is required for this test.")
            model = (body.model or "").strip()
            if not model:
                row_m = conn.execute("SELECT model FROM ai_provider WHERE id = 1").fetchone()
                em = row_m["model"] if row_m else None
                model = str(em).strip() if em else ""
            if not model:
                model = DEFAULT_MODELS.get(prov, "")
            if not model:
                return AIProviderTestResult(success=False, message="Model is required.")

            if prov == "anthropic":
                _, elapsed = await _test_anthropic(key, model)
                ms = int(elapsed * 1000)
                return AIProviderTestResult(
                    success=True,
                    message=f"Connected to Claude {model}",
                    latency_ms=ms,
                )
            if prov == "openai":
                _, elapsed = await _test_openai(key, model)
                ms = int(elapsed * 1000)
                return AIProviderTestResult(
                    success=True,
                    message=f"Connected to OpenAI {model}",
                    latency_ms=ms,
                )
            _, elapsed = await _test_gemini(key, model)
            ms = int(elapsed * 1000)
            return AIProviderTestResult(
                success=True,
                message=f"Connected to Gemini {model}",
                latency_ms=ms,
            )

        # ollama
        base = (body.base_url or "").strip()
        if not base:
            row_b = conn.execute("SELECT base_url FROM ai_provider WHERE id = 1").fetchone()
            bu = row_b["base_url"] if row_b else None
            base = str(bu).strip() if bu else ""
        if not base:
            base = DEFAULT_OLLAMA_BASE_URL
        _, elapsed = await _test_ollama(base)
        ms = int(elapsed * 1000)
        return AIProviderTestResult(
            success=True,
            message=f"Connected to Ollama at {base}",
            latency_ms=ms,
        )
    except httpx.HTTPStatusError as e:
        label = {"anthropic": "Anthropic", "openai": "OpenAI", "gemini": "Gemini"}.get(prov, str(prov))
        return AIProviderTestResult(success=False, message=_friendly_http_error(e, label))
    except httpx.ConnectError:
        if prov == "ollama":
            return AIProviderTestResult(
                success=False,
                message="Could not reach Ollama. Is it running?",
            )
        return AIProviderTestResult(
            success=False,
            message=f"Could not reach {prov}.",
        )
    except httpx.TimeoutException:
        return AIProviderTestResult(success=False, message="Connection timed out after 10 seconds.")
    except Exception as e:
        return AIProviderTestResult(success=False, message=str(e) or "Unknown error.")


@router.get("/settings/ai-provider/models", response_model=AIProviderModelsResponse)
def get_ai_provider_models(
    provider: str,
    base_url: str | None = None,
) -> AIProviderModelsResponse:
    """List model suggestions (cloud) or names from Ollama /api/tags."""
    prov = provider.strip().lower()
    if prov == "ollama":
        base = (base_url or "").strip() or DEFAULT_OLLAMA_BASE_URL
        try:
            r = httpx.get(f"{base.rstrip('/')}/api/tags", timeout=10.0)
            r.raise_for_status()
            data = r.json()
            models: list[str] = []
            if isinstance(data, dict) and "models" in data:
                for item in data["models"]:
                    if isinstance(item, dict) and "name" in item:
                        models.append(str(item["name"]))
            return AIProviderModelsResponse(provider="ollama", models=models)
        except Exception:
            return AIProviderModelsResponse(provider="ollama", models=[])

    if prov in MODEL_SUGGESTIONS:
        return AIProviderModelsResponse(provider=prov, models=list(MODEL_SUGGESTIONS[prov]))

    if prov == "none":
        return AIProviderModelsResponse(provider="none", models=[])

    raise HTTPException(status_code=400, detail="Unknown provider.")
