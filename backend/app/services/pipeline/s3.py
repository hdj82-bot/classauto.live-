"""S3 업로드/다운로드 서비스."""
from __future__ import annotations

import logging
import threading
import time
import uuid

import boto3
from botocore.exceptions import ClientError
import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

# boto3 client 는 생성 비용이 큰(botocore 서비스 모델 파싱) 객체이고 스레드 세이프
# 하다. 매 호출 재생성하면 presign 을 행마다 부르는 핫패스(list_looks 등)에서
# 비동기 이벤트 루프를 동기 코드로 반복 블로킹한다. 프로세스당 1회만 만들어 재사용.
_s3_client = None
_s3_client_lock = threading.Lock()


def get_s3_client():
    global _s3_client
    if _s3_client is None:
        with _s3_client_lock:
            if _s3_client is None:
                _s3_client = boto3.client(
                    "s3",
                    aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
                    aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
                    region_name=settings.AWS_REGION,
                )
    return _s3_client


# ── 범용 업로드/다운로드 ─────────────────────────────────────────────────────


def upload_file(data: bytes, s3_key: str, content_type: str = "application/octet-stream") -> str:
    """바이트 데이터를 S3에 업로드하고 URL을 반환."""
    start = time.monotonic()
    s3 = get_s3_client()
    s3.put_object(Bucket=settings.S3_BUCKET, Key=s3_key, Body=data, ContentType=content_type)
    elapsed = time.monotonic() - start
    s3_url = f"https://{settings.S3_BUCKET}.s3.{settings.AWS_REGION}.amazonaws.com/{s3_key}"
    logger.info("S3 업로드 완료: %s (%.1f초, %.1fKB)", s3_key, elapsed, len(data) / 1024)
    return s3_url


def download_file(s3_key: str) -> bytes:
    """S3에서 파일을 다운로드하여 바이트로 반환."""
    start = time.monotonic()
    s3 = get_s3_client()
    resp = s3.get_object(Bucket=settings.S3_BUCKET, Key=s3_key)
    data = resp["Body"].read()
    elapsed = time.monotonic() - start
    logger.info("S3 다운로드 완료: %s (%.1f초, %.1fKB)", s3_key, elapsed, len(data) / 1024)
    return data


def generate_presigned_url(s3_key: str, expiration: int = 3600) -> str:
    """S3 객체에 대한 presigned URL 생성 (기본 1시간)."""
    s3 = get_s3_client()
    url = s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.S3_BUCKET, "Key": s3_key},
        ExpiresIn=expiration,
    )
    return url


def presign_stored_s3_url(url: str | None, expiration: int = 21600) -> str | None:
    """DB 에 저장된 영구형 S3 객체 URL 을 presigned GET URL 로 변환한다.

    슬라이드 미리보기 PNG 는 ``thumbnails/slides/...`` 키로 업로드되는데, 운영
    버킷(classauto-live-media)이 이 prefix 에 public-read 를 부여하지 않아 익명
    브라우저 GET 이 403 AccessDenied 가 난다 (2026-05-22 진단). 버킷 정책을
    공개로 바꾸는 대신 — 강의 자료를 영구 공개하지 않는 편이 보안상 낫다 —
    조회 시점에 IAM 서명된 시간제한 URL 로 바꿔 응답한다.

    우리 버킷의 virtual-hosted URL (``https://{bucket}.s3.{region}.amazonaws.com/{key}``)
    만 변환하고, 외부 URL·None 은 그대로 돌려준다. 만료는 기본 6시간 — studio
    편집 세션을 충분히 덮으며, slides 폴링이 ready 후 멈추므로 재서명 부담도 없다.
    """
    if not url:
        return url
    from urllib.parse import urlparse

    parsed = urlparse(url)
    expected_host = f"{settings.S3_BUCKET}.s3.{settings.AWS_REGION}.amazonaws.com"
    if parsed.netloc != expected_host:
        return url
    key = parsed.path.lstrip("/")
    if not key:
        return url
    return generate_presigned_url(key, expiration)


def delete_file(s3_key: str) -> bool:
    """S3 객체 삭제. 성공 시 True 반환."""
    try:
        s3 = get_s3_client()
        s3.delete_object(Bucket=settings.S3_BUCKET, Key=s3_key)
        logger.info("S3 삭제 완료: %s", s3_key)
        return True
    except ClientError as e:
        logger.error("S3 삭제 실패: %s — %s", s3_key, e)
        return False


