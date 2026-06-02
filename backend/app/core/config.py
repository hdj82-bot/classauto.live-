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
    # 모델 정책(2026-05-23): 모든 생성 과정은 "속도 최우선" — 가장 빠른 경량
    # 모델(Haiku)을 기본으로 한다. 특정 과정의 결과 품질이 부족하다고 판단되면
    # 그 과정의 *_MODEL 만 상위 모델(sonnet/opus)로 올려 대응한다. 모델은 모두
    # 설정값이므로 코드 변경 없이 env 로 즉시 조정 가능.
    ANTHROPIC_API_KEY: str = ""
    CLAUDE_MODEL: str = "claude-haiku-4-5"        # 공용 기본값(현재 직접 사용처 없음)
    SCRIPT_MODEL: str = "claude-haiku-4-5"        # 발화 스크립트 생성 (스튜디오)
    QUESTION_MODEL: str = "claude-haiku-4-5"      # 평가 문제 생성 (스튜디오)
    QA_MODEL: str = "claude-haiku-4-5"            # 학생 RAG Q&A
    # 소크라테스식 인터랙티브 퀴즈 저작 대화 — 다중 턴 추론 품질이 중요해 예외적으로
    # 상위 모델(Sonnet)을 쓴다. 영상당 1회성 대화라 비용 영향은 작다. 비용은
    # CostLog(LLM_ASSESSMENT)에 서버 기록만 하고 교수자 UI에는 노출하지 않는다.
    SOCRATIC_MODEL: str = "claude-sonnet-4-6"     # 퀴즈 저작 소크라테스 대화 (스튜디오)
    SOCRATIC_MAX_TOKENS: int = 2048
    # 자막 번역 전용 — 텍스트→텍스트라 가장 빠르고 저렴한 Haiku 로 충분.
    # 슬라이드별로 1회씩 병렬 호출한다(전체를 1회로 묶으면 출력이 커져 30s
    # 타임아웃 → 폴백 hang 으로 이어졌다). max_tokens 는 슬라이드 1장 분량 상한.
    TRANSLATE_MODEL: str = "claude-haiku-4-5"
    TRANSLATE_MAX_TOKENS: int = 4096
    # 자막 번역 동시 호출 상한. Anthropic 계정의 "동시 연결 수" 제한이 낮아
    # 10 이면 429(concurrent connections exceeded) 발생 → 스크립트 생성(5)보다
    # 보수적으로 4. 초과분은 retry_external 백오프 재시도가 흡수.
    TRANSLATE_CONCURRENCY: int = 4
    # Google Translate 폴백 활성화 여부. 운영엔 Google 번역 자격증명이 없어
    # 기본 비활성 — 켜면 google.cloud Client() 가 자격증명을 못 찾아 GCE
    # 메타데이터 서버 조회로 무한 대기(요청 hang)하므로, 실제 자격증명을
    # 구성한 환경에서만 true 로 둔다.
    GOOGLE_TRANSLATE_ENABLED: bool = False
    SCRIPT_MAX_TOKENS: int = 2048
    # 슬라이드별 스크립트 생성 시 동시 호출 상한. Anthropic 분당 요청 수
    # rate limit 보호용. 너무 높이면 429 가 늘어 retry 백오프로 오히려 느려진다.
    SCRIPT_CONCURRENCY: int = 5
    # 본인 음성 녹음용 대본 생성 전용 — 짧은 단발 호출이라 "가장 빠르고 싼"
    # 최신 Haiku 를 고정한다(앞당겨진 응답 시간이 UX 핵심). thinking 미사용.
    VOICE_SCRIPT_MODEL: str = "claude-haiku-4-5-20251001"
    # 대본은 ~500자 한 단락 — 한국어/일본어 500자는 출력 토큰 ~600~700 수준이라
    # mid-sentence 잘림을 피하면서도 기본(2048)보다 타이트하게 768 로 캡한다.
    VOICE_SCRIPT_MAX_TOKENS: int = 768
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
    # 영상 1초당 USD 단가 — API 종량제 실측 기준 약 $1/min = $0.0167/sec.
    # 0 으로 두면 비용 기록은 duration 만 남기고 cost_usd=0 (회계 비활성).
    HEYGEN_COST_USD_PER_SECOND: float = 0.0167
    # 렌더 해상도. 720p 가 테스트·베타 기본. 베타 후 1920×1080 으로 상향 가능.
    HEYGEN_DIMENSION_WIDTH: int = 1280
    HEYGEN_DIMENSION_HEIGHT: int = 720
    # mock 모드: 켜면 실제 HeyGen API 를 호출하지 않아 크레딧이 ₩0 (로컬/테스트용).
    HEYGEN_MOCK: bool = False
    # mock 완료 처리 시 사용할 placeholder 영상 URL (비우면 mock 렌더는 완료되지 않음).
    HEYGEN_MOCK_VIDEO_URL: str = ""
    # 예산 서킷 브레이커 — create_video 직전 누적 HeyGen 비용 검사. 0 이면 해당 한도 비활성.
    HEYGEN_DAILY_BUDGET_USD: float = 3.0
    HEYGEN_MONTHLY_BUDGET_USD: float = 15.0
    # Photo Avatar 룩 생성 상한 — 룩 1개당 이미지 생성 비용이 발생하므로
    # 한 번에 생성할 수 개수와 교수자당 누적 개수를 제한해 비용 폭주를 막는다.
    PHOTO_AVATAR_LOOK_BATCH_MAX: int = 4
    # 교수자(계정)당 누적 — 강의당 아님. 2026-06-01 사용자 결정으로 20→10.
    # 라이브러리에 너무 많이 쌓이면 선택 피로가 커진다는 판단.
    PHOTO_AVATAR_LOOK_TOTAL_MAX: int = 10
    # 룩이 이 시간(분) 넘게 generating 에 머물면 reaper 가 failed 로 정리한다.
    # 워커 장애로 정체된 룩이 누적 cap 을 영구 점유해 생성 버튼이 사라지는 것을
    # 막는다(app.tasks.photo_avatar.reap_stuck_looks). 정상 생성 소요(수 분)보다
    # 넉넉히 크게 둬 실제 진행 중인 작업을 죽이지 않는다.
    PHOTO_AVATAR_LOOK_STUCK_MINUTES: int = 15

    # ── Photo Avatar v0.2: gpt-image-2 룩 + Talking Photo (docs/planning/12 §0) ──
    # 룩 생성 제공자 전환 feature flag. "gpt" = OpenAI gpt-image-2 즉석 생성 +
    # Talking Photo 최종(train 0). "heygen" = 기존 Design with AI 풀코스(롤백용).
    PHOTO_AVATAR_PROVIDER: str = "gpt"
    # 룩 생성 모델·품질. tier 가 비용의 핵심 레버(high↔medium ~4배).
    OPENAI_IMAGE_MODEL: str = "gpt-image-2"
    # 사용자 결정(2026-06-01): 베타 품질 우선 — medium(~$0.042/장) → high(~$0.17/장).
    # 3장 배치 1회 ≈ $0.51. 추가 비용은 라이브러리 상한(10) + 1회성 온보딩으로 흡수.
    PHOTO_AVATAR_IMAGE_QUALITY: str = "high"  # low|medium|high
    # reference(교수 사진) 얼굴 보존 강도. **gpt-image-1 전용 파라미터** —
    # gpt-image-2 는 이 파라미터를 지원하지 않으며, 보내면 400
    # `invalid_input_fidelity_model` 로 거부된다(2026-06-01 확인).
    # 빈 문자열이면 호출 시 파라미터를 생략한다(openai_image.py 참조).
    # 모델별 권장값: gpt-image-2 → "" / gpt-image-1 → "high".
    PHOTO_AVATAR_INPUT_FIDELITY: str = ""
    PHOTO_AVATAR_LOOK_BATCH_DEFAULT: int = 3    # 한 번에 보여줄 후보 수
    # mock 모드: 켜면 OpenAI 를 호출하지 않고 더미 이미지를 반환(테스트 비용 ₩0).
    # HEYGEN_MOCK 와 동일 패턴.
    OPENAI_IMAGE_MOCK: bool = False

    # ── TTS: ElevenLabs (primary) ───────────────────────────────
    ELEVENLABS_API_KEY: str = ""
    # 단일 변수(ELEVENLABS_VOICE_ID)는 deprecated alias — _MALE 의 fallback 으로만 사용.
    # 신규 코드는 services/pipeline/elevenlabs_client.py:pick_voice_id(gender) 를 써야 함.
    ELEVENLABS_VOICE_ID: str = ""
    ELEVENLABS_VOICE_ID_MALE: str = ""
    ELEVENLABS_VOICE_ID_FEMALE: str = ""
    ELEVENLABS_MODEL_ID: str = "eleven_multilingual_v2"
    # 사이트 전체 음성 합성의 1차 모델. eleven_v3 는 한 번의 합성으로 문장 내 한·중
    # 코드스위칭까지 처리해, 구간 분리·이어붙임 없이 끊김/오발음을 없앤다. (변수명은
    # 도입 경위상 _ZH 지만 현재는 전체 텍스트에 적용.) 빈 문자열로 두면 v3 를 끄고
    # 위 ELEVENLABS_MODEL_ID(multilingual_v2) 경로로 폴백한다(escape hatch).
    ELEVENLABS_MODEL_ID_ZH: str = "eleven_v3"
    # ── 클론(IVC) 음성 합성 전용 ─────────────────────────────────
    # 교수자 본인 목소리(Instant Voice Cloning)는 eleven_v3 가 아니라
    # multilingual_v2 로 합성한다. 이유(ElevenLabs 공식 문서 근거):
    #  · v3 는 voice_settings 중 stability(Creative0.0/Natural0.5/Robust1.0) 만
    #    의미가 있고 similarity_boost·style·use_speaker_boost·speed 는 사실상
    #    무시한다 → 클론 fidelity 를 높이는 similarity_boost 튜닝이 불가능.
    #  · multilingual_v2 는 위 세팅을 모두 지원해 클론 재현(원본 목소리 닮음)을
    #    안정적으로 끌어올릴 수 있다.
    # 운영에서 모델·세팅을 코드 배포 없이 교체할 수 있도록 환경변수로 노출한다.
    ELEVENLABS_MODEL_ID_CLONE: str = "eleven_multilingual_v2"
    ELEVENLABS_CLONE_STABILITY: float = 0.45
    ELEVENLABS_CLONE_SIMILARITY_BOOST: float = 0.85
    ELEVENLABS_CLONE_STYLE: float = 0.0
    ELEVENLABS_CLONE_USE_SPEAKER_BOOST: bool = True
    # 합성 출력 포맷(품질). mp3_44100_128(=44.1kHz/128kbps) 이상 권장.
    ELEVENLABS_OUTPUT_FORMAT: str = "mp3_44100_128"
    # IVC 생성 시 업로드 샘플의 배경 잡음 제거(마이크 녹음 품질 보정 → 클론 fidelity↑).
    ELEVENLABS_IVC_REMOVE_NOISE: bool = True
    # 교수자 음성 선택 UI 에 노출할 큐레이션 보이스 ID(쉼표 구분). 비우면
    # voices.py 의 DEFAULT_CURATED_VOICE_IDS(한국어 강의용 기본 20종) 사용.
    # "차차 추가" 시 이 환경변수에 ID 를 덧붙이면 코드 배포 없이 목록 확장.
    CURATED_VOICE_IDS: str = ""

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
    # FRONTEND_URL 외 추가 허용 CORS origin(쉼표 구분) — apex/www/커스텀 도메인 등.
    # 예: "https://classauto.live,https://www.classauto.live"
    CORS_EXTRA_ORIGINS: str = ""
    # Vercel 프리뷰 배포(https://*.vercel.app) 허용 — 프리뷰에서 API 테스트 시 필요.
    CORS_ALLOW_VERCEL_PREVIEWS: bool = False


