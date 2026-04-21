"""구조화된 로깅 설정."""
import logging
import sys
from datetime import datetime, timezone

from app.core.config import settings


class JSONFormatter(logging.Formatter):
    """프로덕션용 JSON 로그 포매터."""

    def format(self, record: logging.LogRecord) -> str:
        from app.core.middleware import request_id_var

        log = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "request_id": getattr(record, "request_id", None) or request_id_var.get("-"),
        }
        if record.exc_info and record.exc_info[1]:
            log["exc"] = self.formatException(record.exc_info)
        # 한 줄 JSON
        import json
        return json.dumps(log, ensure_ascii=False)


def setup_logging() -> None:
    """앱 시작 시 로깅 초기화."""
    from app.core.middleware import RequestIDFilter

    is_prod = settings.ENVIRONMENT == "production"
    level = logging.INFO if is_prod else logging.DEBUG

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JSONFormatter() if is_prod else logging.Formatter(
        "%(asctime)s %(levelname)-8s [%(name)s] [%(request_id)s] %(message)s",
        datefmt="%H:%M:%S",
    ))

    # request_id 필터를 핸들러에 추가 — 모든 로그에 request_id 포함
    handler.addFilter(RequestIDFilter())

    root = logging.getLogger()
    root.setLevel(level)
    root.handlers = [handler]

    # 외부 라이브러리 로그 레벨 조정
    for noisy in ("httpx", "httpcore", "urllib3", "sqlalchemy.engine"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
