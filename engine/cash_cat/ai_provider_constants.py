"""AI provider defaults and suggestion lists (no SDK — httpx only)."""

from __future__ import annotations

# Updatable when Anthropic ships new API revisions.
ANTHROPIC_API_VERSION = "2026-04-16"

# First item is the recommended default per provider; users may enter any model string.
DEFAULT_MODELS: dict[str, str] = {
    "anthropic": "claude-sonnet-4-20250514",
    "openai": "gpt-5.4",
    "gemini": "gemini-3.1-pro-preview",
    "ollama": "llama3",
}

MODEL_SUGGESTIONS: dict[str, list[str]] = {
    "anthropic": [
        "claude-sonnet-4-20250514",
        "claude-opus-4-7",
        "claude-haiku-3-5",
    ],
    "openai": [
        "gpt-5.4",
        "gpt-5.4-thinking",
        "gpt-4o",
        "gpt-4o-mini",
    ],
    "gemini": [
        "gemini-3.1-pro-preview",
        "gemini-2.5-flash",
        "gemini-2.0-flash",
    ],
}

DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434"
