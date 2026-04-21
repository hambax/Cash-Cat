"""Auto-apply tag slugs when transfer pairs are created (internal transfers between accounts)."""

from __future__ import annotations

import json
import re
import sqlite3

# Slugs must match engine validation on PATCH /transactions (same as category keys).
_SLUG_RE = re.compile(r"^[a-z][a-z0-9_]{0,63}$")

# Applied to both legs when a pair is classified as internal_transfer (not card_repayment).
# `transfer` matches the common manual tag; `internal_transfer` matches pair_type for clarity.
AUTO_INTERNAL_TRANSFER_TAGS = ("transfer", "internal_transfer")


def merge_tag_slugs_into_transaction(conn: sqlite3.Connection, transaction_id: int, *slugs: str) -> None:
    """Merge slugs into transactions.tags_json; idempotent, sorted, de-duplicated."""
    row = conn.execute("SELECT tags_json FROM transactions WHERE id = ?", (transaction_id,)).fetchone()
    if not row:
        return
    raw = row["tags_json"] if row["tags_json"] is not None else "[]"
    try:
        cur = json.loads(raw)
    except json.JSONDecodeError:
        cur = []
    if not isinstance(cur, list):
        cur = []
    existing: set[str] = set()
    for x in cur:
        if isinstance(x, str):
            s = x.strip().lower()
            if s and _SLUG_RE.match(s):
                existing.add(s)
    for slug in slugs:
        s = slug.strip().lower()
        if s and _SLUG_RE.match(s):
            existing.add(s)
    out = sorted(existing)
    conn.execute(
        "UPDATE transactions SET tags_json = ? WHERE id = ?",
        (json.dumps(out), transaction_id),
    )
