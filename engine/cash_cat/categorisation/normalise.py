"""Normalise text for deterministic matching."""

from __future__ import annotations

import re
import unicodedata


def normalise_text(s: str) -> str:
    if not s:
        return ""
    s = unicodedata.normalize("NFKC", s)
    s = s.lower().strip()
    s = re.sub(r"\s+", " ", s)
    return s


def combined_fields(
    description_raw: str,
    normalised_merchant: str | None,
    provider: str | None,
) -> str:
    parts = [description_raw or ""]
    if normalised_merchant:
        parts.append(normalised_merchant)
    if provider:
        parts.append(provider)
    return normalise_text(" ".join(parts))
