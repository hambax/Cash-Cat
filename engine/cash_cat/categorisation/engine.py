"""Apply categorisation to transactions."""

from __future__ import annotations

import sqlite3
from typing import Any

from cash_cat.categorisation.builtins import built_in_rules
from cash_cat.categorisation.matchers import match_rule, parse_db_rule
from cash_cat.categorisation.normalise import combined_fields


def load_user_rules(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    """DB rules evaluated after built-ins; pattern must be JSON."""
    out: list[dict[str, Any]] = []
    for row in conn.execute("SELECT pattern, category_key FROM rules ORDER BY sort_order, id"):
        parsed = parse_db_rule(row["pattern"])
        if not parsed:
            continue
        rule = dict(parsed)
        rule["category_key"] = row["category_key"]
        rule.setdefault("amount_sign", "any")
        out.append(rule)
    return out


def classify_transaction(
    amount_cents: int,
    description_raw: str,
    normalised_merchant: str | None,
    provider: str | None,
    rules: list[dict[str, Any]],
) -> str | None:
    haystack = combined_fields(description_raw, normalised_merchant, provider)
    for rule in rules:
        cat = rule.get("category_key")
        if not cat:
            continue
        r = {k: v for k, v in rule.items() if k != "category_key"}
        if match_rule(haystack, r, amount_cents=amount_cents):
            return str(cat)
    return None


def categorize_connection(conn: sqlite3.Connection, *, mode: str = "missing") -> dict[str, int]:
    """
    mode=missing: only rows with no assignment, or only non-override slots empty.
    mode=reapply: delete all non-override assignments then classify all.
    """
    if mode not in ("missing", "reapply"):
        raise ValueError("mode must be missing or reapply")

    if mode == "reapply":
        conn.execute("DELETE FROM category_assignments WHERE is_override = 0")
        conn.commit()

    ordered = list(built_in_rules()) + load_user_rules(conn)
    assigned = 0
    skipped_override = 0

    for row in conn.execute(
        "SELECT id, amount_cents, description_raw, normalised_merchant, provider FROM transactions"
    ):
        tid = row["id"]
        existing = conn.execute(
            "SELECT is_override FROM category_assignments WHERE transaction_id = ?",
            (tid,),
        ).fetchone()

        if existing and existing["is_override"]:
            skipped_override += 1
            continue

        key = classify_transaction(
            row["amount_cents"],
            row["description_raw"] or "",
            row["normalised_merchant"],
            row["provider"],
            ordered,
        )
        final_key = key if key else "other"

        valid = conn.execute(
            "SELECT 1 FROM categories WHERE key = ? AND archived = 0",
            (final_key,),
        ).fetchone()
        if not valid:
            final_key = "other"

        if existing:
            conn.execute(
                "UPDATE category_assignments SET category_key = ? WHERE transaction_id = ? AND is_override = 0",
                (final_key, tid),
            )
        else:
            conn.execute(
                "INSERT INTO category_assignments (transaction_id, category_key, is_override) VALUES (?, ?, 0)",
                (tid, final_key),
            )
        assigned += 1

    conn.commit()
    return {"assigned": assigned, "skipped_override": skipped_override}


def explain_transaction_category(conn: sqlite3.Connection, transaction_id: int) -> dict[str, Any] | None:
    """Return which rule would match first (same order as categorisation)."""
    row = conn.execute(
        "SELECT id, amount_cents, description_raw, normalised_merchant, provider FROM transactions WHERE id = ?",
        (transaction_id,),
    ).fetchone()
    if not row:
        return None
    bi = built_in_rules()
    user_with_ids: list[tuple[int, dict[str, Any]]] = []
    for db_row in conn.execute("SELECT id, pattern, category_key FROM rules ORDER BY sort_order, id"):
        parsed = parse_db_rule(db_row["pattern"])
        if not parsed:
            continue
        rule = dict(parsed)
        rule["category_key"] = db_row["category_key"]
        rule.setdefault("amount_sign", "any")
        user_with_ids.append((int(db_row["id"]), rule))
    ordered: list[tuple[str, int | None, dict[str, Any]]] = []
    for i, r in enumerate(bi):
        ordered.append(("builtin", i, r))
    for rid, r in user_with_ids:
        ordered.append(("user_rule", rid, r))

    amount_cents = int(row["amount_cents"])
    haystack = combined_fields(row["description_raw"] or "", row["normalised_merchant"], row["provider"])
    for source, ref, rule in ordered:
        cat = rule.get("category_key")
        if not cat:
            continue
        r_only = {k: v for k, v in rule.items() if k != "category_key"}
        if match_rule(haystack, r_only, amount_cents=amount_cents):
            out: dict[str, Any] = {
                "category_key": str(cat),
                "source": source,
            }
            if source == "builtin":
                out["builtin_rule_index"] = ref
            else:
                out["rule_id"] = ref
            return out
    return {
        "category_key": "other",
        "source": "fallback",
        "note": "No rule matched; would fall back to other.",
    }