settings = Settings()


# 프로덕션에서 비어 있으면 부팅을 막을 필수 키.
# 핵심 파이프라인(스크립트·영상·룩·임베딩·저장)이 키 하나만 비어도 조용히
# 죽기 때문에, 경고가 아니라 부팅 크래시로 즉시 드러나게 한다(실패는 시끄럽게).
# 1단계(베타 무료 배포)는 결제 비활성화 — STRIPE_* 는 제외. 결제 엔드포인트는
# STRIPE_SECRET_KEY 가 비어 있으면 런타임에 503 으로 차단된다
# (app/api/v1/payment.py 의 _require_stripe). Phase 7 유료 전환 시 추가.
_REQUIRED_IN_PROD = [
    "HEYGEN_WEBHOOK_SECRET",
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",      # 임베딩(RAG)·gpt-image 룩 생성
    "HEYGEN_API_KEY",      # 아바타 영상 렌더
    "S3_BUCKET",           # PPT·썸네일·룩 이미지 저장
    "AWS_ACCESS_KEY_ID",   # S3 자격증명
    "AWS_SECRET_ACCESS_KEY",
]

# 키 자리에 그대로 남은 템플릿 placeholder — 비어 있지 않아 종전 검증을 통과한 뒤
# 런타임 401 로 조용히 실패하던 것을 부팅에서 차단한다(.env.production 의 CHANGE_ME 등).
# 주의: 너무 일반적인 패턴(예: "XXXXX")은 정상 시크릿("x"*32 등)을 오탐하므로
# 템플릿에서만 쓰이는 구체적 마커로 한정한다.
_PLACEHOLDER_MARKERS = ("CHANGE_ME", "CHANGE-ME", "CHANGEME", "YOUR_", "YOUR-", "PLACEHOLDER")


