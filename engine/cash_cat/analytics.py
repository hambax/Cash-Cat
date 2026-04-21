"""Aggregates and deterministic insight templates."""

from __future__ import annotations

import json
import sqlite3
from datetime import date, timedelta
from typing import Any

from cash_cat.transfers.exclusions import transfer_exclusion_sets


def filtered_transactions(
    conn: sqlite3.Connection,
    *,
    date_from: str | None,
    date_to: str | None,
    sources: list[str] | None,
) -> list[sqlite3.Row]:
    q = "SELECT * FROM transactions WHERE included = 1"
    args: list[Any] = []
    if date_from:
        q += " AND txn_date >= ?"
        args.append(date_from)
    if date_to:
        q += " AND txn_date <= ?"
        args.append(date_to)
    if sources:
        qs = ",".join("?" for _ in sources)
        q += f" AND (source_label IN ({qs}) OR account_label IN ({qs}))"
        args.extend(sources)
        args.extend(sources)
    q += " ORDER BY txn_date DESC"
    return list(conn.execute(q, args).fetchall())


def _pair_exclusion_sets(
    conn: sqlite3.Connection, exclude_paired_transfer_legs: bool
) -> tuple[set[int], set[int]]:
    if exclude_paired_transfer_legs:
        return transfer_exclusion_sets(conn)
    return set(), set()


def _exclude_paired(params: dict[str, Any]) -> bool:
    v = params.get("exclude_paired_transfer_legs")
    return True if v is None else bool(v)


def _exclude_expense_category_keys(params: dict[str, Any]) -> set[str]:
    keys = params.get("exclude_expense_category_keys")
    if not keys or not isinstance(keys, list):
        return set()
    return {str(k) for k in keys}


def _expense_category_key(conn: sqlite3.Connection, transaction_id: int) -> str:
    cat_row = conn.execute(
        "SELECT category_key FROM category_assignments WHERE transaction_id = ?",
        (transaction_id,),
    ).fetchone()
    return cat_row["category_key"] if cat_row else "other"


def _fetch_splits_batch(conn: sqlite3.Connection, txn_ids: list[int]) -> dict[int, list[sqlite3.Row]]:
    if not txn_ids:
        return {}
    qs = ",".join("?" for _ in txn_ids)
    rows = conn.execute(
        f"SELECT transaction_id, category_key, amount_cents FROM transaction_splits WHERE transaction_id IN ({qs})",
        txn_ids,
    ).fetchall()
    out: dict[int, list[sqlite3.Row]] = {}
    for r in rows:
        tid = int(r["transaction_id"])
        out.setdefault(tid, []).append(r)
    return out


def _split_category_amounts(amount_cents: int, split_rows: list[sqlite3.Row] | None) -> dict[str, int] | None:
    """If valid splits exist for this expense, return category -> positive cents; else None."""
    if not split_rows or amount_cents >= 0:
        return None
    total = sum(int(r["amount_cents"]) for r in split_rows)
    if total != abs(amount_cents):
        return None
    return {str(r["category_key"]): int(r["amount_cents"]) for r in split_rows}


def dashboard_summary(conn: sqlite3.Connection, params: dict[str, Any]) -> dict[str, Any]:
    rows = filtered_transactions(
        conn,
        date_from=params.get("date_from"),
        date_to=params.get("date_to"),
        sources=params.get("sources"),
    )
    exp_ex, inc_ex = _pair_exclusion_sets(conn, _exclude_paired(params))
    cat_ex = _exclude_expense_category_keys(params)
    income = sum(
        r["amount_cents"] for r in rows if r["amount_cents"] > 0 and r["id"] not in inc_ex
    )
    expense = 0
    investments = 0
    for r in rows:
        if r["amount_cents"] >= 0:
            continue
        if r["id"] in exp_ex:
            continue
        ck = _expense_category_key(conn, r["id"])
        if ck in cat_ex:
            continue
        amt = -r["amount_cents"]
        expense += amt
        if ck == "investments":
            investments += amt
    return {
        "transaction_count": len(rows),
        "income_cents": income,
        "expense_cents": expense,
        "investments_cents": investments,
        "net_cents": income - expense,
    }


