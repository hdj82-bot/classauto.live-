from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # ── DB / Redis ──────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://user:pass@db:5432/ifl"
    DATABASE_URL_SYNC: str = "postgresql://user:pass@db:5432/ifl"
    REDIS_URL: str = "redis://redis:6379/0"

    # ── JWT ─────────────────────────────────────────────────────
    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ── Google OAuth ────────────────────────────────────────────
    GOOGLE_OAUTH_CLIENT_ID: str = ""
    GOOGLE_OAUTH_CLIENT_SECRET: str = ""
    GOOGLE_OAUTH_REDIRECT_URI: str = "http://localhost:8000/api/auth/google/callback"

    # ── Anthropic ───────────────────────────────────────────────
    ANTHROPIC_API_KEY: str = ""
    CLAUDE_MODEL: str = "claude-opus-4-6"

    # ── OpenAI (임베딩) ─────────────────────────────────────────
    OPENAI_API_KEY: str = ""
    EMBEDDING_MODEL: str = "text-embedding-3-small"

    # ── 평가 시스템 ─────────────────────────────────────────────
    FORMATIVE_SERVE_COUNT: int = 5
    SUMMATIVE_SERVE_COUNT: int = 5
    TIMESTAMP_TOLERANCE_SECONDS: int = 120

    # ── HeyGen ──────────────────────────────────────────────────
    HEYGEN_API_KEY: str = ""
    HEYGEN_BASE_URL: str = "https://api.heygen.com"
    HEYGEN_AVATAR_ID: str = ""
    HEYGEN_WEBHOOK_SECRET: str = ""
    HEYGEN_CALLBACK_URL: str = "http://localhost:8000/api/v1/webhooks/heygen"

    # ── TTS: ElevenLabs (primary) ───────────────────────────────
    ELEVENLABS_API_KEY: str = ""
    ELEVENLABS_VOICE_ID: str = ""
    ELEVENLABS_MODEL_ID: str = "eleven_multilingual_v2"

    # ── TTS: Google Cloud (fallback) ────────────────────────────
    GOOGLE_TTS_CREDENTIALS_JSON: str = ""
    GOOGLE_TTS_LANGUAGE_CODE: str = "ko-KR"
    GOOGLE_TTS_VOICE_NAME: str = "ko-KR-Neural2-A"

    # ── AWS S3 ──────────────────────────────────────────────────
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_REGION: str = "ap-northeast-2"
    S3_BUCKET: str = "ifl-videos"
    S3_PREFIX: str = "heygen/"

    # ── Celery / Redis ──────────────────────────────────────────
    CELERY_BROKER_URL: str = "redis://redis:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://redis:6379/0"

    # ── 알림 / 폴링 ────────────────────────────────────────────
    NOTIFICATION_WEBHOOK_URL: str = ""
    POLLING_INTERVAL_SECONDS: int = 600

    # ── 집중 경고 ───────────────────────────────────────────────
    ATTENTION_HEARTBEAT_INTERVAL_SECONDS: int = 10
    ATTENTION_NO_RESPONSE_TIMEOUT_SECONDS: int = 30

    # ── 번역 ────────────────────────────────────────────────────
    DEEPL_API_KEY: str = ""

    # ── Frontend ────────────────────────────────────────────────
    FRONTEND_URL: str = "http://localhost:3000"


settings = Settings()
