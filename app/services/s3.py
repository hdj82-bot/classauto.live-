"""S3 파일 업로드 서비스."""

from __future__ import annotations

import logging
from pathlib import Path

import boto3

from app.config import settings

logger = logging.getLogger(__name__)


def upload_to_s3(
    file_path: str | None = None,
    file_bytes: bytes | None = None,
    s3_key: str = "",
    content_type: str = "video/mp4",
) -> str:
    """파일을 S3에 업로드하고 URL을 반환한다.

    Parameters
    ----------
    file_path : 로컬 파일 경로 (file_bytes와 택 1)
    file_bytes : 파일 바이트 데이터
    s3_key : S3 오브젝트 키
    content_type : MIME 타입

    Returns
    -------
    str : S3 URL
    """
    s3 = boto3.client(
        "s3",
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
        region_name=settings.aws_region,
    )

    if file_bytes:
        s3.put_object(
            Bucket=settings.s3_bucket,
            Key=s3_key,
            Body=file_bytes,
            ContentType=content_type,
        )
    elif file_path:
        s3.upload_file(
            file_path,
            settings.s3_bucket,
            s3_key,
            ExtraArgs={"ContentType": content_type},
        )
    else:
        raise ValueError("file_path 또는 file_bytes 중 하나는 필수입니다.")

    url = f"https://{settings.s3_bucket}.s3.{settings.aws_region}.amazonaws.com/{s3_key}"
    logger.info("S3 업로드 완료: %s", url)
    return url
