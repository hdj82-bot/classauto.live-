"""구조화된 로깅 설정."""
import json
import logging
import re
import sys
from datetime import datetime, timezone

from app.core.config import settings


# ── 민감정보 마스킹 ────────────────────────────────────────────────────────────
# 로그에 토큰·비밀키·비밀번호가 평문으로 흘러들어가지 않도록 포매팅된
# 최종 문자열에서 패턴 매칭으로 [REDACTED] 처리한다. record.args 를
# 변형하지 않아 % 포매팅이 깨지지 않으며, 모든 핸들러에 일괄 적용된다.

_SENSITIVE_KEYS = (
    "authorization",
    "access[_-]?token",
    "refresh[_-]?token",
    "api[_-]?key",
    "secret(?:[_-]?key)?",
    "password",
    "passwd",
    "client[_-]?secret",
    "jwt",
    "x-heygen-signature",
    "stripe-signature",
)

# 1) "Bearer <token>" — KV 매칭이 'Bearer' 자체를 값으로 삼아버리지 않게
#    KV 보다 먼저 적용한다.
_BEARER_PATTERN = re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._\-]+")

# 2) "Authorization": "..." / api_key=... / "token":"..."
#    값은 따옴표 묶음·줄 끝까지·세미콜론까지 폭넓게 흡수한다 (한 줄 로그 가정).
_KV_PATTERN = re.compile(
    rf'(?i)("?(?:{"|".join(_SENSITIVE_KEYS)})"?\s*[:=]\s*)'
    r'("[^"]*"|\'[^\']*\'|[^\r\n;]+)'
)


def _redact(text: str) -> str:
    if not text:
        return text
    out = _BEARER_PATTERN.sub("Bearer [REDACTED]", text)
    out = _KV_PATTERN.sub(lambda m: f"{m.group(1)}[REDACTED]", out)
    return out


class _RedactingTextFormatter(logging.Formatter):
    """개발용 단순 텍스트 포매터에 마스킹을 덧붙인 변종."""

    def format(self, record: logging.LogRecord) -> str:
        return _redact(super().format(record))


class JSONFormatter(logging.Formatter):
    """프로덕션용 JSON 로그 포매터 (민감정보 마스킹 포함)."""

    def format(self, record: logging.LogRecord) -> str:
        from app.core.middleware import request_id_var

        log = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": _redact(record.getMessage()),
            "request_id": getattr(record, "request_id", None) or request_id_var.get("-"),
        }
        if record.exc_info and record.exc_info[1]:
            log["exc"] = _redact(self.formatException(record.exc_info))
        return json.dumps(log, ensure_ascii=False)


def setup_logging() -> None:
    """앱 시작 시 로깅 초기화."""
    from app.core.middleware import RequestIDFilter

    is_prod = settings.ENVIRONMENT == "production"
    level = logging.INFO if is_prod else logging.DEBUG

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        JSONFormatter()
        if is_prod
        else _RedactingTextFormatter(
            "%(asctime)s %(levelname)-8s [%(name)s] [%(request_id)s] %(message)s",
            datefmt="%H:%M:%S",
        )
    )

    # request_id 필터를 핸들러에 추가 — 모든 로그에 request_id 포함
    handler.addFilter(RequestIDFilter())

    root = logging.getLogger()
    root.setLevel(level)
    root.handlers = [handler]

    # 외부 라이브러리 로그 레벨 조정
    for noisy in ("httpx", "httpcore", "urllib3", "sqlalchemy.engine"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
