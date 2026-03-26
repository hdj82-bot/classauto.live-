from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # DB / Redis
    DATABASE_URL: str = "postgresql+asyncpg://user:pass@db:5432/ifl"
    REDIS_URL: str = "redis://redis:6379/0"

    # JWT
    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Google OAuth
    GOOGLE_OAUTH_CLIENT_ID: str = ""
    GOOGLE_OAUTH_CLIENT_SECRET: str = ""
    GOOGLE_OAUTH_REDIRECT_URI: str = "http://localhost:8000/api/auth/google/callback"

    # Anthropic
    ANTHROPIC_API_KEY: str = ""

    # 평가 시스템
    FORMATIVE_SERVE_COUNT: int = 5    # 회당 제공 형성평가 문항 수
    SUMMATIVE_SERVE_COUNT: int = 5    # 회당 제공 총괄평가 문항 수
    TIMESTAMP_TOLERANCE_SECONDS: int = 120  # 타임스탬프 허용 오차(초)

    # Frontend
    FRONTEND_URL: str = "http://localhost:3000"


settings = Settings()
