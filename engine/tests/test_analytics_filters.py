"""Tests for analytics filter params (category exclusions, transfer pair toggles)."""

from __future__ import annotations

import importlib
from collections.abc import Generator

import pytest

from cash_cat.analytics import (
    cashflow_series,
    category_breakdown,
    dashboard_summary,
    monthly_series,
    resolve_cashflow_bucket,
)


@pytest.fixture
def conn(tmp_path, monkeypatch) -> Generator:
    db = tmp_path / "analytics_filters.db"
    monkeypatch.setenv("CASH_CAT_DB_PATH", str(db))
    import cash_cat.db as db_mod
    import cash_cat.settings as settings_mod

    importlib.reload(settings_mod)
    importlib.reload(db_mod)
    from cash_cat.db import connect, init_db

    init_db()
    c = connect()
    yield c
    c.close()


def _insert_txn(
    conn,
    *,
    dedupe: str,
    amount_cents: int,
    day: str = "2026-01-15",
    desc: str = "x",
) -> int:
    conn.execute(
        """
        INSERT INTO transactions (txn_date, amount_cents, description_raw, dedupe_hash, source_label)
        VALUES (?, ?, ?, ?, ?)
        """,
        (day, amount_cents, desc, dedupe, "test"),
    )
    conn.commit()
    row = conn.execute("SELECT id FROM transactions WHERE dedupe_hash = ?", (dedupe,)).fetchone()
    assert row
    return int(row["id"])


def test_exclude_expense_category_other(conn) -> None:
    tid_g = _insert_txn(conn, dedupe="a1", amount_cents=-5000)
    tid_o = _insert_txn(conn, dedupe="a2", amount_cents=-10000)
    conn.execute(
        "INSERT INTO category_assignments (transaction_id, category_key, is_override) VALUES (?, 'groceries', 1)",
        (tid_g,),
    )
    conn.commit()

    base = {"exclude_paired_transfer_legs": True, "exclude_expense_category_keys": []}
    s0 = dashboard_summary(conn, base)
    assert s0["expense_cents"] == 15000

    s1 = dashboard_summary(
        conn,
        {**base, "exclude_expense_category_keys": ["other"]},
    )
    assert s1["expense_cents"] == 5000

    cats = category_breakdown(conn, {**base, "exclude_expense_category_keys": ["other"]})
    keys = {c["key"] for c in cats}
    assert "other" not in keys
    assert "groceries" in keys


def test_exclude_paired_transfer_legs_false(conn) -> None:
    debit_id = _insert_txn(conn, dedupe="d1", amount_cents=-10000, day="2026-02-01")
    credit_id = _insert_txn(conn, dedupe="d2", amount_cents=10000, day="2026-02-01")
    conn.execute(
        """
        INSERT INTO transfer_pairs (debit_id, credit_id, reason, excluded, pair_type, source, confidence)
        VALUES (?, ?, 'pair', 1, 'internal_transfer', 'auto', 1.0)
        """,
        (debit_id, credit_id),
    )
    conn.commit()

    s_ex = dashboard_summary(conn, {"exclude_paired_transfer_legs": True})
    assert s_ex["expense_cents"] == 0
    assert s_ex["income_cents"] == 0

    s_in = dashboard_summary(conn, {"exclude_paired_transfer_legs": False})
    assert s_in["expense_cents"] == 10000
    assert s_in["income_cents"] == 10000


def test_monthly_respects_category_exclusion(conn) -> None:
    _insert_txn(conn, dedupe="m1", amount_cents=-3000, day="2026-03-01")
    tid = _insert_txn(conn, dedupe="m2", amount_cents=-7000, day="2026-03-10")
    conn.execute(
        "INSERT INTO category_assignments (transaction_id, category_key, is_override) VALUES (?, 'transfer', 1)",
        (tid,),
    )
    conn.commit()

    series = monthly_series(
        conn,
        {
            "exclude_paired_transfer_legs": True,
            "exclude_expense_category_keys": ["transfer"],
        },
    )
    assert len(series) == 1
    assert series[0]["month"] == "2026-03"
    assert series[0]["expense"] == 3000


def test_excluded_transaction_omitted_from_dashboard(conn) -> None:
    _insert_txn(conn, dedupe="ex1", amount_cents=-5000)
    tid_e = _insert_txn(conn, dedupe="ex2", amount_cents=-8000)
    conn.execute("UPDATE transactions SET included = 0 WHERE id = ?", (tid_e,))
    conn.commit()
    s = dashboard_summary(conn, {"exclude_paired_transfer_legs": True, "exclude_expense_category_keys": []})
    assert s["expense_cents"] == 5000


def test_dashboard_includes_investments_cents(conn) -> None:
    tid = _insert_txn(conn, dedupe="inv1", amount_cents=-5000, day="2026-04-01")
    conn.execute(
        "INSERT INTO category_assignments (transaction_id, category_key, is_override) VALUES (?, 'investments', 1)",
        (tid,),
    )
    conn.commit()
    s = dashboard_summary(conn, {"exclude_paired_transfer_legs": True, "exclude_expense_category_keys": []})
    assert s["investments_cents"] == 5000
    assert s["expense_cents"] == 5000

    s2 = dashboard_summary(
        conn,
        {"exclude_paired_transfer_legs": True, "exclude_expense_category_keys": ["investments"]},
    )
    assert s2["investments_cents"] == 0
    assert s2["expense_cents"] == 0


def test_cashflow_day_fills_range(conn) -> None:
    tid = _insert_txn(conn, dedupe="c1", amount_cents=-1000, day="2026-05-10")
    conn.execute(
        "INSERT INTO category_assignments (transaction_id, category_key, is_override) VALUES (?, 'groceries', 1)",
        (tid,),
    )
    conn.commit()
    params = {
        "exclude_paired_transfer_legs": True,
        "exclude_expense_category_keys": [],
        "date_from": "2026-05-09",
        "date_to": "2026-05-11",
    }
    series = cashflow_series(conn, params, "day")
    assert len(series) == 3
    assert series[0]["period"] == "2026-05-09"
    assert series[0]["expense"] == 0
    assert series[1]["period"] == "2026-05-10"
    assert series[1]["expense"] == 1000
    assert series[2]["expense"] == 0


def test_resolve_cashflow_bucket_auto(conn) -> None:
    p = {"date_from": "2026-01-01", "date_to": "2026-01-31", "bucket": "auto"}
    assert resolve_cashflow_bucket(p) == "day"
    p2 = {"date_from": "2026-01-01", "date_to": "2026-12-31", "bucket": "auto"}
    assert resolve_cashflow_bucket(p2) == "week"
    p3 = {"date_from": "2020-01-01", "date_to": "2026-01-01", "bucket": "auto"}
    assert resolve_cashflow_bucket(p3) == "month"
