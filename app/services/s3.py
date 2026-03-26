"""IFL HeyGen — S3 업로드 서비스."""

from __future__ import annotations

import logging
import time
import uuid

import boto3
import httpx

from app.config import settings

logger = logging.getLogger(__name__)


def get_s3_client():
    return boto3.client(
        "s3",
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
        region_name=settings.aws_region,
    )


async def upload_from_url(source_url: str, lecture_id: str, slide_number: int | None = None) -> tuple[str, float]:
    """원격 URL의 비디오를 다운로드하여 S3에 업로드한다.

    Returns:
        (s3_url, elapsed_seconds)
    """
    # 다운로드
    async with httpx.AsyncClient(timeout=300.0) as client:
        resp = await client.get(source_url)
        resp.raise_for_status()
    video_bytes = resp.content

    # S3 키 생성
    suffix = f"_slide{slide_number}" if slide_number else ""
    filename = f"{lecture_id}{suffix}_{uuid.uuid4().hex[:8]}.mp4"
    s3_key = f"{settings.s3_prefix}{lecture_id}/{filename}"

    # 업로드
    start = time.monotonic()
    s3 = get_s3_client()
    s3.put_object(
        Bucket=settings.s3_bucket,
        Key=s3_key,
        Body=video_bytes,
        ContentType="video/mp4",
    )
    elapsed = time.monotonic() - start

    s3_url = f"https://{settings.s3_bucket}.s3.{settings.aws_region}.amazonaws.com/{s3_key}"
    logger.info("S3 업로드 완료: %s (%.1f초)", s3_url, elapsed)
    return s3_url, elapsed


def upload_audio_bytes(audio_bytes: bytes, render_id: str, ext: str = "mp3") -> str:
    """TTS 오디오 바이트를 S3에 업로드하고 URL을 반환한다."""
    s3_key = f"{settings.s3_prefix}audio/{render_id}.{ext}"
    s3 = get_s3_client()
    s3.put_object(
        Bucket=settings.s3_bucket,
        Key=s3_key,
        Body=audio_bytes,
        ContentType=f"audio/{ext}",
    )
    return f"https://{settings.s3_bucket}.s3.{settings.aws_region}.amazonaws.com/{s3_key}"
