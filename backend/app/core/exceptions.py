"""중앙집중식 예외 처리 — 표준 에러 응답 포맷."""
import logging
import traceback

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import settings

logger = logging.getLogger("ifl.errors")


def _error_response(
    status_code: int,
    error: str,
    detail: str | None = None,
    errors: list[dict] | None = None,
) -> JSONResponse:
    """표준 에러 응답 포맷."""
    body: dict = {
        "status_code": status_code,
        "error": error,
    }
    if detail:
        body["detail"] = detail
    if errors:
        body["errors"] = errors
    return JSONResponse(status_code=status_code, content=body)


def register_exception_handlers(app: FastAPI) -> None:
    """FastAPI 앱에 글로벌 예외 핸들러를 등록."""

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        """HTTPException — 라우터에서 raise한 에러를 표준 포맷으로 변환."""
        logger.warning(
            "HTTP %d %s %s — %s",
            exc.status_code,
            request.method,
            request.url.path,
            exc.detail,
        )
        return _error_response(
            status_code=exc.status_code,
            error=_status_phrase(exc.status_code),
            detail=str(exc.detail) if exc.detail else None,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ):
        """Pydantic 유효성 검증 실패 — 필드별 에러 목록 반환."""
        field_errors = []
        for err in exc.errors():
            loc = " → ".join(str(l) for l in err.get("loc", []))
            field_errors.append({
                "field": loc,
                "message": err.get("msg", ""),
                "type": err.get("type", ""),
            })

        logger.warning(
            "Validation error %s %s — %d field(s)",
            request.method,
            request.url.path,
            len(field_errors),
        )
        return _error_response(
            status_code=422,
            error="Validation Error",
            detail="요청 데이터가 유효하지 않습니다.",
            errors=field_errors,
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        """예상치 못한 예외 — 프로덕션에서 스택 트레이스 숨김."""
        logger.error(
            "Unhandled exception %s %s — %s: %s",
            request.method,
            request.url.path,
            type(exc).__name__,
            exc,
            exc_info=True,
        )

        if settings.ENVIRONMENT == "production":
            detail = "서버 내부 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
        else:
            detail = f"{type(exc).__name__}: {exc}\n{traceback.format_exc()}"

        return _error_response(
            status_code=500,
            error="Internal Server Error",
            detail=detail,
        )


def _status_phrase(code: int) -> str:
    """HTTP 상태 코드 → 표준 문구."""
    phrases = {
        400: "Bad Request",
        401: "Unauthorized",
        403: "Forbidden",
        404: "Not Found",
        405: "Method Not Allowed",
        409: "Conflict",
        413: "Payload Too Large",
        422: "Unprocessable Entity",
        429: "Too Many Requests",
        500: "Internal Server Error",
        502: "Bad Gateway",
        503: "Service Unavailable",
    }
    return phrases.get(code, "Error")