def category_breakdown(conn: sqlite3.Connection, params: dict[str, Any]) -> list[dict[str, Any]]:
    rows = filtered_transactions(
        conn,
        date_from=params.get("date_from"),
        date_to=params.get("date_to"),
        sources=params.get("sources"),
    )
    exp_ex, _ = _pair_exclusion_sets(conn, _exclude_paired(params))
    cat_ex = _exclude_expense_category_keys(params)
    neg_ids = [int(r["id"]) for r in rows if r["amount_cents"] < 0]
    splits_batch = _fetch_splits_batch(conn, neg_ids)
    by_cat: dict[str, int] = {}
    for r in rows:
        if r["amount_cents"] >= 0:
            continue
        if r["id"] in exp_ex:
            continue
        tid = int(r["id"])
        split_amt = _split_category_amounts(int(r["amount_cents"]), splits_batch.get(tid))
        if split_amt:
            for key, amt in split_amt.items():
                if key in cat_ex:
                    continue
                by_cat[key] = by_cat.get(key, 0) + amt
            continue
        key = _expense_category_key(conn, tid)
        if key in cat_ex:
            continue
        amt = abs(int(r["amount_cents"]))
        by_cat[key] = by_cat.get(key, 0) + amt
    total = sum(by_cat.values()) or 1
    out = []
    for k, v in sorted(by_cat.items(), key=lambda x: -x[1]):
        name = conn.execute("SELECT display_name FROM categories WHERE key = ?", (k,)).fetchone()
        out.append(
            {
                "key": k,
                "label": name["display_name"] if name else k,
                "amount_cents": v,
                "pct": round(100 * v / total, 1),
            }
        )
    return out


def _month_keys_in_range(d0: date, d1: date) -> list[str]:
    keys: list[str] = []
    y, m = d0.year, d0.month
    while date(y, m, 1) <= d1:
        keys.append(f"{y:04d}-{m:02d}")
        if m == 12:
            y, m = y + 1, 1
        else:
            m += 1
    return keys


def _iter_days(d0: date, d1: date):
    cur = d0
    while cur <= d1:
        yield cur
        cur += timedelta(days=1)


def _period_keys_in_range(d0: date, d1: date, bucket: str) -> list[str]:
    if d1 < d0:
        d0, d1 = d1, d0
    if bucket == "day":
        return [d.isoformat() for d in _iter_days(d0, d1)]
    if bucket == "month":
        return _month_keys_in_range(d0, d1)
    return sorted({(d - timedelta(days=d.weekday())).isoformat() for d in _iter_days(d0, d1)})


def _bucket_key(txn_date: str, bucket: str) -> str:
    if bucket == "day":
        return txn_date[:10]
    if bucket == "month":
        return txn_date[:7]
    d = date.fromisoformat(txn_date[:10])
    mon = d - timedelta(days=d.weekday())
    return mon.isoformat()


def resolve_cashflow_bucket(params: dict[str, Any]) -> str:
    raw = params.get("bucket") or "auto"
    b = raw.lower().strip() if isinstance(raw, str) else "auto"
    if b in ("day", "week", "month"):
        return b
    df = params.get("date_from")
    dt = params.get("date_to")
    if not df or not dt:
        return "month"
    d0 = date.fromisoformat(str(df)[:10])
    d1 = date.fromisoformat(str(dt)[:10])
    if d1 < d0:
        d0, d1 = d1, d0
    inclusive_days = (d1 - d0).days + 1
    if inclusive_days <= 62:
        return "day"
    if inclusive_days <= 400:
        return "week"
    return "month"


def cashflow_series(conn: sqlite3.Connection, params: dict[str, Any], bucket: str) -> list[dict[str, Any]]:
    rows = filtered_transactions(
        conn,
        date_from=params.get("date_from"),
        date_to=params.get("date_to"),
        sources=params.get("sources"),
    )
    exp_ex, inc_ex = _pair_exclusion_sets(conn, _exclude_paired(params))
    cat_ex = _exclude_expense_category_keys(params)
    buckets: dict[str, dict[str, int]] = {}
    for r in rows:
        key = _bucket_key(r["txn_date"], bucket)
        if key not in buckets:
            buckets[key] = {"income": 0, "expense": 0}
        if r["amount_cents"] > 0:
            if r["id"] not in inc_ex:
                buckets[key]["income"] += r["amount_cents"]
        else:
            if r["id"] in exp_ex:
                continue
            if _expense_category_key(conn, r["id"]) in cat_ex:
                continue
            buckets[key]["expense"] += -r["amount_cents"]

    df = params.get("date_from")
    dt = params.get("date_to")
    if df and dt:
        d0 = date.fromisoformat(str(df)[:10])
        d1 = date.fromisoformat(str(dt)[:10])
        keys = _period_keys_in_range(d0, d1, bucket)
    else:
        keys = sorted(buckets.keys())

    out: list[dict[str, Any]] = []
    for k in keys:
        v = buckets.get(k, {"income": 0, "expense": 0})
        out.append({"period": k, "income": v["income"], "expense": v["expense"]})
    return out


