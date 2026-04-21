"""Rule matching — deterministic."""

from __future__ import annotations

import json
import re
from typing import Any, Literal

AmountSign = Literal["positive", "negative", "any"]


def _normalise_term(t: str) -> str:
    s = t.lower()
    s = re.sub(r"\s+", " ", s)
    return s


def matches_amount_sign(amount_cents: int, sign: AmountSign) -> bool:
    if sign == "any":
        return True
    if sign == "positive":
        return amount_cents > 0
    return amount_cents < 0


def match_rule(haystack: str, rule: dict[str, Any], *, amount_cents: int) -> bool:
    """Return True if rule matches haystack (already normalised lowercase) and amount sign."""
    sign = rule.get("amount_sign", "any")
    if not matches_amount_sign(amount_cents, sign):
        return False

    kind = rule.get("kind", "contains_any")
    if kind == "contains_any":
        terms: list[str] = sorted(rule.get("terms", []))
        for t in terms:
            tt = _normalise_term(t)
            if not tt.strip():
                continue
            if tt in haystack:
                return True
        return False
    if kind == "contains_all":
        terms = sorted(rule.get("terms", []))
        return all(
            (_normalise_term(t) in haystack) for t in terms if t and _normalise_term(t).strip()
        )
    if kind == "regex":
        pattern = rule.get("pattern", "")
        try:
            return re.search(pattern, haystack, re.IGNORECASE) is not None
        except re.error:
            return False
    return False


def parse_db_rule(pattern_json: str) -> dict[str, Any] | None:
    try:
        d = json.loads(pattern_json)
        if isinstance(d, dict) and "kind" in d:
            return d
    except json.JSONDecodeError:
        pass
    return None
