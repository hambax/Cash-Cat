"""FastAPI application — OpenAPI at /docs."""

from __future__ import annotations

import hashlib
import json
import os
import re
from contextlib import asynccontextmanager
from typing import Annotated, Any, Literal

from fastapi import Body, Depends, FastAPI, File, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, model_validator
import sqlite3

from cash_cat import __version__
from cash_cat.akahu_client import VALID_ACCOUNT_KINDS, AkahuClient, map_akahu_account
from cash_cat.analytics import (
    build_insights,
    cashflow_series,
    category_breakdown,
    daily_expense_totals,
    dashboard_summary,
    get_settings_json,
    monthly_series,
    monthly_series_by_category,
    recurring_suggestions,
    resolve_cashflow_bucket,
    savings_rate_series,
    set_settings_json,
    tag_breakdown,
)
from cash_cat.categorisation.engine import categorize_connection, explain_transaction_category
from cash_cat.merchant import normalise_merchant
from cash_cat.transfers.auto_tags import AUTO_INTERNAL_TRANSFER_TAGS, merge_tag_slugs_into_transaction
from cash_cat.transfers.detect import detect_and_persist_pairs
from cash_cat.csv_ingest import ingest_csv_text
from collections.abc import Generator

from cash_cat.ai_provider_api import router as ai_provider_router
from cash_cat.db import connect, init_db
from cash_cat.settings import settings

_engine_inited = False


def _norm_account_kind(k: str | None) -> str:
    if not k:
        return "unknown"
    k = k.strip()
    return k if k in VALID_ACCOUNT_KINDS else "unknown"


@asynccontextmanager
async def lifespan(_: FastAPI):
    global _engine_inited
    if not _engine_inited:
        init_db()
        _engine_inited = True
    yield


def _cors_origins_list() -> list[str]:
    raw = settings.cors_origins.strip()
    if raw == "*":
        return ["*"]
    return [o.strip() for o in raw.split(",") if o.strip()]


app = FastAPI(title="Cash Cat Engine", version=__version__, lifespan=lifespan)
app.include_router(ai_provider_router)
_cors = _cors_origins_list()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_conn() -> Generator[sqlite3.Connection, None, None]:
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


API_CAPABILITIES = [
    "health",
    "categories",
    "transactions",
    "categorisation",
    "analytics",
    "akahu",
    "transfers",
    "rules",
    "budgets",
    "splits",
    "ai",
]


class HealthResponse(BaseModel):
    ok: bool = True
    version: str
    db_path: str
    capabilities: list[str]


@app.get("/health", response_model=HealthResponse, tags=["health"])
def health() -> HealthResponse:
    return HealthResponse(
        version=__version__,
        db_path=str(settings.db_path),
        capabilities=list(API_CAPABILITIES),
    )


class AkahuTokensBody(BaseModel):
    app_token: str = Field(..., description="Akahu App ID (X-Akahu-Id)")
    user_token: str = Field(..., description="User access token")


class AkahuAccountOut(BaseModel):
    akahu_account_id: str
    institution_name: str
    account_name: str
    mask: str = ""
    logo_url: str | None = None
    enabled: bool = True
    account_kind: str = "unknown"


@app.post("/akahu/validate", tags=["akahu"])
async def akahu_validate(body: AkahuTokensBody) -> dict[str, Any]:
    client = AkahuClient(body.user_token, body.app_token)
    try:
        raw_accounts = await client.list_accounts()
    except Exception as e:
        raise HTTPException(400, detail=str(e)) from e
    accounts = []
    for raw in raw_accounts:
        m = map_akahu_account(raw if isinstance(raw, dict) else {})
        m["enabled"] = True
        accounts.append(m)
    return {"accounts": accounts}


@app.post("/akahu/accounts/persist", tags=["akahu"])
def akahu_persist_accounts(
    accounts: Annotated[list[AkahuAccountOut], Body()],
    conn: sqlite3.Connection = Depends(get_conn),
) -> dict[str, str]:
    for a in accounts:
        k = _norm_account_kind(a.account_kind)
        conn.execute(
            """INSERT INTO akahu_accounts(akahu_account_id, institution_name, account_name, mask, logo_url, enabled, account_kind)
               VALUES(?,?,?,?,?,?,?)
               ON CONFLICT(akahu_account_id) DO UPDATE SET
               institution_name=excluded.institution_name,
               account_name=excluded.account_name,
               mask=excluded.mask,
               logo_url=excluded.logo_url,
               enabled=excluded.enabled,
               account_kind=excluded.account_kind""",
            (a.akahu_account_id, a.institution_name, a.account_name, a.mask, a.logo_url, 1 if a.enabled else 0, k),
        )
    conn.commit()
    return {"status": "ok"}


class AkahuSyncDefaultsBody(BaseModel):
    start: str = Field(..., description="Inclusive start date yyyy-mm-dd")
    end: str = Field(..., description="Inclusive end date yyyy-mm-dd")


class AkahuSyncBody(BaseModel):
    """All fields optional; omitted values are taken from stored app settings."""

    app_token: str | None = None
    user_token: str | None = None
    start: str | None = None
    end: str | None = None


AKAHU_CREDENTIALS_KEY = "akahu_credentials"
AKAHU_SYNC_DEFAULTS_KEY = "akahu_sync_defaults"


def _resolve_akahu_sync(
    body: AkahuSyncBody,
    conn: sqlite3.Connection,
) -> tuple[str, str, str, str]:
    creds = get_settings_json(conn, AKAHU_CREDENTIALS_KEY, {}) or {}
    defaults = get_settings_json(conn, AKAHU_SYNC_DEFAULTS_KEY, {}) or {}
    app_token = (body.app_token or creds.get("app_token") or "").strip()
    user_token = (body.user_token or creds.get("user_token") or "").strip()
    start = (body.start or defaults.get("start") or "").strip()
    end = (body.end or defaults.get("end") or "").strip()
    return app_token, user_token, start, end


def _akahu_time_range_query_params(start: str, end: str) -> tuple[str, str]:
    """Map stored yyyy-mm-dd sync window to Akahu query params (ISO 8601 date-time).

    Akahu documents ``start`` as exclusive and ``end`` as inclusive. Plain dates are
    expanded to UTC day bounds so the API receives ``date-time`` values.
    """
    s = start.strip()
    e = end.strip()
    if re.match(r"^\d{4}-\d{2}-\d{2}$", s):
        s = f"{s}T00:00:00.000Z"
    if re.match(r"^\d{4}-\d{2}-\d{2}$", e):
        e = f"{e}T23:59:59.999Z"
    return s, e


