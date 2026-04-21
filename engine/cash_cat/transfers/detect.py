"""Deterministic pairing: same absolute amount, opposite signs, different accounts, date window."""

from __future__ import annotations

import sqlite3
from collections import defaultdict
from datetime import datetime

from cash_cat.transfers.auto_tags import AUTO_INTERNAL_TRANSFER_TAGS, merge_tag_slugs_into_transaction


def _paired_transaction_ids(conn: sqlite3.Connection) -> set[int]:
    s: set[int] = set()
    for r in conn.execute("SELECT debit_id, credit_id FROM transfer_pairs"):
        s.add(r["debit_id"])
        s.add(r["credit_id"])
    return s


def _account_kinds(conn: sqlite3.Connection) -> dict[str, str]:
    return {
        r["akahu_account_id"]: r["account_kind"]
        for r in conn.execute("SELECT akahu_account_id, account_kind FROM akahu_accounts")
    }


def _classify_pair(kind_a: str, kind_b: str) -> str:
    kinds = {kind_a, kind_b}
    if "credit_card" in kinds and kinds & {"everyday", "savings", "loan", "other", "unknown"}:
        return "card_repayment"
    if kind_a == "credit_card" or kind_b == "credit_card":
        return "card_repayment"
    return "internal_transfer"


def detect_and_persist_pairs(conn: sqlite3.Connection, *, window_days: int = 5) -> dict[str, int]:
    """
    Greedy one-to-one matching: for each absolute amount, match negative/positive pairs
    on different Akahu accounts within date window. Deterministic order: by date, id.
    """
    kinds = _account_kinds(conn)
    paired = _paired_transaction_ids(conn)

    rows = list(
        conn.execute(
            """
            SELECT id, txn_date, amount_cents, akahu_account_id
            FROM transactions
            WHERE akahu_account_id IS NOT NULL AND akahu_account_id != ''
            ORDER BY txn_date, id
            """
        )
    )

    neg_by_abs: dict[int, list[sqlite3.Row]] = defaultdict(list)
    pos_by_abs: dict[int, list[sqlite3.Row]] = defaultdict(list)
    for r in rows:
        if r["id"] in paired:
            continue
        aid = r["akahu_account_id"]
        if not aid:
            continue
        if r["amount_cents"] < 0:
            neg_by_abs[abs(r["amount_cents"])].append(r)
        elif r["amount_cents"] > 0:
            pos_by_abs[r["amount_cents"]].append(r)

    inserted = 0
    amounts = sorted(set(neg_by_abs.keys()) & set(pos_by_abs.keys()))

    for amt in amounts:
        negs = sorted(neg_by_abs[amt], key=lambda x: (x["txn_date"], x["id"]))
        poss = sorted(pos_by_abs[amt], key=lambda x: (x["txn_date"], x["id"]))
        used_p: set[int] = set()

        for n in negs:
            if n["id"] in paired:
                continue
            n_aid = n["akahu_account_id"]
            n_kind = kinds.get(n_aid, "unknown")

            for p in poss:
                if p["id"] in used_p or p["id"] in paired:
                    continue
                p_aid = p["akahu_account_id"]
                if p_aid == n_aid:
                    continue

                try:
                    d_n = datetime.strptime(n["txn_date"][:10], "%Y-%m-%d")
                    d_p = datetime.strptime(p["txn_date"][:10], "%Y-%m-%d")
                except ValueError:
                    continue
                if abs((d_n - d_p).days) > window_days:
                    continue

                p_kind = kinds.get(p_aid, "unknown")
                pair_type = _classify_pair(n_kind, p_kind)

                try:
                    conn.execute(
                        """
                        INSERT INTO transfer_pairs (
                          debit_id, credit_id, reason, excluded, pair_type, source, confidence
                        ) VALUES (?, ?, ?, 1, ?, 'auto', ?)
                        """,
                        (
                            n["id"],
                            p["id"],
                            "auto-detected",
                            pair_type,
                            0.9,
                        ),
                    )
                    inserted += 1
                except sqlite3.IntegrityError:
                    continue

                if pair_type == "internal_transfer":
                    for tid in (n["id"], p["id"]):
                        merge_tag_slugs_into_transaction(conn, tid, *AUTO_INTERNAL_TRANSFER_TAGS)

                paired.add(n["id"])
                paired.add(p["id"])
                used_p.add(p["id"])
                break

    conn.commit()
    return {"pairs_inserted": inserted}
