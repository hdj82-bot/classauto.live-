"""IFL HeyGen — 설정."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ── HeyGen ──────────────────────────────────────────────
    heygen_api_key: str = ""
    heygen_base_url: str = "https://api.heygen.com"
    heygen_avatar_id: str = ""
    heygen_webhook_secret: str = ""
    heygen_callback_url: str = "http://localhost:8001/api/webhooks/heygen"

    # ── TTS: ElevenLabs (primary) ───────────────────────────
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = ""
    elevenlabs_model_id: str = "eleven_multilingual_v2"

    # ── TTS: Google Cloud (fallback) ────────────────────────
    google_tts_credentials_json: str = ""
    google_tts_language_code: str = "ko-KR"
    google_tts_voice_name: str = "ko-KR-Neural2-A"

    # ── AWS S3 ──────────────────────────────────────────────
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_region: str = "ap-northeast-2"
    s3_bucket: str = "ifl-videos"
    s3_prefix: str = "heygen/"

    # ── Celery / Redis ──────────────────────────────────────
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/1"
    redis_url: str = "redis://localhost:6379/1"

    # ── PostgreSQL ──────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://ifl:ifl@localhost:5432/ifl_heygen"
    database_url_sync: str = "postgresql://ifl:ifl@localhost:5432/ifl_heygen"

    # ── Notification ────────────────────────────────────────
    notification_webhook_url: str = ""

    # ── Polling ─────────────────────────────────────────────
    polling_interval_seconds: int = 600  # 10분

    # ── 집중 경고 ───────────────────────────────────────────
    attention_heartbeat_interval_seconds: int = 10
    attention_no_response_timeout_seconds: int = 30

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
