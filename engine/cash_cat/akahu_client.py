"""Akahu API client — HTTPS to api.akahu.io only."""

from __future__ import annotations

from typing import Any

import httpx

from cash_cat.settings import settings


def _parse_transactions_payload(data: Any) -> tuple[list[dict[str, Any]], str | None]:
    """Extract items and next cursor from GET /transactions or GET /accounts/.../transactions."""
    items: list[dict[str, Any]] = []
    next_cursor: str | None = None
    if isinstance(data, dict):
        raw_items = data.get("items")
        if isinstance(raw_items, list):
            items = [x for x in raw_items if isinstance(x, dict)]
        cur = data.get("cursor")
        if isinstance(cur, dict):
            nxt = cur.get("next")
            if isinstance(nxt, str) and nxt.strip():
                next_cursor = nxt.strip()
    elif isinstance(data, list):
        items = [x for x in data if isinstance(x, dict)]
    return items, next_cursor


class AkahuClient:
    def __init__(self, user_token: str, app_token: str) -> None:
        self._headers = {
            "Authorization": f"Bearer {user_token}",
            "X-Akahu-Id": app_token,
            "Accept": "application/json",
        }
        self._base = settings.akahu_api_base.rstrip("/")

    async def list_accounts(self) -> list[dict[str, Any]]:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.get(f"{self._base}/accounts", headers=self._headers)
            r.raise_for_status()
            data = r.json()
            # Akahu wraps in items or returns list — normalise
            if isinstance(data, dict) and "items" in data:
                return list(data["items"])
            if isinstance(data, list):
                return data
            return data.get("accounts", [])

    async def _get_transactions_paginated(self, url: str, params_base: dict[str, str]) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        cursor: str | None = None
        async with httpx.AsyncClient(timeout=120.0) as client:
            while True:
                params = dict(params_base)
                if cursor:
                    params["cursor"] = cursor
                r = await client.get(url, headers=self._headers, params=params)
                r.raise_for_status()
                items, next_cursor = _parse_transactions_payload(r.json())
                out.extend(items)
                if not next_cursor:
                    break
                cursor = next_cursor
        return out

    async def list_transactions(
        self,
        *,
        start: str,
        end: str,
        account_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """
        Fetch settled transactions in [start, end] (Akahu: start exclusive, end inclusive).

        When account_id is set, uses GET /accounts/{id}/transactions (per-account feed).
        Otherwise uses GET /transactions (all connected accounts). Do not pass a fake
        `account` query param on /transactions — it is not documented and is ignored.
        """
        params_base: dict[str, str] = {"start": start, "end": end}
        if account_id:
            url = f"{self._base}/accounts/{account_id}/transactions"
        else:
            url = f"{self._base}/transactions"
        items = await self._get_transactions_paginated(url, params_base)
        if not account_id:
            return items
        acc = str(account_id)
        filtered: list[dict[str, Any]] = []
        for t in items:
            aid = t.get("_account")
            if aid is not None and str(aid).strip() and str(aid) != acc:
                continue
            filtered.append(t)
        return filtered


VALID_ACCOUNT_KINDS = frozenset({"everyday", "credit_card", "savings", "loan", "other", "unknown"})


def infer_account_kind(raw: dict[str, Any]) -> str:
    """Best-effort classification from Akahu account name/type fields (user can override)."""
    name = str(raw.get("name") or raw.get("account_name") or "").lower()
    typ = str(
        raw.get("type")
        or raw.get("product")
        or raw.get("account_type")
        or raw.get("category")
        or ""
    ).lower()
    combined = f"{name} {typ}"
    if "debit" in combined and "credit" not in combined:
        return "everyday"
    if "loan" in combined or "mortgage" in combined or "home loan" in combined:
        return "loan"
    if "savings" in combined or "save" in name:
        return "savings"
    if any(
        x in combined
        for x in (
            "credit card",
            "amex",
            "american express",
            "visa credit",
            "mastercard credit",
            "charge card",
        )
    ):
        return "credit_card"
    if "card" in combined or "credit" in combined:
        return "credit_card"
    return "unknown"


def map_akahu_account(raw: dict[str, Any]) -> dict[str, Any]:
    """Normalise Akahu account payload to our model (field names depend on API version)."""
    _id = raw.get("_id") or raw.get("id") or ""
    inst = raw.get("connection") or {}
    if isinstance(inst, dict):
        institution = inst.get("name") or raw.get("institution", {}).get("name", "Unknown")
    else:
        institution = raw.get("institution", {}).get("name", "Unknown") if isinstance(raw.get("institution"), dict) else "Unknown"
    name = raw.get("name") or raw.get("account_name") or "Account"
    mask = raw.get("formatted_account") or raw.get("mask") or ""
    logo = None
    if isinstance(raw.get("institution"), dict):
        logo = raw["institution"].get("logo")
    return {
        "akahu_account_id": str(_id),
        "institution_name": institution,
        "account_name": name,
        "mask": mask,
        "logo_url": logo,
        "account_kind": infer_account_kind(raw if isinstance(raw, dict) else {}),
    }