@app.post("/akahu/credentials", tags=["akahu"])
def akahu_post_credentials(body: AkahuTokensBody, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, str]:
    set_settings_json(
        conn,
        AKAHU_CREDENTIALS_KEY,
        {"app_token": body.app_token.strip(), "user_token": body.user_token.strip()},
    )
    return {"status": "ok"}


@app.get("/akahu/credentials", tags=["akahu"])
def akahu_get_credentials(conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, str]:
    cur = get_settings_json(conn, AKAHU_CREDENTIALS_KEY, {}) or {}
    return {
        "app_token": str(cur.get("app_token", "") or ""),
        "user_token": str(cur.get("user_token", "") or ""),
    }


@app.get("/akahu/sync-defaults", tags=["akahu"])
def akahu_get_sync_defaults(conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, str]:
    cur = get_settings_json(conn, AKAHU_SYNC_DEFAULTS_KEY, {}) or {}
    return {
        "start": str(cur.get("start", "") or ""),
        "end": str(cur.get("end", "") or ""),
    }


@app.post("/akahu/sync-defaults", tags=["akahu"])
def akahu_post_sync_defaults(body: AkahuSyncDefaultsBody, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, str]:
    set_settings_json(
        conn,
        AKAHU_SYNC_DEFAULTS_KEY,
        {"start": body.start.strip(), "end": body.end.strip()},
    )
    return {"status": "ok"}


