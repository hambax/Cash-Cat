-- Singleton AI provider configuration (plaintext on disk; future: OS keychain).
CREATE TABLE IF NOT EXISTS ai_provider (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    provider    TEXT NOT NULL DEFAULT 'none',
    api_key     TEXT,
    base_url    TEXT,
    model       TEXT,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
