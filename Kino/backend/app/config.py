import os
from pydantic_settings import BaseSettings
from functools import lru_cache


# Sentinel: if SECRET_KEY equals this in production, the app must refuse to start.
DEFAULT_SECRET_KEY_PLACEHOLDER = "dev-secret-key-change-in-production"


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql://postgres:postgres@localhost:5432/kino"

    # Google OAuth
    google_client_id: str = ""
    google_client_secret: str = ""

    # App
    secret_key: str = DEFAULT_SECRET_KEY_PLACEHOLDER
    frontend_url: str = "http://localhost:5173"

    # AI - Mistral API (primary)
    mistral_api_key: str = ""
    mistral_model: str = "mistral-small-latest"

    # AI - Ollama (fallback)
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5:3b"

    # Which AI backend to use: "mistral" or "ollama"
    ai_backend: str = "mistral"

    # File storage
    upload_dir: str = "./uploads"

    model_config = {"env_file": ".env", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    settings = Settings()

    # Hard-fail if production is using the default secret. Anyone reading the
    # source code could otherwise forge JWTs.
    is_prod = os.getenv("ENV", "dev").lower() == "production"
    if is_prod:
        if not settings.secret_key or settings.secret_key == DEFAULT_SECRET_KEY_PLACEHOLDER:
            raise RuntimeError(
                "SECRET_KEY is unset or still the default. "
                "Set a strong random value in your .env before starting in production."
            )
        if len(settings.secret_key) < 32:
            raise RuntimeError(
                "SECRET_KEY is too short (need at least 32 chars). "
                "Generate with: python -c 'import secrets; print(secrets.token_urlsafe(48))'"
            )

    return settings
