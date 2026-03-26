"""Pydantic 응답/요청 스키마."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.models.video import VideoStatus


class SlideContent(BaseModel):
    slide_number: int
    texts: list[str] = Field(default_factory=list, description="슬라이드 내 텍스트")
    speaker_notes: str = Field(default="", description="발표자 노트")
    image_paths: list[str] = Field(default_factory=list, description="추출된 이미지 경로")


class SlideScript(BaseModel):
    slide_number: int
    script: str = Field(description="생성된 발화 스크립트")


class UploadResponse(BaseModel):
    task_id: str
    message: str = "파이프라인이 시작되었습니다."


class SlideResponse(BaseModel):
    slide_number: int
    text_content: str
    speaker_notes: str
    script: str | None = None
    is_approved: bool = False


class VideoDetailResponse(BaseModel):
    task_id: str
    filename: str
    status: VideoStatus
    total_slides: int
    slides: list[SlideResponse] = Field(default_factory=list)
    error_message: str | None = None
