"""DB 일일 자동 백업 (Celery beat 트리거).

DATABASE_URL_SYNC 를 파싱해 컨테이너 내부에서 pg_dump 를 직접 실행하고
gzip 압축 후 S3 에 오프사이트 복제한다. docker socket mount 가 필요 없으며,
스크립트 백업과 달리 호스트 장애 시에도 데이터가 보존된다.

S3 측 30일 이상 객체 삭제는 코드가 아닌 S3 lifecycle rule 로 처리한다
(콘솔에서 BACKUP_S3_PREFIX 경로에 expiration 30 days 규칙 등록).
"""
from __future__ import annotations

import gzip
import logging
import subprocess
from datetime import datetime, timezone
from urllib.parse import urlparse

from app.celery_app import celery
from app.core.config import settings
from app.services.pipeline import s3 as s3_svc

logger = logging.getLogger(__name__)

PG_DUMP_TIMEOUT_SECONDS = 1800  # 30분 — 대용량 DB 대비


def _parse_sync_dsn(dsn: str) -> dict[str, str]:
    """postgresql://user:pass@host:port/db → 컴포넌트 dict."""
    parsed = urlparse(dsn)
    if not parsed.hostname or not parsed.username or not parsed.path:
        raise ValueError("DATABASE_URL_SYNC parse 실패: host/user/db 누락")
    return {
        "host": parsed.hostname,
        "port": str(parsed.port or 5432),
        "user": parsed.username,
        "password": parsed.password or "",
        "db": parsed.path.lstrip("/"),
    }


@celery.task(bind=True, max_retries=2, default_retry_delay=300)
def daily_db_backup(self) -> dict:
    """pg_dump → gzip → S3 업로드. 키: {BACKUP_S3_PREFIX}ifl_backup_<UTC ISO>.dump.gz."""
    try:
        conn = _parse_sync_dsn(settings.DATABASE_URL_SYNC)
    except ValueError as exc:
        logger.error("백업 중단: %s", exc)
        return {"status": "error", "reason": str(exc)}

    cmd = [
        "pg_dump",
        "-h", conn["host"],
        "-p", conn["port"],
        "-U", conn["user"],
        "-d", conn["db"],
        "-Fc",  # custom format: pg_restore 로 복원, 압축 포함
    ]
    env = {"PGPASSWORD": conn["password"]}

    logger.info("DB 백업 시작: db=%s host=%s", conn["db"], conn["host"])
    try:
        result = subprocess.run(
            cmd,
            env=env,
            capture_output=True,
            timeout=PG_DUMP_TIMEOUT_SECONDS,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        logger.error("pg_dump 타임아웃 (%ds)", PG_DUMP_TIMEOUT_SECONDS)
        raise self.retry(exc=exc)

    if result.returncode != 0:
        stderr = result.stderr.decode("utf-8", errors="replace")[:500]
        logger.error("pg_dump 실패 (rc=%d): %s", result.returncode, stderr)
        raise self.retry(exc=RuntimeError(f"pg_dump rc={result.returncode}"))

    dump_bytes = result.stdout
    compressed = gzip.compress(dump_bytes)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    s3_key = f"{settings.BACKUP_S3_PREFIX}ifl_backup_{timestamp}.dump.gz"

    s3_url = s3_svc.upload_file(compressed, s3_key, content_type="application/gzip")
    logger.info(
        "DB 백업 완료: %s (raw=%dKB, gz=%dKB)",
        s3_key, len(dump_bytes) // 1024, len(compressed) // 1024,
    )
    return {
        "status": "ok",
        "s3_key": s3_key,
        "s3_url": s3_url,
        "raw_bytes": len(dump_bytes),
        "compressed_bytes": len(compressed),
    }
