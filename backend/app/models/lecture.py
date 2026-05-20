import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class VoiceGender(str, enum.Enum):
    """강의 단위 아바타·보이스 성별 — HeyGen avatar / ElevenLabs voice 분기 키.

    PlanType 과 동일하게 ``str + enum.Enum`` 쌍으로 두어 SAEnum 컬럼이 PG 에서
    네이티브 enum 타입을 자동 생성하도록 한다. 신규 강의의 기본값은 ``male``.
    """
    male = "male"
    female = "female"


class Lecture(Base):
    __tablename__ = "lectures"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    course_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    video_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    thumbnail_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    slug: Mapped[str] = mapped_column(String(300), unique=True, nullable=False, index=True)
    order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    live_deadline_minutes: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    pipeline_task_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    # 강의 단위 아바타·보이스 성별. NULL 허용 X — 기본 male.
    # services/pipeline/heygen.py:pick_avatar_id 와 elevenlabs_client.py:pick_voice_id 가 분기 키로 사용.
    voice_gender: Mapped[VoiceGender] = mapped_column(
        SAEnum(VoiceGender, name="voice_gender"),
        nullable=False,
        default=VoiceGender.male,
        server_default=VoiceGender.male.value,
    )
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # 교수자가 만든 컬렉션(Folder)으로 강의를 묶기 위한 옵션 외래키.
    # NULL = 미분류. 폴더 삭제 시 ondelete=SET NULL 로 자동 해제(강의 자체는 보존).
    folder_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("folders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    course = relationship("Course", back_populates="lectures")
    folder = relationship("Folder", back_populates="lectures")
    # T7: ORM 레벨 cascade — DB FK 의 ondelete=CASCADE 와 함께, 세션이 child 를 로드한
    # 상태에서 lecture 가 삭제될 때 child rows 도 일관되게 정리되도록 명시.
    sessions = relationship(
        "LearningSession", back_populates="lecture", cascade="all, delete-orphan"
    )
    questions = relationship(
        "Question",
        back_populates="lecture",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    video_renders = relationship(
        "VideoRender",
        back_populates="lecture",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