def monthly_series(conn: sqlite3.Connection, params: dict[str, Any]) -> list[dict[str, Any]]:
    s = cashflow_series(conn, params, "month")
    return [{"month": x["period"], "income": x["income"], "expense": x["expense"]} for x in s]


def monthly_series_by_category(conn: sqlite3.Connection, params: dict[str, Any]) -> list[dict[str, Any]]:
    """Expense totals per calendar month, per category (respects splits when valid)."""
    rows = filtered_transactions(
        conn,
        date_from=params.get("date_from"),
        date_to=params.get("date_to"),
        sources=params.get("sources"),
    )
    exp_ex, _ = _pair_exclusion_sets(conn, _exclude_paired(params))
    cat_ex = _exclude_expense_category_keys(params)
    neg_ids = [int(r["id"]) for r in rows if r["amount_cents"] < 0]
    splits_batch = _fetch_splits_batch(conn, neg_ids)
    buckets: dict[str, dict[str, int]] = {}
    for r in rows:
        if r["amount_cents"] >= 0:
            continue
        if r["id"] in exp_ex:
            continue
        period = _bucket_key(r["txn_date"], "month")
        if period not in buckets:
            buckets[period] = {}
        tid = int(r["id"])
        split_amt = _split_category_amounts(int(r["amount_cents"]), splits_batch.get(tid))
        if split_amt:
            for key, amt in split_amt.items():
                if key in cat_ex:
                    continue
                buckets[period][key] = buckets[period].get(key, 0) + amt
            continue
        key = _expense_category_key(conn, tid)
        if key in cat_ex:
            continue
        amt = abs(int(r["amount_cents"]))
        buckets[period][key] = buckets[period].get(key, 0) + amt
    df = params.get("date_from")
    dt = params.get("date_to")
    if df and dt:
        d0 = date.fromisoformat(str(df)[:10])
        d1 = date.fromisoformat(str(dt)[:10])
        if d1 < d0:
            d0, d1 = d1, d0
        keys = _month_keys_in_range(d0, d1)
    else:
        keys = sorted(buckets.keys())
    out: list[dict[str, Any]] = []
    for k in keys:
        by_cat = buckets.get(k, {})
        out.append({"period": k, "by_category": by_cat})
    return out


def tag_breakdown(conn: sqlite3.Connection, params: dict[str, Any]) -> list[dict[str, Any]]:
    """Sum of outflow amounts grouped by tag slug in ``tags_json``.

    When ``exclude_paired_transfer_legs`` is true (the default in ``FilterParams``), internal transfer outflows are
    skipped — those rows often carry auto ``transfer`` / ``internal_transfer`` tags. The Tags UI sends false so those
    tagged rows appear in the breakdown.
    """
    rows = filtered_transactions(
        conn,
        date_from=params.get("date_from"),
        date_to=params.get("date_to"),
        sources=params.get("sources"),
    )
    exp_ex, _ = _pair_exclusion_sets(conn, _exclude_paired(params))
    cat_ex = _exclude_expense_category_keys(params)
    by_tag: dict[str, int] = {}
    for r in rows:
        if r["amount_cents"] >= 0:
            continue
        if r["id"] in exp_ex:
            continue
        if _expense_category_key(conn, int(r["id"])) in cat_ex:
            continue
        raw = r["tags_json"] if "tags_json" in r.keys() else "[]"
        try:
            tags = json.loads(raw) if raw else []
        except json.JSONDecodeError:
            tags = []
        if not isinstance(tags, list):
            continue
        amt = abs(int(r["amount_cents"]))
        for t in tags:
            if isinstance(t, str) and t.strip():
                s = t.strip().lower()
                by_tag[s] = by_tag.get(s, 0) + amt
    total = sum(by_tag.values()) or 1
    out: list[dict[str, Any]] = []
    for k, v in sorted(by_tag.items(), key=lambda x: -x[1]):
        out.append({"tag": k, "amount_cents": v, "pct": round(100 * v / total, 1)})
    return out