def file_exists(s3_key: str) -> bool:
    """S3 객체 존재 여부 확인."""
    try:
        s3 = get_s3_client()
        s3.head_object(Bucket=settings.S3_BUCKET, Key=s3_key)
        return True
    except ClientError:
        return False


# ── PPT 업로드 ───────────────────────────────────────────────────────────────


def _sanitize_filename(filename: str) -> str:
    """Path traversal 및 특수문자 방지를 위한 파일명 정규화."""
    import os
    import re
    # 디렉토리 순회 문자 제거
    basename = os.path.basename(filename)
    # 허용: 알파벳, 숫자, 한글, 하이픈, 언더스코어, 점
    safe = re.sub(r"[^\w\-.]", "_", basename)
    # 연속 점 제거 (hidden file 생성 방지)
    safe = re.sub(r"\.{2,}", ".", safe)
    return safe or "upload.pptx"


# PPTX ZIP 매직 바이트 (PK\x03\x04)
_PPTX_MAGIC = b"PK\x03\x04"


def validate_pptx_content(file_bytes: bytes) -> None:
    """PPTX 파일의 매직 바이트를 검증."""
    if len(file_bytes) < 4 or file_bytes[:4] != _PPTX_MAGIC:
        raise ValueError("유효한 PPTX 파일이 아닙니다 (ZIP 형식이 아님).")


def upload_ppt(file_bytes: bytes, lecture_id: str, filename: str) -> tuple[str, str]:
    """PPT 파일을 S3에 업로드. (s3_url, s3_key) 반환."""
    validate_pptx_content(file_bytes)
    safe_name = _sanitize_filename(filename)
    s3_key = f"{settings.S3_PPT_PREFIX}{lecture_id}/{uuid.uuid4().hex[:8]}_{safe_name}"
    s3_url = upload_file(
        file_bytes, s3_key,
        content_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
    )
    return s3_url, s3_key


# ── SSRF 방지 ──────────────────────────────────────────────────────────────

# HeyGen 웹훅(event_data.url)이 돌려주는 영상은 HeyGen 소유 도메인에서만 서빙된다
# (files.heygen.ai / files2.heygen.ai / resource2.heygen.ai 등). 가짜 웹훅이
# 임의 외부 URL 을 주입해 학생에게 노출시키는 것을 막기 위해, 웹훅 다운로드 경로는
# 이 도메인(및 그 서브도메인)만 허용한다. 서명 검증과 함께 동작하는 2차 방어선.
# config.py 를 건드리지 않도록 s3.py 내부 상수로 둔다.
HEYGEN_ALLOWED_HOSTS = frozenset({"heygen.ai", "heygen.com"})


def _validate_external_url(
    url: str, allowed_hosts: frozenset[str] | None = None
) -> None:
    """SSRF 방지: 내부 네트워크 주소 접근 차단.

    ``allowed_hosts`` 가 주어지면 호스트가 해당 도메인(또는 그 서브도메인)에
    속할 때만 통과시킨다(allowlist). 웹훅처럼 외부에서 URL 을 주입할 수 있는
    경로에서 임의 외부 호스트 다운로드를 차단하는 용도다. 미지정(None)이면
    기존 SSRF 차단만 적용한다(신뢰 가능한 내부 호출 경로 호환).
    """
    from urllib.parse import urlparse
    import ipaddress

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise ValueError(f"허용되지 않는 프로토콜: {parsed.scheme}")

    hostname = (parsed.hostname or "").lower()
    blocked_hosts = {"localhost", "127.0.0.1", "0.0.0.0", "metadata.google.internal"}
    if hostname in blocked_hosts or hostname.endswith(".internal"):
        raise ValueError(f"내부 네트워크 접근 차단: {hostname}")

    try:
        ip = ipaddress.ip_address(hostname)
        if ip.is_private or ip.is_loopback or ip.is_link_local:
            raise ValueError(f"사설 IP 접근 차단: {hostname}")
    except ValueError:
        pass  # 호스트명이 도메인인 경우 통과

    if allowed_hosts is not None:
        if not any(
            hostname == h or hostname.endswith("." + h) for h in allowed_hosts
        ):
            raise ValueError(f"허용되지 않은 외부 호스트: {hostname or '(없음)'}")


# ── 기존 함수 (호환 유지) ────────────────────────────────────────────────────


