"""CSV import with column auto-detect (NZ/AU friendly)."""

from __future__ import annotations

import csv
import hashlib
import io
import re
from datetime import datetime
from typing import Any

DATE_PATTERNS = (
    (re.compile(r"^(\d{4})-(\d{2})-(\d{2})"), "%Y-%m-%d"),
    (re.compile(r"^(\d{2})/(\d{2})/(\d{4})"), "%d/%m/%Y"),
    (re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{4})"), "%d/%m/%Y"),
    (re.compile(r"^(\d{2})-(\d{2})-(\d{4})"), "%d-%m-%Y"),
    (re.compile(r"^(\d{1,2})-(\d{1,2})-(\d{4})"), "%d-%m-%Y"),
    (re.compile(r"^(\d{2})/(\d{2})/(\d{2})$"), "%d/%m/%y"),
    (re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{2})$"), "%d/%m/%y"),
)


def parse_date(s: str) -> str | None:
    s = s.strip()
    for rx, fmt in DATE_PATTERNS:
        if rx.match(s):
            try:
                return datetime.strptime(s, fmt).date().isoformat()
            except ValueError:
                continue
    return None


def parse_amount(raw: str) -> int | None:
    s = raw.strip().replace(",", "").replace("$", "").replace("NZD", "").strip()
    if not s:
        return None
    neg = s.startswith("(") and s.endswith(")")
    if neg:
        s = s[1:-1]
    try:
        v = float(s)
    except ValueError:
        return None
    cents = int(round(abs(v) * 100))
    if v < 0 or neg:
        cents = -cents
    return cents


def parse_amount_unsigned(raw: str) -> int | None:
    """Parse a magnitude-only column (e.g. Debit / Credit) as positive cents."""
    s = raw.strip().replace(",", "").replace("$", "").replace("NZD", "").strip()
    if not s:
        return None
    neg = s.startswith("(") and s.endswith(")")
    if neg:
        s = s[1:-1]
    try:
        v = float(s)
    except ValueError:
        return None
    cents = int(round(abs(v) * 100))
    return cents


def sniff_columns(header: list[str]) -> dict[str, int | None]:
    lower = [h.lower().strip() for h in header]
    idx = {lower[i]: i for i in range(len(lower))}

    def find(*names: str) -> int | None:
        for n in names:
            for key in idx:
                if n in key:
                    return idx[key]
        return None

    date_i = find("date", "transaction date", "posted", "tran date")
    # Prefer explicit amount over debit/credit when both exist
    amt_i = find("amount", "net amount", "transaction amount", "value")
    debit_i = find("debit", "withdrawal", "amount out", "money out")
    credit_i = find("credit", "deposit", "amount in", "money in")
    desc_i = find("description", "details", "payee", "narrative", "memo", "particulars")
    return {
        "date": date_i,
        "amount": amt_i,
        "debit": debit_i,
        "credit": credit_i,
        "description": desc_i,
    }


def ingest_csv_text(
    text: str,
    *,
    source_label: str = "csv",
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Return rows ready for insert + report."""
    f = io.StringIO(text)
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample)
    except csv.Error:
        dialect = csv.excel
    f.seek(0)
    reader = csv.reader(f, dialect)
    rows = list(reader)
    if not rows:
        return [], {"error": "empty file"}
    header = rows[0]
    data_rows = rows[1:]
    cols = sniff_columns(header)
    if cols["date"] is None:
        return [], {"error": "could not detect date column", "header": header}
    has_split = cols["debit"] is not None and cols["credit"] is not None
    if cols["amount"] is None and not has_split:
        return [], {"error": "could not detect amount columns (need Amount or both Debit and Credit)", "header": header}

    def row_max_idx() -> int:
        indices = [cols[k] for k in cols if cols[k] is not None]
        return max(indices) if indices else 0

    out: list[dict[str, Any]] = []
    skipped = 0
    for r in data_rows:
        if len(r) <= row_max_idx():
            skipped += 1
            continue
        ds = parse_date(r[cols["date"]])
        if not ds:
            skipped += 1
            continue
        amt: int | None = None
        if has_split:
            d_raw = r[cols["debit"]] if cols["debit"] is not None else ""
            c_raw = r[cols["credit"]] if cols["credit"] is not None else ""
            d_cents = parse_amount_unsigned(d_raw) or 0
            c_cents = parse_amount_unsigned(c_raw) or 0
            if d_cents == 0 and c_cents == 0:
                skipped += 1
                continue
            # Inflow positive, outflow negative (Cash Cat convention)
            amt = c_cents - d_cents
        else:
            assert cols["amount"] is not None
            amt = parse_amount(r[cols["amount"]])
        if amt is None:
            skipped += 1
            continue
        desc = r[cols["description"]] if cols["description"] is not None and len(r) > cols["description"] else ""
        dedupe = hashlib.sha256(f"{ds}|{amt}|{desc}|{source_label}".encode()).hexdigest()
        out.append(
            {
                "txn_date": ds,
                "amount_cents": amt,
                "description_raw": desc or "(no description)",
                "dedupe_hash": dedupe,
                "source_label": source_label,
                "account_label": source_label,
            }
        )

    return out, {
        "row_count": len(out),
        "skipped_rows": skipped,
        "columns_detected": cols,
    }
