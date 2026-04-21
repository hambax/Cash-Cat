"""Exclude paired transfer legs from headline income/expense analytics."""

from __future__ import annotations

import sqlite3


def transfer_exclusion_sets(conn: sqlite3.Connection) -> tuple[set[int], set[int]]:
    """
    Returns (exclude_from_expense_ids, exclude_from_income_ids) for transactions
    that are legs of transfer_pairs with excluded=1.
    Negative amounts contribute to expense; positive to income — exclude each leg accordingly.
    """
    expense_ids: set[int] = set()
    income_ids: set[int] = set()
    rows = conn.execute(
        "SELECT debit_id, credit_id FROM transfer_pairs WHERE excluded = 1"
    ).fetchall()
    for r in rows:
        for tid in (r["debit_id"], r["credit_id"]):
            row = conn.execute(
                "SELECT amount_cents FROM transactions WHERE id = ?",
                (tid,),
            ).fetchone()
            if not row:
                continue
            amt = row["amount_cents"]
            if amt < 0:
                expense_ids.add(tid)
            elif amt > 0:
                income_ids.add(tid)
    return expense_ids, income_ids