async def upload_from_url(
    source_url: str,
    lecture_id: str,
    slide_number: int | None = None,
    allowed_hosts: frozenset[str] | None = None,
) -> tuple[str, float]:
    """원격 URL의 비디오를 다운로드하여 S3에 업로드. (s3_url, elapsed) 반환.

    ``allowed_hosts`` 를 넘기면 소스 호스트를 해당 도메인 allowlist 로 제한한다
    (웹훅 등 외부 주입 경로용). ``follow_redirects=False`` 로 두어, 허용 호스트가
    allowlist 밖으로 리다이렉트해 검증을 우회하는 것을 막는다.
    """
    _validate_external_url(source_url, allowed_hosts=allowed_hosts)
    async with httpx.AsyncClient(timeout=300.0, follow_redirects=False) as client:
        resp = await client.get(source_url)
        # 리다이렉트(3xx)는 따라가지 않는다 — allowlist 우회 차단. raise_for_status 는
        # 3xx 를 오류로 보지 않으므로 명시적으로 거부한다.
        if resp.is_redirect:
            raise ValueError(
                f"리다이렉트 응답 거부(allowlist 우회 차단): {source_url}"
            )
        resp.raise_for_status()
    video_bytes = resp.content

    suffix = f"_slide{slide_number}" if slide_number else ""
    filename = f"{lecture_id}{suffix}_{uuid.uuid4().hex[:8]}.mp4"
    s3_key = f"{settings.S3_PREFIX}{lecture_id}/{filename}"

    start = time.monotonic()
    s3 = get_s3_client()
    s3.put_object(Bucket=settings.S3_BUCKET, Key=s3_key, Body=video_bytes, ContentType="video/mp4")
    elapsed = time.monotonic() - start

    s3_url = f"https://{settings.S3_BUCKET}.s3.{settings.AWS_REGION}.amazonaws.com/{s3_key}"
    logger.info("S3 업로드 완료: %s (%.1f초)", s3_url, elapsed)
    return s3_url, elapsed


def upload_audio_bytes(audio_bytes: bytes, render_id: str, ext: str = "mp3") -> str:
    """TTS 오디오 바이트를 S3에 업로드."""
    s3_key = f"{settings.S3_PREFIX}audio/{render_id}.{ext}"
    s3 = get_s3_client()
    s3.put_object(Bucket=settings.S3_BUCKET, Key=s3_key, Body=audio_bytes, ContentType=f"audio/{ext}")
    return f"https://{settings.S3_BUCKET}.s3.{settings.AWS_REGION}.amazonaws.com/{s3_key}"


def upload_thumbnail(image_bytes: bytes, s3_key: str) -> str:
    """썸네일 이미지를 S3에 업로드."""
    s3 = get_s3_client()
    s3.put_object(
        Bucket=settings.S3_BUCKET, Key=s3_key, Body=image_bytes,
        ContentType="image/jpeg", CacheControl="public, max-age=86400",
    )
    return f"https://{settings.S3_BUCKET}.s3.{settings.AWS_REGION}.amazonaws.com/{s3_key}"


def upload_slide_image(image_bytes: bytes, lecture_id: str, slide_number: int) -> str:
    """슬라이드 미리보기 PNG 를 S3 에 업로드한다.

    studio 편집기가 ``GET /api/lectures/{id}/slides`` 응답에 포함된 image_url
    로 직접 ``<img>`` 태그에 박아 쓰므로 24h 캐시 + image/png 로 저장한다.
    1-based ``slide_number`` 를 그대로 key 에 박아 동일 강의 재업로드 시
    이전 파일을 덮어쓴다 — 별도 정리 작업 없이 항상 최신 슬라이드를 반환.

    Key prefix 가 ``thumbnails/slides/`` 인 이유: classauto-live-media 버킷
    정책이 ``thumbnails/*`` 경로에만 public-read 를 부여하고 있어 브라우저가
    직접 ``<img src=...>`` 로 가져올 수 있다. 신규 ``slides/`` prefix 를
    그대로 쓰면 403 — 버킷 정책 갱신이 어려운 환경에서 코드만으로 우회.
    """
    s3_key = f"thumbnails/slides/{lecture_id}/{slide_number}.png"
    s3 = get_s3_client()
    s3.put_object(
        Bucket=settings.S3_BUCKET,
        Key=s3_key,
        Body=image_bytes,
        ContentType="image/png",
        CacheControl="public, max-age=86400",
    )
    return f"https://{settings.S3_BUCKET}.s3.{settings.AWS_REGION}.amazonaws.com/{s3_key}"
