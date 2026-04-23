import logging
import warnings

from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # ── Environment ────────────────────────────────────────────
    ENVIRONMENT: str = "development"  # development | staging | production

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
    SCRIPT_MODEL: str = "claude-sonnet-4-6"
    QA_MODEL: str = "claude-opus-4-6"
    SCRIPT_MAX_TOKENS: int = 2048
    CLAUDE_INPUT_COST_PER_M: float = 3.00
    CLAUDE_OUTPUT_COST_PER_M: float = 15.00

    # ── OpenAI (임베딩) ─────────────────────────────────────────
    OPENAI_API_KEY: str = ""
    EMBEDDING_MODEL: str = "text-embedding-3-small"

    # ── 평가 시스템 ─────────────────────────────────────────────
    FORMATIVE_SERVE_COUNT: int = 5
    SUMMATIVE_SERVE_COUNT: int = 5
    TIMESTAMP_TOLERANCE_SECONDS: int = 120

    # ── 출석 판단 기준 ───────────────────────────────────────────
    DEFAULT_LIVE_DEADLINE_MINUTES: int = 30  # 강의별 설정이 없을 때 사용

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
    S3_BUCKET: str = "ifl-platform-videos"
    S3_PREFIX: str = "heygen/"
    S3_PPT_PREFIX: str = "ppt/"
    S3_PRESIGNED_EXPIRATION: int = 3600  # presigned URL 만료 시간 (초)

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

    # ── Stripe 결제 ──────────────────────────────────────────────
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_PRICE_BASIC: str = ""   # Stripe Price ID for BASIC plan
    STRIPE_PRICE_PRO: str = ""     # Stripe Price ID for PRO plan

    # ── pgvector ──────────────────────────────────────────────────
    SIMILARITY_THRESHOLD: float = 0.7

    # ── Sentry ──────────────────────────────────────────────────
    SENTRY_DSN: str = ""
    SENTRY_TRACES_SAMPLE_RATE: float = 0.1  # 프로덕션 트레이싱 10%

    # ── Frontend ────────────────────────────────────────────────
    FRONTEND_URL: str = "http://localhost:3000"


settings = Settings()


def _validate_settings() -> None:
    """프로덕션 환경에서 필수 설정값 검증."""
    if settings.ENVIRONMENT == "production":
        if settings.JWT_SECRET_KEY == "change-me-in-production":
            raise RuntimeError("프로덕션에서 JWT_SECRET_KEY를 반드시 변경해야 합니다.")
        if len(settings.JWT_SECRET_KEY) < 32:
            raise RuntimeError("JWT_SECRET_KEY는 최소 32자 이상이어야 합니다.")
        if settings.JWT_ALGORITHM != "HS256":
            raise RuntimeError("JWT_ALGORITHM은 HS256만 허용됩니다.")
        if not settings.GOOGLE_OAUTH_CLIENT_ID or not settings.GOOGLE_OAUTH_CLIENT_SECRET:
            raise RuntimeError("프로덕션에서 Google OAuth 설정은 필수입니다.")
        if not settings.HEYGEN_WEBHOOK_SECRET:
            warnings.warn("HEYGEN_WEBHOOK_SECRET이 설정되지 않았습니다. 웹훅 검증이 비활성화됩니다.", stacklevel=2)
        if not settings.STRIPE_WEBHOOK_SECRET:
            warnings.warn("STRIPE_WEBHOOK_SECRET이 설정되지 않았습니다.", stacklevel=2)

    # 개발/프로덕션 공통: 핵심 API 키 경고
    missing_keys = []
    if not settings.ANTHROPIC_API_KEY:
        missing_keys.append("ANTHROPIC_API_KEY")
    if not settings.OPENAI_API_KEY:
        missing_keys.append("OPENAI_API_KEY")
    if missing_keys:
        logger.warning("필수 API 키 미설정: %s — 관련 기능이 작동하지 않습니다.", ", ".join(missing_keys))


_validate_settings()
