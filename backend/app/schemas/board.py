"""자유게시판 스키마 (글 + 댓글)."""
from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class BoardPostCreateRequest(BaseModel):
    """로그인 사용자가 새 글을 작성할 때."""

    title: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=10000)

    @field_validator("title", "body")
    @classmethod
    def _strip_nonempty(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("내용을 입력해 주세요.")
        return v


class BoardCommentCreateRequest(BaseModel):
    """로그인 사용자가 댓글을 작성할 때."""

    body: str = Field(min_length=1, max_length=4000)

    @field_validator("body")
    @classmethod
    def _strip_nonempty(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("내용을 입력해 주세요.")
        return v


class BoardCommentResponse(BaseModel):
    id: str
    author_name: str
    body: str
    created_at: datetime
    # 현재 사용자가 이 댓글을 지울 수 있는지(작성자 본인 또는 운영자).
    can_delete: bool = False


class BoardPostSummary(BaseModel):
    """목록용 — 본문 대신 댓글 수만 포함."""

    id: str
    author_name: str
    title: str
    pinned: bool
    comment_count: int
    created_at: datetime


class BoardPostDetail(BaseModel):
    """상세용 — 본문 + 댓글 전체."""

    id: str
    author_name: str
    title: str
    body: str
    pinned: bool
    created_at: datetime
    comments: list[BoardCommentResponse]
    can_delete: bool = False


class BoardPostListResponse(BaseModel):
    total: int
    page: int
    limit: int
    posts: list[BoardPostSummary]
