import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Folder(Base):
    """교수자가 자신의 강의를 묶어 관리하기 위한 컬렉션.

    - 강의(`lectures.folder_id`)는 옵션 외래키로 폴더에 소속될 수 있다.
    - 폴더 삭제 시 강의의 `folder_id`는 NULL로 풀려 미분류 상태로 돌아간다 (lecture 자체는 보존).
    - 동일 교수자 내에서 `name`을 중복 사용해도 무방(편의 우선). UI에서 정렬·필터.
    """

    __tablename__ = "folders"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    instructor_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    instructor = relationship("User", backref="folders")
    lectures = relationship(
        "Lecture",
        back_populates="folder",
        passive_deletes=True,
    )
