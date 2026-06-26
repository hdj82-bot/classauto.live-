"""자유게시판 모델 (베타 테스터 커뮤니티 — 글 + 댓글).

베타 기간 테스터들이 사용하며 느낀 점을 서로 공개로 나누는 게시판. 운영자에게만
가는 비공개 피드백(``feedback``)과 달리, 누구나 열람할 수 있고 작성은 로그인한
사용자만 가능하다(권한 결정 2026-06-27).

작성자가 탈퇴해도 글·댓글 본문은 보존한다(FK SET NULL + author_name 스냅샷).
공개 노출은 표시 이름(author_name)만 하고 이메일은 절대 노출하지 않는다.
"""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class BoardPost(Base):
    __tablename__ = "board_posts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    # 작성자 — 탈퇴 시 SET NULL 로 글은 남기고 작성자만 끊는다.
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # 표시 이름 스냅샷(작성 시점). 공개 노출은 이 값만 — 이메일은 저장/노출하지 않는다.
    author_name: Mapped[str] = mapped_column(String(120), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    # 운영자 공지 고정(상단 노출). 일반 글은 False.
    pinned: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    comments: Mapped[list["BoardComment"]] = relationship(
        "BoardComment",
        back_populates="post",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class BoardComment(Base):
    __tablename__ = "board_comments"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    post_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("board_posts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    author_name: Mapped[str] = mapped_column(String(120), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    post: Mapped["BoardPost"] = relationship("BoardPost", back_populates="comments")