@app.get("/akahu/accounts", tags=["akahu"])
def akahu_list_accounts(conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    rows = conn.execute(
        """SELECT akahu_account_id, institution_name, account_name, mask, logo_url, enabled, account_kind
           FROM akahu_accounts ORDER BY institution_name, account_name"""
    ).fetchall()
    items = [
        {
            "akahu_account_id": r["akahu_account_id"],
            "institution_name": r["institution_name"],
            "account_name": r["account_name"],
            "mask": r["mask"] or "",
            "logo_url": r["logo_url"],
            "enabled": bool(r["enabled"]),
            "account_kind": _norm_account_kind(r["account_kind"]),
        }
        for r in rows
    ]
    return {"accounts": items}


@app.get("/analytics/txn-date-bounds", tags=["analytics"])
def analytics_txn_date_bounds(conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, str | None]:
    row = conn.execute("SELECT MIN(txn_date) AS mn, MAX(txn_date) AS mx FROM transactions").fetchone()
    if not row or row["mn"] is None or row["mx"] is None:
        return {"min_date": None, "max_date": None}
    return {"min_date": str(row["mn"]), "max_date": str(row["mx"])}


@app.post("/akahu/sync", tags=["akahu"])
async def akahu_sync(
    body: AkahuSyncBody = Body(default_factory=AkahuSyncBody),
    conn: sqlite3.Connection = Depends(get_conn),
) -> dict[str, Any]:
    app_token, user_token, start, end = _resolve_akahu_sync(body, conn)
    missing: list[str] = []
    if not app_token:
        missing.append("app_token")
    if not user_token:
        missing.append("user_token")
    if not start:
        missing.append("start")
    if not end:
        missing.append("end")
    if missing:
        raise HTTPException(
            400,
            detail=f"Missing Akahu sync settings: {', '.join(missing)}. Save credentials and sync date range, or pass them in the request body.",
        )
    client = AkahuClient(user_token, app_token)
    enabled = conn.execute(
        "SELECT akahu_account_id FROM akahu_accounts WHERE enabled = 1"
    ).fetchall()
    ids = [r[0] for r in enabled]
    if not ids:
        raise HTTPException(400, detail="No enabled accounts")
    q_start, q_end = _akahu_time_range_query_params(start, end)
    imported = 0
    cur = conn.cursor()
    cur.execute("INSERT INTO imports(source_type, row_count, date_start, date_end) VALUES('akahu', 0, ?, ?)", (start, end))
    import_id = cur.lastrowid
    conn.commit()
    account_errors: dict[str, str] = {}
    for acc_id in ids:
        try:
            txns = await client.list_transactions(start=q_start, end=q_end, account_id=acc_id)
        except Exception as e:
            account_errors[acc_id] = str(e)
            continue
        for t in txns:
            if not isinstance(t, dict):
                continue
            tid = str(t.get("_id") or t.get("id") or "")
            raw_date = t.get("date") or t.get("transaction_date") or ""
            if "T" in str(raw_date):
                ds = str(raw_date)[:10]
            else:
                ds = str(raw_date)[:10]
            amt_raw = t.get("amount") or t.get("value") or 0
            try:
                cents = int(round(float(amt_raw) * 100))
            except (TypeError, ValueError):
                continue
            desc = str(t.get("description") or t.get("meta", {}).get("particulars", "") or "")
            prov = conn.execute(
                "SELECT institution_name FROM akahu_accounts WHERE akahu_account_id = ?",
                (acc_id,),
            ).fetchone()
            provider = prov[0] if prov else ""
            nm = normalise_merchant(desc)
            dedupe = hashlib.sha256(f"akahu|{tid}|{acc_id}".encode()).hexdigest()
            try:
                conn.execute(
                    """INSERT INTO transactions(
                       import_id, txn_date, amount_cents, description_raw, normalised_merchant, dedupe_hash,
                       source_label, account_label, provider, external_id, akahu_account_id)
                       VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
                    (
                        import_id,
                        ds,
                        cents,
                        desc,
                        nm,
                        dedupe,
                        "akahu",
                        acc_id,
                        provider,
                        tid or dedupe,
                        acc_id,
                    ),
                )
                imported += 1
            except sqlite3.IntegrityError:
                pass
        conn.commit()
    conn.execute(
        "UPDATE imports SET row_count = ?, date_start = ?, date_end = ? WHERE id = ?",
        (imported, start, end, import_id),
    )
    conn.commit()
    cat_stats = categorize_connection(conn, mode="missing")
    transfer_stats = detect_and_persist_pairs(conn)
    return {
        "imported": imported,
        "import_id": import_id,
        "categorisation": cat_stats,
        "transfers": transfer_stats,
        "account_errors": account_errors,
    }


class FilterParams(BaseModel):
    date_from: str | None = None
    date_to: str | None = None
    sources: list[str] | None = None
    exclude_paired_transfer_legs: bool = True
    exclude_expense_category_keys: list[str] = Field(default_factory=list)


class CashflowParams(FilterParams):
    bucket: Literal["auto", "day", "week", "month"] = "auto"


@app.post("/analytics/summary", tags=["analytics"])
def analytics_summary(p: FilterParams, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    d = dashboard_summary(conn, p.model_dump())
    cats = category_breakdown(conn, p.model_dump())
    insights = build_insights(d, cats)
    return {"summary": d, "categories": cats, "insights": insights}


@app.post("/analytics/monthly", tags=["analytics"])
def analytics_monthly(p: FilterParams, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    return {"series": monthly_series(conn, p.model_dump())}


@app.post("/analytics/cashflow", tags=["analytics"])
def analytics_cashflow(p: CashflowParams, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    params = p.model_dump()
    b = resolve_cashflow_bucket(params)
    return {"series": cashflow_series(conn, params, b), "bucket": b}


@app.post("/analytics/monthly-by-category", tags=["analytics"])
def analytics_monthly_by_category(p: FilterParams, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    return {"series": monthly_series_by_category(conn, p.model_dump())}


@app.post("/analytics/tags", tags=["analytics"])
def analytics_tags(p: FilterParams, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    return {"tags": tag_breakdown(conn, p.model_dump())}


@app.post("/analytics/recurring", tags=["analytics"])
def analytics_recurring(p: FilterParams, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    return {"candidates": recurring_suggestions(conn, p.model_dump())}


@app.post("/analytics/savings-rate", tags=["analytics"])
def analytics_savings_rate(p: FilterParams, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    return {"series": savings_rate_series(conn, p.model_dump())}


@app.post("/analytics/daily-spend", tags=["analytics"])
def analytics_daily_spend(p: FilterParams, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    return {"days": daily_expense_totals(conn, p.model_dump())}


@app.post("/export/transactions.csv", tags=["export"])
def export_transactions_csv_filtered(
    p: FilterParams,
    conn: sqlite3.Connection = Depends(get_conn),
) -> Response:
    """Export transactions matching the same date/source filters as analytics."""
    import csv
    import io

    from cash_cat.analytics import filtered_transactions

    rows = filtered_transactions(
        conn,
        date_from=p.date_from,
        date_to=p.date_to,
        sources=p.sources,
    )
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["date", "amount_dollars", "description", "provider", "source", "dedupe_hash"])
    for r in rows:
        w.writerow(
            [
                r["txn_date"],
                r["amount_cents"] / 100,
                r["description_raw"],
                r["provider"] or "",
                r["source_label"],
                r["dedupe_hash"],
            ]
        )
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="cash_cat_export.csv"'},
    )


@app.get("/export/transactions.csv", tags=["export"])
def export_transactions_csv(
    conn: sqlite3.Connection = Depends(get_conn),
) -> Response:
    """Unfiltered export (all rows, newest first). Prefer POST /export/transactions.csv with filters."""
    import csv
    import io

    rows = conn.execute(
        "SELECT txn_date, amount_cents, description_raw, provider, source_label, dedupe_hash FROM transactions ORDER BY txn_date DESC"
    ).fetchall()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["date", "amount_dollars", "description", "provider", "source", "dedupe_hash"])
    for r in rows:
        w.writerow(
            [
                r["txn_date"],
                r["amount_cents"] / 100,
                r["description_raw"],
                r["provider"] or "",
                r["source_label"],
                r["dedupe_hash"],
            ]
        )
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="cash_cat_export.csv"'},
    )


TAG_SLUG_RE = re.compile(r"^[a-z][a-z0-9_]{0,63}$")
_MAX_TXN_TAGS = 24


def _parse_tags_json(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    out: list[str] = []
    for x in data:
        if isinstance(x, str):
            s = x.strip().lower()
            if s and TAG_SLUG_RE.match(s) and s not in out:
                out.append(s)
    out.sort()
    return out


def _normalize_txn_tags(tags: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for raw in tags:
        s = str(raw).strip().lower()
        if not s:
            continue
        if not TAG_SLUG_RE.match(s):
            raise HTTPException(
                400,
                detail="Invalid tag: use lowercase letters, digits, and underscores only (like category keys).",
            )
        if s not in seen:
            seen.add(s)
            out.append(s)
    out.sort()
    if len(out) > _MAX_TXN_TAGS:
        raise HTTPException(400, detail=f"At most {_MAX_TXN_TAGS} tags per transaction")
    return out


def _transaction_row_to_item(r: sqlite3.Row) -> dict[str, Any]:
    d = {k: r[k] for k in r.keys()}
    tj = d.pop("tags_json", "[]")
    d["tags"] = _parse_tags_json(tj if isinstance(tj, str) else "[]")
    return d


def _patch_transaction_response(conn: sqlite3.Connection, transaction_id: int) -> dict[str, Any]:
    row = conn.execute(
        """
        SELECT
          t.tags_json,
          t.included,
          ca.category_key AS category_key,
          ca.is_override AS category_is_override,
          c.display_name AS category_display_name
        FROM transactions t
        LEFT JOIN category_assignments ca ON ca.transaction_id = t.id
        LEFT JOIN categories c ON c.key = ca.category_key
        WHERE t.id = ?
        """,
        (transaction_id,),
    ).fetchone()
    if not row:
        raise HTTPException(404, detail="Transaction not found")
    return {
        "status": "ok",
        "tags": _parse_tags_json(row["tags_json"]),
        "category_key": row["category_key"],
        "category_display_name": row["category_display_name"],
        "category_is_override": row["category_is_override"],
        "included": int(row["included"]) if row["included"] is not None else 1,
    }


def _split_id_csv(ids_csv: str | None) -> list[int]:
    out: list[int] = []
    if not ids_csv:
        return out
    for part in str(ids_csv).split(","):
        if part.strip().isdigit():
            out.append(int(part.strip()))
    return out


def _transaction_list_query(
    conn: sqlite3.Connection,
    *,
    limit: int,
    offset: int,
    date_from: str | None,
    date_to: str | None,
    category_key: str | None,
    source: str | None,
    account_label: str | None,
    tag: str | None,
    q: str | None,
    min_amount_cents: int | None,
    max_amount_cents: int | None,
) -> tuple[str, list[Any]]:
    where: list[str] = ["1=1"]
    args: list[Any] = []
    if date_from:
        where.append("t.txn_date >= ?")
        args.append(date_from)
    if date_to:
        where.append("t.txn_date <= ?")
        args.append(date_to)
    if category_key:
        where.append("ca.category_key = ?")
        args.append(category_key)
    if source:
        where.append("(t.source_label = ? OR t.account_label = ?)")
        args.extend([source, source])
    if account_label:
        where.append("t.account_label = ?")
        args.append(account_label)
    if tag:
        where.append("t.tags_json LIKE ?")
        args.append(f'%"{tag.strip().lower()}"%')
    if q and q.strip():
        qv = f"%{q.strip()}%"
        where.append(
            "(t.description_raw LIKE ? OR CAST(t.id AS TEXT) LIKE ? OR COALESCE(t.provider,'') LIKE ? OR COALESCE(t.account_label,'') LIKE ? OR COALESCE(t.external_id,'') LIKE ?)"
        )
        args.extend([qv, qv, qv, qv, qv])
    if min_amount_cents is not None:
        where.append("t.amount_cents >= ?")
        args.append(min_amount_cents)
    if max_amount_cents is not None:
        where.append("t.amount_cents <= ?")
        args.append(max_amount_cents)
    wsql = " AND ".join(where)
    base = f"""
        FROM transactions t
        LEFT JOIN category_assignments ca ON ca.transaction_id = t.id
        LEFT JOIN categories c ON c.key = ca.category_key
        WHERE {wsql}
    """
    return base, args


@app.get("/transactions", tags=["transactions"])
def list_transactions(
    limit: int = 200,
    offset: int = 0,
    date_from: str | None = None,
    date_to: str | None = None,
    category_key: str | None = None,
    source: str | None = None,
    account_label: str | None = None,
    tag: str | None = None,
    q: str | None = None,
    min_amount_cents: int | None = None,
    max_amount_cents: int | None = None,
    conn: sqlite3.Connection = Depends(get_conn),
) -> dict[str, Any]:
    lim = max(1, min(limit, 2000))
    off = max(0, offset)
    base, args = _transaction_list_query(
        conn,
        limit=lim,
        offset=off,
        date_from=date_from,
        date_to=date_to,
        category_key=category_key,
        source=source,
        account_label=account_label,
        tag=tag,
        q=q,
        min_amount_cents=min_amount_cents,
        max_amount_cents=max_amount_cents,
    )
    count_row = conn.execute(f"SELECT COUNT(DISTINCT t.id) AS n {base}", args).fetchone()
    total = int(count_row["n"]) if count_row else 0
    rows = conn.execute(
        f"""
        SELECT
          t.*,
          ca.category_key AS category_key,
          ca.is_override AS category_is_override,
          c.display_name AS category_display_name,
          (SELECT COUNT(*) FROM transactions t2 WHERE t2.description_raw IS t.description_raw) AS same_description_count,
          (SELECT tp.id FROM transfer_pairs tp WHERE t.id = tp.debit_id OR t.id = tp.credit_id LIMIT 1) AS transfer_pair_id,
          (SELECT tp.pair_type FROM transfer_pairs tp WHERE t.id = tp.debit_id OR t.id = tp.credit_id LIMIT 1) AS transfer_pair_type
        {base}
        ORDER BY t.txn_date DESC, t.id DESC
        LIMIT ? OFFSET ?
        """,
        (*args, lim, off),
    ).fetchall()
    return {"items": [_transaction_row_to_item(r) for r in rows], "total": total, "limit": lim, "offset": off}


@app.get("/transactions/{transaction_id}", tags=["transactions"])
def get_transaction_detail(transaction_id: int, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    row = conn.execute(
        """
        SELECT
          t.*,
          ca.category_key AS category_key,
          ca.is_override AS category_is_override,
          c.display_name AS category_display_name,
          (SELECT tp.id FROM transfer_pairs tp WHERE t.id = tp.debit_id OR t.id = tp.credit_id LIMIT 1) AS transfer_pair_id,
          (SELECT tp.pair_type FROM transfer_pairs tp WHERE t.id = tp.debit_id OR t.id = tp.credit_id LIMIT 1) AS transfer_pair_type
        FROM transactions t
        LEFT JOIN category_assignments ca ON ca.transaction_id = t.id
        LEFT JOIN categories c ON c.key = ca.category_key
        WHERE t.id = ?
        """,
        (transaction_id,),
    ).fetchone()
    if not row:
        raise HTTPException(404, detail="Transaction not found")
    item = _transaction_row_to_item(row)
    explain = explain_transaction_category(conn, transaction_id)
    split_rows = conn.execute(
        "SELECT id, category_key, amount_cents, note FROM transaction_splits WHERE transaction_id = ? ORDER BY id",
        (transaction_id,),
    ).fetchall()
    item["splits"] = [
        {"id": r["id"], "category_key": r["category_key"], "amount_cents": int(r["amount_cents"]), "note": r["note"]}
        for r in split_rows
    ]
    item["categorisation_explain"] = explain
    return item


@app.get("/transactions/duplicate-report", tags=["transactions"])
def transactions_duplicate_report(conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    """Read-only clusters of duplicate rows: same Akahu ``external_id``, or same CSV key (non-Akahu)."""
    akahu_rows = conn.execute(
        """
        SELECT
          t.external_id AS external_id,
          COUNT(*) AS cnt,
          MIN(t.txn_date) AS txn_date,
          MIN(t.amount_cents) AS amount_cents,
          MIN(t.description_raw) AS description_raw,
          GROUP_CONCAT(t.id) AS ids_csv
        FROM transactions t
        WHERE t.source_label = 'akahu'
          AND t.external_id IS NOT NULL
          AND TRIM(t.external_id) != ''
        GROUP BY t.external_id
        HAVING COUNT(*) > 1
        ORDER BY cnt DESC, external_id
        """
    ).fetchall()
    akahu_clusters: list[dict[str, Any]] = []
    for r in akahu_rows:
        akahu_clusters.append(
            {
                "external_id": r["external_id"],
                "count": int(r["cnt"]),
                "txn_date": r["txn_date"],
                "amount_cents": int(r["amount_cents"]),
                "description_raw": r["description_raw"],
                "transaction_ids": sorted(_split_id_csv(r["ids_csv"])),
            }
        )

    fuzzy_rows = conn.execute(
        """
        SELECT
          t.txn_date AS txn_date,
          t.amount_cents AS amount_cents,
          t.description_raw AS description_raw,
          COALESCE(t.source_label, '') AS source_label,
          COALESCE(t.account_label, '') AS account_label,
          COUNT(*) AS cnt,
          GROUP_CONCAT(t.id) AS ids_csv
        FROM transactions t
        WHERE t.source_label != 'akahu'
        GROUP BY t.txn_date, t.amount_cents, t.description_raw, COALESCE(t.source_label, ''), COALESCE(t.account_label, '')
        HAVING COUNT(*) > 1
        ORDER BY cnt DESC, txn_date DESC
        """
    ).fetchall()
    fuzzy_clusters: list[dict[str, Any]] = []
    for r in fuzzy_rows:
        fuzzy_clusters.append(
            {
                "txn_date": r["txn_date"],
                "amount_cents": int(r["amount_cents"]),
                "description_raw": r["description_raw"],
                "source_label": r["source_label"] or None,
                "account_label": r["account_label"] or None,
                "count": int(r["cnt"]),
                "transaction_ids": sorted(_split_id_csv(r["ids_csv"])),
            }
        )

    return {
        "akahu_duplicate_clusters": akahu_clusters,
        "akahu_cluster_count": len(akahu_clusters),
        "fuzzy_duplicate_clusters": fuzzy_clusters,
        "fuzzy_cluster_count": len(fuzzy_clusters),
    }


@app.post("/transactions/dedupe-duplicate-rows", tags=["transactions"])
def transactions_dedupe_duplicate_rows(conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    """Delete extra duplicate rows, keeping the lowest ``id`` per cluster (same grouping as duplicate-report)."""
    deleted_akahu = 0
    deleted_fuzzy = 0

    ext_rows = conn.execute(
        """
        SELECT t.external_id
        FROM transactions t
        WHERE t.source_label = 'akahu'
          AND t.external_id IS NOT NULL
          AND TRIM(t.external_id) != ''
        GROUP BY t.external_id
        HAVING COUNT(*) > 1
        """
    ).fetchall()
    for (ext_id,) in ext_rows:
        id_rows = conn.execute(
            "SELECT id FROM transactions WHERE external_id = ? ORDER BY id",
            (ext_id,),
        ).fetchall()
        ids = [int(r[0]) for r in id_rows]
        for tid in ids[1:]:
            conn.execute("DELETE FROM transactions WHERE id = ?", (tid,))
            deleted_akahu += 1

    fuzzy_groups = conn.execute(
        """
        SELECT t.txn_date, t.amount_cents, t.description_raw,
               COALESCE(t.source_label, ''), COALESCE(t.account_label, '')
        FROM transactions t
        WHERE t.source_label != 'akahu'
        GROUP BY t.txn_date, t.amount_cents, t.description_raw, COALESCE(t.source_label, ''), COALESCE(t.account_label, '')
        HAVING COUNT(*) > 1
        """
    ).fetchall()
    for txn_date, amount_cents, description_raw, source_label, account_label in fuzzy_groups:
        id_rows = conn.execute(
            """
            SELECT id FROM transactions
            WHERE source_label != 'akahu'
              AND txn_date = ? AND amount_cents = ? AND description_raw = ?
              AND COALESCE(source_label, '') = ? AND COALESCE(account_label, '') = ?
            ORDER BY id
            """,
            (txn_date, amount_cents, description_raw, source_label, account_label),
        ).fetchall()
        ids = [int(r[0]) for r in id_rows]
        for tid in ids[1:]:
            conn.execute("DELETE FROM transactions WHERE id = ?", (tid,))
            deleted_fuzzy += 1

    conn.commit()
    return {
        "status": "ok",
        "deleted_akahu_rows": deleted_akahu,
        "deleted_fuzzy_rows": deleted_fuzzy,
    }


class TransactionPatchBody(BaseModel):
    """Update category, manual tags, and/or include-in-totals flag. Send at least one field."""

    category_key: str | None = None
    tags: list[str] | None = None
    included: bool | None = None

    @model_validator(mode="after")
    def at_least_one_field(self) -> TransactionPatchBody:
        if self.category_key is None and self.tags is None and self.included is None:
            raise ValueError("Provide category_key, tags, and/or included")
        return self


@app.patch("/transactions/{transaction_id}", tags=["transactions"])
def patch_transaction(
    transaction_id: int,
    body: TransactionPatchBody,
    conn: sqlite3.Connection = Depends(get_conn),
) -> dict[str, Any]:
    """Set category, tags, or both. Tags replace the full list when provided."""
    exists = conn.execute("SELECT 1 FROM transactions WHERE id = ?", (transaction_id,)).fetchone()
    if not exists:
        raise HTTPException(404, detail="Transaction not found")

    if body.tags is not None:
        normalized = _normalize_txn_tags(body.tags)
        conn.execute(
            "UPDATE transactions SET tags_json = ? WHERE id = ?",
            (json.dumps(normalized), transaction_id),
        )

    if body.category_key is not None:
        key = body.category_key.strip()
        if not key:
            raise HTTPException(400, detail="category_key cannot be empty")
        cat = conn.execute(
            "SELECT key FROM categories WHERE key = ? AND archived = 0",
            (key,),
        ).fetchone()
        if not cat:
            raise HTTPException(400, detail="Unknown or archived category")
        conn.execute(
            """
            INSERT INTO category_assignments (transaction_id, category_key, is_override)
            VALUES (?, ?, 1)
            ON CONFLICT(transaction_id) DO UPDATE SET
              category_key = excluded.category_key,
              is_override = 1
            """,
            (transaction_id, key),
        )

    if body.included is not None:
        conn.execute(
            "UPDATE transactions SET included = ? WHERE id = ?",
            (1 if body.included else 0, transaction_id),
        )

    conn.commit()
    return _patch_transaction_response(conn, transaction_id)


class BulkAssignBody(BaseModel):
    category_key: str
    transaction_ids: list[int]


@app.post("/transactions/bulk-assign", tags=["transactions"])
def transactions_bulk_assign(body: BulkAssignBody, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    key = body.category_key.strip()
    if not key:
        raise HTTPException(400, detail="category_key cannot be empty")
    cat = conn.execute("SELECT key FROM categories WHERE key = ? AND archived = 0", (key,)).fetchone()
    if not cat:
        raise HTTPException(400, detail="Unknown or archived category")
    updated = 0
    for tid in body.transaction_ids:
        exists = conn.execute("SELECT 1 FROM transactions WHERE id = ?", (tid,)).fetchone()
        if not exists:
            continue
        conn.execute(
            """
            INSERT INTO category_assignments (transaction_id, category_key, is_override)
            VALUES (?, ?, 1)
            ON CONFLICT(transaction_id) DO UPDATE SET
              category_key = excluded.category_key,
              is_override = 1
            """,
            (tid, key),
        )
        updated += 1
    conn.commit()
    return {"status": "ok", "updated": updated}


class BulkAssignByDescriptionBody(BaseModel):
    category_key: str
    description_raw: str | None = None


@app.post("/transactions/bulk-assign-by-description", tags=["transactions"])
def transactions_bulk_assign_by_description(
    body: BulkAssignByDescriptionBody, conn: sqlite3.Connection = Depends(get_conn)
) -> dict[str, Any]:
    """Assign a category to every transaction whose description_raw matches exactly (including NULL with NULL)."""
    key = body.category_key.strip()
    if not key:
        raise HTTPException(400, detail="category_key cannot be empty")
    cat = conn.execute("SELECT key FROM categories WHERE key = ? AND archived = 0", (key,)).fetchone()
    if not cat:
        raise HTTPException(400, detail="Unknown or archived category")
    if body.description_raw is None:
        rows = conn.execute("SELECT id FROM transactions WHERE description_raw IS NULL").fetchall()
    else:
        rows = conn.execute(
            "SELECT id FROM transactions WHERE description_raw = ?",
            (body.description_raw,),
        ).fetchall()
    updated = 0
    for row in rows:
        tid = int(row["id"])
        conn.execute(
            """
            INSERT INTO category_assignments (transaction_id, category_key, is_override)
            VALUES (?, ?, 1)
            ON CONFLICT(transaction_id) DO UPDATE SET
              category_key = excluded.category_key,
              is_override = 1
            """,
            (tid, key),
        )
        updated += 1
    conn.commit()
    return {"status": "ok", "updated": updated, "matched": len(rows)}


class SplitRowIn(BaseModel):
    category_key: str
    amount_cents: int = Field(gt=0)
    note: str | None = None


class TransactionSplitsBody(BaseModel):
    splits: list[SplitRowIn]


@app.get("/transactions/{transaction_id}/splits", tags=["transactions"])
def get_transaction_splits(transaction_id: int, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    exists = conn.execute("SELECT 1 FROM transactions WHERE id = ?", (transaction_id,)).fetchone()
    if not exists:
        raise HTTPException(404, detail="Transaction not found")
    rows = conn.execute(
        "SELECT id, category_key, amount_cents, note FROM transaction_splits WHERE transaction_id = ? ORDER BY id",
        (transaction_id,),
    ).fetchall()
    return {
        "items": [
            {"id": r["id"], "category_key": r["category_key"], "amount_cents": int(r["amount_cents"]), "note": r["note"]}
            for r in rows
        ]
    }


@app.put("/transactions/{transaction_id}/splits", tags=["transactions"])
def put_transaction_splits(
    transaction_id: int,
    body: TransactionSplitsBody,
    conn: sqlite3.Connection = Depends(get_conn),
) -> dict[str, Any]:
    row = conn.execute("SELECT amount_cents FROM transactions WHERE id = ?", (transaction_id,)).fetchone()
    if not row:
        raise HTTPException(404, detail="Transaction not found")
    amt = int(row["amount_cents"])
    if amt >= 0:
        raise HTTPException(400, detail="Splits only apply to outflows (negative amounts)")
    need = abs(amt)
    total = sum(s.amount_cents for s in body.splits)
    if total != need:
        raise HTTPException(400, detail=f"Split amounts must sum to {need} cents (got {total})")
    for s in body.splits:
        ck = s.category_key.strip()
        c = conn.execute("SELECT key FROM categories WHERE key = ? AND archived = 0", (ck,)).fetchone()
        if not c:
            raise HTTPException(400, detail=f"Unknown or archived category: {ck}")
    conn.execute("DELETE FROM transaction_splits WHERE transaction_id = ?", (transaction_id,))
    for s in body.splits:
        conn.execute(
            "INSERT INTO transaction_splits(transaction_id, category_key, amount_cents, note) VALUES (?,?,?,?)",
            (transaction_id, s.category_key.strip(), s.amount_cents, s.note),
        )
    conn.commit()
    return {"status": "ok"}


@app.post("/import/csv", tags=["import"])
async def import_csv(file: UploadFile = File(...), conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    raw = (await file.read()).decode("utf-8", errors="replace")
    rows, report = ingest_csv_text(raw, source_label=file.filename or "csv")
    if "error" in report:
        raise HTTPException(400, detail=report)
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO imports(source_type, file_path, row_count, skipped_rows, mapping_json) VALUES('csv', ?, ?, ?, ?)",
        (
            file.filename,
            len(rows),
            report.get("skipped_rows", 0),
            json.dumps(report.get("columns_detected")),
        ),
    )
    import_id = cur.lastrowid
    n = 0
    for row in rows:
        nm = normalise_merchant(row["description_raw"])
        try:
            conn.execute(
                """INSERT INTO transactions(
                   import_id, txn_date, amount_cents, description_raw, normalised_merchant, dedupe_hash, source_label, account_label)
                   VALUES(?,?,?,?,?,?,?,?)""",
                (
                    import_id,
                    row["txn_date"],
                    row["amount_cents"],
                    row["description_raw"],
                    nm,
                    row["dedupe_hash"],
                    row["source_label"],
                    row["account_label"],
                ),
            )
            n += 1
        except sqlite3.IntegrityError:
            pass
    conn.commit()
    cat_stats = categorize_connection(conn, mode="missing")
    transfer_stats = detect_and_persist_pairs(conn)
    return {"inserted": n, "report": report, "categorisation": cat_stats, "transfers": transfer_stats}


class ReapplyBody(BaseModel):
    mode: str = Field(default="reapply", description="reapply or missing")


@app.post("/categorisation/reapply", tags=["categorisation"])
def categorisation_reapply(
    body: ReapplyBody = ReapplyBody(),
    conn: sqlite3.Connection = Depends(get_conn),
) -> dict[str, Any]:
    mode = body.mode or "reapply"
    if mode not in ("reapply", "missing"):
        raise HTTPException(400, detail="mode must be reapply or missing")
    return categorize_connection(conn, mode=mode)


KEY_RE = re.compile(r"^[a-z][a-z0-9_]{0,63}$")


class RuleCreate(BaseModel):
    pattern: str
    category_key: str
    sort_order: int = 200


class RuleUpdate(BaseModel):
    pattern: str | None = None
    category_key: str | None = None
    sort_order: int | None = None


@app.get("/rules", tags=["rules"])
def rules_list(conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    rows = conn.execute(
        "SELECT id, sort_order, pattern, category_key FROM rules ORDER BY sort_order, id"
    ).fetchall()
    return {
        "items": [
            {"id": int(r["id"]), "sort_order": int(r["sort_order"]), "pattern": r["pattern"], "category_key": r["category_key"]}
            for r in rows
        ]
    }


@app.post("/rules", tags=["rules"])
def rules_create(body: RuleCreate, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    cat = conn.execute("SELECT key FROM categories WHERE key = ? AND archived = 0", (body.category_key,)).fetchone()
    if not cat:
        raise HTTPException(400, detail="Unknown or archived category")
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO rules (sort_order, pattern, category_key) VALUES (?, ?, ?)",
        (body.sort_order, body.pattern.strip(), body.category_key.strip()),
    )
    conn.commit()
    return {"id": int(cur.lastrowid)}


@app.patch("/rules/{rule_id}", tags=["rules"])
def rules_update(rule_id: int, body: RuleUpdate, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, str]:
    row = conn.execute("SELECT id FROM rules WHERE id = ?", (rule_id,)).fetchone()
    if not row:
        raise HTTPException(404, detail="Rule not found")
    if body.category_key is not None:
        cat = conn.execute(
            "SELECT key FROM categories WHERE key = ? AND archived = 0",
            (body.category_key.strip(),),
        ).fetchone()
        if not cat:
            raise HTTPException(400, detail="Unknown or archived category")
    sets: list[str] = []
    args: list[Any] = []
    if body.pattern is not None:
        sets.append("pattern = ?")
        args.append(body.pattern.strip())
    if body.category_key is not None:
        sets.append("category_key = ?")
        args.append(body.category_key.strip())
    if body.sort_order is not None:
        sets.append("sort_order = ?")
        args.append(body.sort_order)
    if not sets:
        return {"status": "ok"}
    args.append(rule_id)
    conn.execute(f"UPDATE rules SET {', '.join(sets)} WHERE id = ?", args)
    conn.commit()
    return {"status": "ok"}


@app.delete("/rules/{rule_id}", tags=["rules"])
def rules_delete(rule_id: int, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, str]:
    cur = conn.execute("DELETE FROM rules WHERE id = ?", (rule_id,))
    if cur.rowcount == 0:
        raise HTTPException(404, detail="Rule not found")
    conn.commit()
    return {"status": "deleted"}


class BudgetUpsert(BaseModel):
    monthly_cents: int
    starts_on: str | None = None


@app.get("/budgets", tags=["budgets"])
def budgets_list(conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    rows = conn.execute(
        """
        SELECT b.category_key, b.monthly_cents, b.starts_on, c.display_name
        FROM budgets b
        JOIN categories c ON c.key = b.category_key
        ORDER BY c.sort_order, b.category_key
        """
    ).fetchall()
    return {
        "items": [
            {
                "category_key": r["category_key"],
                "display_name": r["display_name"],
                "monthly_cents": int(r["monthly_cents"]),
                "starts_on": r["starts_on"],
            }
            for r in rows
        ]
    }


@app.post("/budgets/{category_key}", tags=["budgets"])
def budgets_upsert(
    category_key: str,
    body: BudgetUpsert,
    conn: sqlite3.Connection = Depends(get_conn),
) -> dict[str, str]:
    cat = conn.execute("SELECT key FROM categories WHERE key = ? AND archived = 0", (category_key,)).fetchone()
    if not cat:
        raise HTTPException(400, detail="Unknown or archived category")
    starts = body.starts_on.strip() if body.starts_on else None
    conn.execute(
        """
        INSERT INTO budgets (category_key, monthly_cents, starts_on)
        VALUES (?, ?, COALESCE(?, date('now')))
        ON CONFLICT(category_key) DO UPDATE SET
          monthly_cents = excluded.monthly_cents,
          starts_on = COALESCE(excluded.starts_on, budgets.starts_on)
        """,
        (category_key, body.monthly_cents, starts),
    )
    conn.commit()
    return {"status": "ok"}


@app.delete("/budgets/{category_key}", tags=["budgets"])
def budgets_delete(category_key: str, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, str]:
    cur = conn.execute("DELETE FROM budgets WHERE category_key = ?", (category_key,))
    if cur.rowcount == 0:
        raise HTTPException(404, detail="Budget not found")
    conn.commit()
    return {"status": "deleted"}


@app.post("/maintenance/refresh-merchants", tags=["maintenance"])
def maintenance_refresh_merchants(conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    rows = conn.execute("SELECT id, description_raw FROM transactions").fetchall()
    n = 0
    for r in rows:
        nm = normalise_merchant(r["description_raw"])
        conn.execute("UPDATE transactions SET normalised_merchant = ? WHERE id = ?", (nm, r["id"]))
        n += 1
    conn.commit()
    return {"status": "ok", "rows_updated": n}


class CategoryCreate(BaseModel):
    key: str
    display_name: str
    sort_order: int | None = None


class CategoryUpdate(BaseModel):
    display_name: str | None = None
    sort_order: int | None = None
    archived: bool | None = None


@app.get("/categories", tags=["categories"])
def list_categories(
    include_archived: bool = False,
    conn: sqlite3.Connection = Depends(get_conn),
) -> dict[str, Any]:
    if include_archived:
        rows = conn.execute(
            "SELECT key, display_name, source, sort_order, archived FROM categories ORDER BY sort_order, key"
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT key, display_name, source, sort_order, archived FROM categories WHERE archived = 0 ORDER BY sort_order, key"
        ).fetchall()
    return {
        "items": [
            {
                "key": r["key"],
                "display_name": r["display_name"],
                "source": r["source"],
                "sort_order": r["sort_order"],
                "archived": bool(r["archived"]),
            }
            for r in rows
        ]
    }


@app.post("/categories", tags=["categories"])
def create_category(body: CategoryCreate, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    if not KEY_RE.match(body.key):
        raise HTTPException(400, detail="Invalid key: use lowercase letters, digits, underscores")
    exists = conn.execute("SELECT 1 FROM categories WHERE key = ?", (body.key,)).fetchone()
    if exists:
        raise HTTPException(409, detail="Category key already exists")
    sort_order = body.sort_order if body.sort_order is not None else 200
    conn.execute(
        "INSERT INTO categories (key, display_name, source, sort_order, archived) VALUES (?, ?, 'user', ?, 0)",
        (body.key, body.display_name.strip(), sort_order),
    )
    conn.commit()
    return {"key": body.key}


@app.patch("/categories/{key}", tags=["categories"])
def update_category(
    key: str,
    body: CategoryUpdate,
    conn: sqlite3.Connection = Depends(get_conn),
) -> dict[str, str]:
    row = conn.execute(
        "SELECT source FROM categories WHERE key = ?",
        (key,),
    ).fetchone()
    if not row:
        raise HTTPException(404, detail="Unknown category")
    source = row["source"]
    if source == "preset":
        if body.display_name is not None:
            conn.execute(
                "UPDATE categories SET display_name = ? WHERE key = ?",
                (body.display_name.strip(), key),
            )
        if body.sort_order is not None:
            conn.execute("UPDATE categories SET sort_order = ? WHERE key = ?", (body.sort_order, key))
        if body.archived is not None:
            raise HTTPException(400, detail="Cannot archive preset categories via this API")
    else:
        if body.display_name is not None:
            conn.execute(
                "UPDATE categories SET display_name = ? WHERE key = ?",
                (body.display_name.strip(), key),
            )
        if body.sort_order is not None:
            conn.execute("UPDATE categories SET sort_order = ? WHERE key = ?", (body.sort_order, key))
        if body.archived is not None:
            conn.execute(
                "UPDATE categories SET archived = ? WHERE key = ?",
                (1 if body.archived else 0, key),
            )
    conn.commit()
    return {"status": "ok"}


@app.delete("/categories/{key}", tags=["categories"])
def delete_category(key: str, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    if key == "other":
        raise HTTPException(400, detail="Cannot delete the fallback category")
    row = conn.execute("SELECT source FROM categories WHERE key = ?", (key,)).fetchone()
    if not row:
        raise HTTPException(404, detail="Unknown category")
    if row["source"] != "user":
        raise HTTPException(400, detail="Cannot delete preset categories")
    conn.execute(
        "UPDATE category_assignments SET category_key = 'other' WHERE category_key = ?",
        (key,),
    )
    conn.execute("DELETE FROM rules WHERE category_key = ?", (key,))
    conn.execute("DELETE FROM categories WHERE key = ?", (key,))
    conn.commit()
    return {"status": "deleted", "reassigned_to": "other"}


class TransferPairCreate(BaseModel):
    debit_id: int = Field(..., description="Outflow transaction id (negative amount)")
    credit_id: int = Field(..., description="Inflow transaction id (positive amount)")
    pair_type: str = Field(default="manual", description="card_repayment, internal_transfer, or manual")


@app.post("/transfers/detect", tags=["transfers"])
def transfers_detect(conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    return detect_and_persist_pairs(conn)


@app.get("/transfers", tags=["transfers"])
def transfers_list(conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    rows = conn.execute(
        """
        SELECT id, debit_id, credit_id, pair_type, source, confidence, reason, excluded
        FROM transfer_pairs
        ORDER BY id DESC
        """
    ).fetchall()
    return {"items": [{k: r[k] for k in r.keys()} for r in rows]}


@app.post("/transfers", tags=["transfers"])
def transfers_create(body: TransferPairCreate, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    drow = conn.execute(
        "SELECT amount_cents FROM transactions WHERE id = ?",
        (body.debit_id,),
    ).fetchone()
    crow = conn.execute(
        "SELECT amount_cents FROM transactions WHERE id = ?",
        (body.credit_id,),
    ).fetchone()
    if not drow or not crow:
        raise HTTPException(404, detail="Transaction not found")
    if drow["amount_cents"] >= 0 or crow["amount_cents"] <= 0:
        raise HTTPException(
            400,
            detail="debit_id must be an outflow (negative amount) and credit_id an inflow (positive amount)",
        )
    if abs(drow["amount_cents"]) != crow["amount_cents"]:
        raise HTTPException(400, detail="Absolute amounts must match")
    pt = body.pair_type.strip()
    if pt not in ("card_repayment", "internal_transfer", "manual"):
        pt = "manual"
    try:
        conn.execute(
            """
            INSERT INTO transfer_pairs (
              debit_id, credit_id, reason, excluded, pair_type, source, confidence
            ) VALUES (?, ?, ?, 1, ?, 'user', 1.0)
            """,
            (body.debit_id, body.credit_id, "user", pt),
        )
        if pt == "internal_transfer":
            for tid in (body.debit_id, body.credit_id):
                merge_tag_slugs_into_transaction(conn, tid, *AUTO_INTERNAL_TRANSFER_TAGS)
        conn.commit()
    except sqlite3.IntegrityError as e:
        raise HTTPException(409, detail=str(e)) from e
    return {"status": "ok"}


@app.delete("/transfers/{pair_id}", tags=["transfers"])
def transfers_delete(pair_id: int, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, str]:
    cur = conn.execute("DELETE FROM transfer_pairs WHERE id = ?", (pair_id,))
    if cur.rowcount == 0:
        raise HTTPException(404, detail="Not found")
    conn.commit()
    return {"status": "deleted"}


class ThemeBody(BaseModel):
    primary: str | None = None
    accent: str | None = None
    chart: list[str] | None = None
    reset: bool = False


@app.get("/settings/theme", tags=["settings"])
def get_theme(conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    return get_settings_json(conn, "theme", {})


@app.post("/settings/theme", tags=["settings"])
def post_theme(body: ThemeBody, conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, str]:
    if body.reset:
        set_settings_json(conn, "theme", {})
        return {"status": "ok"}
    cur = get_settings_json(conn, "theme", {})
    if body.primary:
        cur["primary"] = body.primary
    if body.accent:
        cur["accent"] = body.accent
    if body.chart:
        cur["chart"] = body.chart
    set_settings_json(conn, "theme", cur)
    return {"status": "ok"}


@app.post("/settings/reset-database", tags=["settings"])
def reset_database(conn: sqlite3.Connection = Depends(get_conn)) -> dict[str, Any]:
    """Remove all imported transactions and import history.

    Preserves Akahu API credentials, linked account list, categories, rules, budgets, appearance/theme,
    and other app settings. Related rows (assignments, splits, transfer pairs, anomalies) cascade with transactions.
    """
    row = conn.execute("SELECT COUNT(*) AS n FROM transactions").fetchone()
    deleted = int(row["n"]) if row else 0
    conn.execute("DELETE FROM transactions")
    conn.execute("DELETE FROM imports")
    conn.commit()
    return {"status": "ok", "deleted_transactions": deleted}
