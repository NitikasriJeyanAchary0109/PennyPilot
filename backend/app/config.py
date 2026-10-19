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
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 1 Day
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
