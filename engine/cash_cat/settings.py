import os
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Engine configuration from environment."""

    model_config = SettingsConfigDict(env_prefix="CASH_CAT_", extra="ignore")

    db_path: Path = Field(default_factory=lambda: Path(os.environ.get("CASH_CAT_DB_PATH", "./data/cash_cat.db")))
    akahu_api_base: str = "https://api.akahu.io/v1"
    # Comma-separated list. Use * for allow-all (not recommended if the engine is reachable beyond localhost).
    cors_origins: str = Field(
        default="http://127.0.0.1:1420,http://localhost:1420,http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:8787,tauri://localhost"
    )


settings = Settings()
