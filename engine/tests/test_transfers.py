"""Transfer pairing and analytics exclusions."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

import pytest

import cash_cat.settings as settings_module
from cash_cat.analytics import dashboard_summary
from cash_cat.db import connect, init_db
from cash_cat.transfers.detect import detect_and_persist_pairs
from cash_cat.transfers.exclusions import transfer_exclusion_sets


@pytest.fixture
def conn(monkeypatch: pytest.MonkeyPatch):
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / "test.db"
        monkeypatch.setattr(settings_module.settings, "db_path", p)
        init_db()
        c = connect()
        yield c
        c.close()


def test_transfer_exclusion_sets_splits_signs(conn):
    cur = conn.cursor()
    cur.execute("INSERT INTO imports(source_type, row_count) VALUES('csv', 0)")
    imp = cur.lastrowid
    cur.execute(
        """INSERT INTO transactions(import_id, txn_date, amount_cents, description_raw, dedupe_hash, source_label, account_label)
           VALUES (?,?,?,?,?,?,?)""",
        (imp, "2026-01-01", -5000, "bank pay", "d1", "csv", "a"),
    )
    id_neg = cur.lastrowid
    cur.execute(
        """INSERT INTO transactions(import_id, txn_date, amount_cents, description_raw, dedupe_hash, source_label, account_label)
           VALUES (?,?,?,?,?,?,?)""",
        (imp, "2026-01-01", 5000, "card credit", "d2", "csv", "b"),
    )
    id_pos = cur.lastrowid
    cur.execute(
        """
        INSERT INTO transfer_pairs(debit_id, credit_id, reason, excluded, pair_type, source, confidence)
        VALUES (?, ?, 't', 1, 'card_repayment', 'user', 1.0)
        """,
        (id_neg, id_pos),
    )
    conn.commit()

    exp_ex, inc_ex = transfer_exclusion_sets(conn)
    assert id_neg in exp_ex
    assert id_pos in inc_ex


def test_dashboard_summary_excludes_paired_legs(conn):
    cur = conn.cursor()
    cur.execute("INSERT INTO imports(source_type, row_count) VALUES('csv', 0)")
    imp = cur.lastrowid
    cur.execute(
        """INSERT INTO transactions(import_id, txn_date, amount_cents, description_raw, dedupe_hash, source_label, account_label)
           VALUES (?,?,?,?,?,?,?)""",
        (imp, "2026-01-01", -10000, "pay card", "x1", "csv", "a"),
    )
    id_neg = cur.lastrowid
    cur.execute(
        """INSERT INTO transactions(import_id, txn_date, amount_cents, description_raw, dedupe_hash, source_label, account_label)
           VALUES (?,?,?,?,?,?,?)""",
        (imp, "2026-01-01", 10000, "received", "x2", "csv", "b"),
    )
    id_pos = cur.lastrowid
    cur.execute(
        """INSERT INTO transactions(import_id, txn_date, amount_cents, description_raw, dedupe_hash, source_label, account_label)
           VALUES (?,?,?,?,?,?,?)""",
        (imp, "2026-01-02", -250, "coffee", "x3", "csv", "a"),
    )
    id_spend = cur.lastrowid
    cur.execute(
        """
        INSERT INTO transfer_pairs(debit_id, credit_id, reason, excluded, pair_type, source, confidence)
        VALUES (?, ?, 't', 1, 'card_repayment', 'user', 1.0)
        """,
        (id_neg, id_pos),
    )
    conn.commit()

    s = dashboard_summary(conn, {})
    assert s["expense_cents"] == 250
    assert s["income_cents"] == 0


def test_detect_pairs_amex_and_bank(conn):
    cur = conn.cursor()
    cur.execute("INSERT INTO imports(source_type, row_count) VALUES('akahu', 0)")
    imp = cur.lastrowid
    cur.execute(
        """INSERT INTO akahu_accounts(akahu_account_id, institution_name, account_name, mask, logo_url, enabled, account_kind)
           VALUES ('bank','Westpac','Everyday','',NULL,1,'everyday')"""
    )
    cur.execute(
        """INSERT INTO akahu_accounts(akahu_account_id, institution_name, account_name, mask, logo_url, enabled, account_kind)
           VALUES ('amex','American Express','Card','',NULL,1,'credit_card')"""
    )
    cur.execute(
        """INSERT INTO transactions(import_id, txn_date, amount_cents, description_raw, dedupe_hash, source_label, account_label, provider, akahu_account_id)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        (imp, "2026-01-05", -12345, "payment", "h1", "akahu", "bank", "Westpac", "bank"),
    )
    cur.execute(
        """INSERT INTO transactions(import_id, txn_date, amount_cents, description_raw, dedupe_hash, source_label, account_label, provider, akahu_account_id)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        (imp, "2026-01-05", 12345, "payment recv", "h2", "akahu", "amex", "Amex", "amex"),
    )
    conn.commit()

    stats = detect_and_persist_pairs(conn)
    assert stats["pairs_inserted"] == 1
    row = conn.execute("SELECT pair_type FROM transfer_pairs").fetchone()
    assert row["pair_type"] == "card_repayment"


def test_detect_internal_transfer_adds_transfer_tags(conn):
    """Non–credit-card ↔ non–credit-card pairs are internal_transfer; both legs get transfer tags."""
    cur = conn.cursor()
    cur.execute("INSERT INTO imports(source_type, row_count) VALUES('akahu', 0)")
    imp = cur.lastrowid
    cur.execute(
        """INSERT INTO akahu_accounts(akahu_account_id, institution_name, account_name, mask, logo_url, enabled, account_kind)
           VALUES ('acc_a','ASB','One','',NULL,1,'everyday')"""
    )
    cur.execute(
        """INSERT INTO akahu_accounts(akahu_account_id, institution_name, account_name, mask, logo_url, enabled, account_kind)
           VALUES ('acc_b','ASB','Two','',NULL,1,'everyday')"""
    )
    cur.execute(
        """INSERT INTO transactions(import_id, txn_date, amount_cents, description_raw, dedupe_hash, source_label, account_label, provider, akahu_account_id)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        (imp, "2026-02-01", -8888, "move out", "it1", "akahu", "a", "ASB", "acc_a"),
    )
    id_neg = cur.lastrowid
    cur.execute(
        """INSERT INTO transactions(import_id, txn_date, amount_cents, description_raw, dedupe_hash, source_label, account_label, provider, akahu_account_id)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        (imp, "2026-02-01", 8888, "move in", "it2", "akahu", "b", "ASB", "acc_b"),
    )
    id_pos = cur.lastrowid
    conn.commit()

    stats = detect_and_persist_pairs(conn)
    assert stats["pairs_inserted"] == 1
    row = conn.execute("SELECT pair_type, debit_id, credit_id FROM transfer_pairs").fetchone()
    assert row["pair_type"] == "internal_transfer"
    for tid in (row["debit_id"], row["credit_id"]):
        r = conn.execute("SELECT tags_json FROM transactions WHERE id = ?", (tid,)).fetchone()
        tags = json.loads(r["tags_json"])
        assert "transfer" in tags
        assert "internal_transfer" in tags