def recurring_suggestions(
    conn: sqlite3.Connection,
    params: dict[str, Any],
    *,
    min_count: int = 3,
) -> list[dict[str, Any]]:
    """Same merchant label + same signed amount repeated often (subscriptions / bills heuristic)."""
    rows = filtered_transactions(
        conn,
        date_from=params.get("date_from"),
        date_to=params.get("date_to"),
        sources=params.get("sources"),
    )
    exp_ex, _ = _pair_exclusion_sets(conn, _exclude_paired(params))
    key_counts: dict[tuple[str, int], int] = {}
    for r in rows:
        if r["amount_cents"] >= 0:
            continue
        if r["id"] in exp_ex:
            continue
        m = r["normalised_merchant"]
        if not m or not str(m).strip():
            continue
        key = (str(m).strip(), int(r["amount_cents"]))
        key_counts[key] = key_counts.get(key, 0) + 1
    out: list[dict[str, Any]] = []
    for (merchant, amt_cents), cnt in key_counts.items():
        if cnt >= min_count:
            out.append(
                {
                    "normalised_merchant": merchant,
                    "amount_cents": amt_cents,
                    "occurrence_count": cnt,
                    "estimated_monthly_cents": abs(amt_cents),
                }
            )
    out.sort(key=lambda x: (-x["occurrence_count"], x["normalised_merchant"]))
    return out[:50]


def daily_expense_totals(conn: sqlite3.Connection, params: dict[str, Any]) -> list[dict[str, Any]]:
    """Per calendar day: total expense cents (after exclusions), for heatmaps."""
    rows = filtered_transactions(
        conn,
        date_from=params.get("date_from"),
        date_to=params.get("date_to"),
        sources=params.get("sources"),
    )
    exp_ex, _ = _pair_exclusion_sets(conn, _exclude_paired(params))
    cat_ex = _exclude_expense_category_keys(params)
    buckets: dict[str, int] = {}
    for r in rows:
        if r["amount_cents"] >= 0:
            continue
        if r["id"] in exp_ex:
            continue
        if _expense_category_key(conn, int(r["id"])) in cat_ex:
            continue
        k = str(r["txn_date"])[:10]
        buckets[k] = buckets.get(k, 0) + abs(int(r["amount_cents"]))
    df = params.get("date_from")
    dt = params.get("date_to")
    if df and dt:
        d0 = date.fromisoformat(str(df)[:10])
        d1 = date.fromisoformat(str(dt)[:10])
        if d1 < d0:
            d0, d1 = d1, d0
        keys = [d.isoformat() for d in _iter_days(d0, d1)]
    else:
        keys = sorted(buckets.keys())
    return [{"day": k, "expense_cents": buckets.get(k, 0)} for k in keys]


def savings_rate_series(conn: sqlite3.Connection, params: dict[str, Any]) -> list[dict[str, Any]]:
    """Per calendar month: income, expense, net, savings_rate_pct (0–100 when income > 0)."""
    s = cashflow_series(conn, params, "month")
    out: list[dict[str, Any]] = []
    for row in s:
        inc = int(row["income"])
        exp = int(row["expense"])
        net = inc - exp
        rate = round(100 * net / inc, 1) if inc > 0 else None
        out.append(
            {
                "period": row["period"],
                "income": inc,
                "expense": exp,
                "net": net,
                "savings_rate_pct": rate,
            }
        )
    return out


def build_insights(summary: dict[str, Any], cats: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Structured facts for UI templates (no LLM)."""
    insights: list[dict[str, Any]] = []
    net = summary["net_cents"]
    insights.append(
        {
            "id": "net",
            "template": "Net for this period: {money}.",
            "facts": {"money": net / 100},
        }
    )
    if cats:
        top = cats[0]
        insights.append(
            {
                "id": "top_cat",
                "template": "{label} is your largest spending category ({pct}% of spend).",
                "facts": {"label": top["label"], "pct": top["pct"]},
            }
        )
    return insights


def get_settings_json(conn: sqlite3.Connection, key: str, default: Any) -> Any:
    row = conn.execute("SELECT value_json FROM app_settings WHERE key = ?", (key,)).fetchone()
    if not row:
        return default
    return json.loads(row["value_json"])


def set_settings_json(conn: sqlite3.Connection, key: str, value: Any) -> None:
    conn.execute(
        "INSERT INTO app_settings(key, value_json) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json",
        (key, json.dumps(value)),
    )
    conn.commit()
