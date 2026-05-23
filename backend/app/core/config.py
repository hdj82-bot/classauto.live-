import logging

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

# 화이트리스트 — 오타("prodution")로 인해 prod 보호 분기를 우회당하는 사고 방지.
_ALLOWED_ENVIRONMENTS: frozenset[str] = frozenset(
    {"development", "staging", "production", "test"}
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # ── Environment ────────────────────────────────────────────
    ENVIRONMENT: str = "development"  # development | staging | production | test

    @field_validator("ENVIRONMENT")
    @classmethod
    def _validate_environment(cls, v: str) -> str:
        v_norm = (v or "").strip().lower()
        if v_norm not in _ALLOWED_ENVIRONMENTS:
            raise ValueError(
                f"ENVIRONMENT must be one of {sorted(_ALLOWED_ENVIRONMENTS)} (got {v!r})"
            )
        return v_norm

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
    # 자막 번역 전용 — 텍스트→텍스트라 가장 빠르고 저렴한 Haiku 로 충분.
    # 전 슬라이드를 단일 호출로 번역하므로 max_tokens 는 넉넉히 둔다(잘리면 폴백).
    TRANSLATE_MODEL: str = "claude-haiku-4-5"
    TRANSLATE_MAX_TOKENS: int = 16384
    SCRIPT_MAX_TOKENS: int = 2048
    # 슬라이드별 스크립트 생성 시 동시 호출 상한. Anthropic 분당 요청 수
    # rate limit 보호용. 너무 높이면 429 가 늘어 retry 백오프로 오히려 느려진다.
    SCRIPT_CONCURRENCY: int = 5
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
    # 단일 변수(HEYGEN_AVATAR_ID)는 deprecated alias — _MALE 의 fallback 으로만 사용.
    # 신규 코드는 services/pipeline/heygen.py:pick_avatar_id(gender) 를 써야 함.
    HEYGEN_AVATAR_ID: str = ""
    HEYGEN_AVATAR_ID_MALE: str = ""
    HEYGEN_AVATAR_ID_FEMALE: str = ""
    HEYGEN_WEBHOOK_SECRET: str = ""
    HEYGEN_CALLBACK_URL: str = "http://localhost:8000/api/v1/webhooks/heygen"
    # 영상 1초당 USD 단가 — Creator 플랜 추정치(약 $0.50/min). 운영 시 실측값으로 교체.
    # 0 으로 두면 비용 기록은 duration 만 남기고 cost_usd=0 (회계 비활성).
    HEYGEN_COST_USD_PER_SECOND: float = 0.0083

    # ── TTS: ElevenLabs (primary) ───────────────────────────────
    ELEVENLABS_API_KEY: str = ""
    # 단일 변수(ELEVENLABS_VOICE_ID)는 deprecated alias — _MALE 의 fallback 으로만 사용.
    # 신규 코드는 services/pipeline/elevenlabs_client.py:pick_voice_id(gender) 를 써야 함.
    ELEVENLABS_VOICE_ID: str = ""
    ELEVENLABS_VOICE_ID_MALE: str = ""
    ELEVENLABS_VOICE_ID_FEMALE: str = ""
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
    BACKUP_S3_PREFIX: str = "backups/"  # 일일 DB 백업 저장 prefix

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


# 1단계(베타 무료 배포)는 결제 비활성화 — STRIPE_* 는 검증에서 제외.
# 결제 엔드포인트는 STRIPE_SECRET_KEY 가 비어 있으면 런타임에 503 으로 차단된다
# (app/api/v1/payment.py 의 _require_stripe). Phase 7 유료 전환 시 다시 추가.
_REQUIRED_IN_PROD = [
    "HEYGEN_WEBHOOK_SECRET",
    "ANTHROPIC_API_KEY",
]


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

        # 빈 문자열·공백만 들어간 값도 누락으로 간주 — pydantic 의 default ""
        # 가 환경변수로 무심코 덮어써졌을 때 production 에서 사일런트 통과 차단.
        missing = [
            k for k in _REQUIRED_IN_PROD
            if not (getattr(settings, k) or "").strip()
        ]
        if missing:
            raise RuntimeError(f"프로덕션 필수 환경변수 누락: {missing}")

    # 개발/프로덕션 공통: 핵심 API 키 경고
    missing_keys = []
    if not settings.ANTHROPIC_API_KEY:
        missing_keys.append("ANTHROPIC_API_KEY")
    if not settings.OPENAI_API_KEY:
        missing_keys.append("OPENAI_API_KEY")
    if missing_keys:
        logger.warning("필수 API 키 미설정: %s — 관련 기능이 작동하지 않습니다.", ", ".join(missing_keys))


_validate_settings()
