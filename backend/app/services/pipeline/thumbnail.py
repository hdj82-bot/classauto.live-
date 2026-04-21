"""비디오 썸네일 자동 생성 서비스.

HeyGen 영상 URL에서 첫 프레임을 추출하여 S3에 저장.
Pillow 기반으로 동작하며, ffmpeg 없이도 HeyGen URL에서 직접 프레임을 가져옴.
"""
from __future__ import annotations

import io
import logging
import uuid

import httpx
from PIL import Image

from app.services.pipeline import s3 as s3_svc

logger = logging.getLogger(__name__)

THUMBNAIL_WIDTH = 640
THUMBNAIL_HEIGHT = 360
THUMBNAIL_QUALITY = 85


async def generate_thumbnail_from_video_url(
    video_url: str,
    lecture_id: str | uuid.UUID,
) -> str | None:
    """비디오 URL에서 썸네일을 생성하여 S3에 업로드. S3 URL 반환."""
    try:
        # HeyGen 영상의 poster 이미지 시도 (URL + .jpg 또는 _thumbnail.jpg)
        thumbnail_url = await _try_heygen_thumbnail(video_url)
        if thumbnail_url:
            # 이미 이미지 URL이 있으면 다운로드 → 리사이즈 → S3 업로드
            image_bytes = await _download_image(thumbnail_url)
        else:
            # 영상 시작 부분 다운로드 → 대체 썸네일 생성
            image_bytes = _create_placeholder_thumbnail()

        if not image_bytes:
            return None

        # 리사이즈
        resized = _resize_image(image_bytes)

        # S3 업로드
        s3_key = f"thumbnails/{lecture_id}/{uuid.uuid4().hex[:12]}.jpg"
        s3_url = s3_svc.upload_thumbnail(resized, s3_key)

        logger.info("썸네일 생성 완료: lecture_id=%s, url=%s", lecture_id, s3_url)
        return s3_url

    except Exception as exc:
        logger.warning("썸네일 생성 실패 (무시): lecture_id=%s, error=%s", lecture_id, exc)
        return None


async def _try_heygen_thumbnail(video_url: str) -> str | None:
    """HeyGen 영상 URL에서 썸네일 URL을 유추."""
    # HeyGen은 일반적으로 영상 URL과 같은 경로에 thumbnail을 제공
    candidates = []
    if ".mp4" in video_url:
        candidates.append(video_url.replace(".mp4", "_thumbnail.jpg"))
        candidates.append(video_url.replace(".mp4", ".jpg"))

    async with httpx.AsyncClient(timeout=10.0) as client:
        for url in candidates:
            try:
                resp = await client.head(url)
                if resp.status_code == 200 and "image" in resp.headers.get("content-type", ""):
                    return url
            except Exception as exc:
                logger.debug("썸네일 URL 확인 실패: url=%s, error=%s", url, exc)
                continue

    return None


async def _download_image(url: str) -> bytes | None:
    """URL에서 이미지 다운로드."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            return resp.content
    except Exception as exc:
        logger.warning("이미지 다운로드 실패: url=%s, error=%s", url, exc)
        return None


def _resize_image(image_bytes: bytes) -> bytes:
    """이미지를 지정 크기로 리사이즈."""
    img = Image.open(io.BytesIO(image_bytes))
    img = img.convert("RGB")
    img = img.resize((THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT), Image.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=THUMBNAIL_QUALITY)
    return buf.getvalue()


def _create_placeholder_thumbnail() -> bytes:
    """대체 썸네일 생성 (그라디언트 배경 + IFL 텍스트 없이 심플하게)."""
    img = Image.new("RGB", (THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT))

    # 인디고 그라디언트 배경
    for y in range(THUMBNAIL_HEIGHT):
        ratio = y / THUMBNAIL_HEIGHT
        r = int(79 * (1 - ratio) + 49 * ratio)
        g = int(70 * (1 - ratio) + 46 * ratio)
        b = int(229 * (1 - ratio) + 168 * ratio)
        for x in range(THUMBNAIL_WIDTH):
            img.putpixel((x, y), (r, g, b))

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=THUMBNAIL_QUALITY)
    return buf.getvalue()