def _looks_like_placeholder(value: str) -> bool:
    upper = value.strip().upper()
    return any(marker in upper for marker in _PLACEHOLDER_MARKERS)


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
        if _looks_like_placeholder(settings.JWT_SECRET_KEY):
            raise RuntimeError("JWT_SECRET_KEY 가 placeholder 값입니다 — 실제 시크릿으로 교체하세요.")

        # 빈 문자열·공백만 들어간 값도 누락으로 간주 — pydantic 의 default ""
        # 가 환경변수로 무심코 덮어써졌을 때 production 에서 사일런트 통과 차단.
        missing = [
            k for k in _REQUIRED_IN_PROD
            if not (getattr(settings, k) or "").strip()
        ]
        if missing:
            raise RuntimeError(f"프로덕션 필수 환경변수 누락: {missing}")

        # 비어있진 않지만 CHANGE_ME 류 placeholder 가 남은 키 — 런타임 401 전에 차단.
        placeholders = [
            k for k in _REQUIRED_IN_PROD
            if _looks_like_placeholder(getattr(settings, k) or "")
        ]
        if placeholders:
            raise RuntimeError(
                f"프로덕션 필수 환경변수에 placeholder 값이 남아 있습니다: {placeholders}"
            )

        # 키 형식 sanity — 잘못 붙여넣은 키를 조기에 잡는다. 프록시/Azure 등 변형을
        # 막지 않도록 하드 실패가 아니라 경고만 한다.
        if settings.ANTHROPIC_API_KEY and not settings.ANTHROPIC_API_KEY.startswith("sk-ant-"):
            logger.warning("ANTHROPIC_API_KEY 형식이 'sk-ant-' 로 시작하지 않습니다 — 키를 확인하세요.")
        if settings.OPENAI_API_KEY and not settings.OPENAI_API_KEY.startswith("sk-"):
            logger.warning("OPENAI_API_KEY 형식이 'sk-' 로 시작하지 않습니다 — 키를 확인하세요.")

    # 개발/프로덕션 공통: 핵심 API 키 경고
    missing_keys = []
    if not settings.ANTHROPIC_API_KEY:
        missing_keys.append("ANTHROPIC_API_KEY")
    if not settings.OPENAI_API_KEY:
        missing_keys.append("OPENAI_API_KEY")
    if missing_keys:
        logger.warning("필수 API 키 미설정: %s — 관련 기능이 작동하지 않습니다.", ", ".join(missing_keys))


_validate_settings()
