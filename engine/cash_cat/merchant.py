"""Normalise merchant / payee strings for grouping and charts."""

from __future__ import annotations

import re


def normalise_merchant(description_raw: str | None) -> str | None:
    """Strip common NZ bank noise; return a short label for grouping."""
    if not description_raw:
        return None
    s = description_raw.strip()
    if not s or s == "(no description)":
        return None
    # Common prefixes (case-insensitive)
    for prefix in (
        "pos ",
        "pos w/d ",
        "eft ",
        "eftpos ",
        "debit ",
        "credit ",
        "visa purchase ",
        "contactless ",
    ):
        low = s.lower()
        if low.startswith(prefix):
            s = s[len(prefix) :].strip()
            break
    s = re.sub(r"\s+", " ", s)
    # Trailing date-like tokens
    s = re.sub(r"\s+\d{1,2}/\d{1,2}/\d{2,4}$", "", s)
    s = re.sub(r"\s+\d{4}-\d{2}-\d{2}$", "", s)
    s = s.strip()
    if not s:
        return None
    return s[:240] if len(s) > 240 else s
