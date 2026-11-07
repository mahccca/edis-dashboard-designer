from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

PLATFORM_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="IP_", env_file=".env", extra="ignore")

    database_url: str
    cookie_secure: bool = True
    session_ttl_hours: int = 12
    session_idle_minutes: int = 120
    allowed_origins: list[str] = []
    contracts_dir: Path = PLATFORM_ROOT / "contracts"
    login_max_failures: int = 10
    login_failure_window_seconds: int = 900
    feature_scada_adapter: bool = False
    max_document_bytes: int = 2 * 1024 * 1024
    ws_push_interval_seconds: float = 1.0


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
