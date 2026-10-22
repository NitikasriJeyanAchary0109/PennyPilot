import os

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # ==========================
    # Database Configuration
    # ==========================
    DATABASE_URL: str = "postgresql://postgres:password123@db:5432/sparechange"

    # ==========================
    # JWT Configuration
    # ==========================
    JWT_SECRET: str = "dev-secret-key"
    JWT_ALGORITHM: str = "HS256"
    # Short-lived: clients renew it with a rotating refresh token (/auth/refresh).
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # ==========================
    # Google OAuth
    # ==========================
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""

    # ==========================
    # Ollama Configuration
    # ==========================
    OLLAMA_URL: str = "http://ollama:11434/api/generate"
    OLLAMA_MODEL: str = "llama3"
    # Max tokens per reply. Replies cut off by this limit are trimmed to the last
    # complete sentence rather than shown mid-word.
    OLLAMA_NUM_PREDICT: int = 160

    # ==========================
    # Bank simulation (sandbox: no real bank is connected)
    # ==========================
    BANK_SIMULATION_ENABLED: bool = True

    # ==========================
    # Server Configuration
    # ==========================
    ENVIRONMENT: str = "development"
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # ==========================
    # CORS
    # ==========================
    ALLOWED_ORIGINS: str = "*"

    # ==========================
    # Pydantic Settings
    # ==========================
    model_config = SettingsConfigDict(
        env_file=(
            os.path.join(
                os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                ".env",
            ),
            os.path.join(
                os.path.dirname(
                    os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                ),
                ".env",
            ),
        ),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()

_INSECURE_JWT_SECRETS = {
    "dev-secret-key",
    "your_jwt_secret_key_minimum_32_characters_long_for_security",
}


def assert_production_ready(cfg: Settings = settings) -> None:
    """Refuse to boot a production server with a guessable signing secret."""
    if cfg.ENVIRONMENT.lower() != "production":
        return
    if cfg.JWT_SECRET in _INSECURE_JWT_SECRETS or len(cfg.JWT_SECRET) < 32:
        raise RuntimeError(
            "JWT_SECRET must be a unique random value of at least 32 characters "
            "when ENVIRONMENT=production."
        )
