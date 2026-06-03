import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum as SAEnum,
    Float,
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
    # on-demand 다운로드용 합성 mp4(슬라이드+구간 음성, ffmpeg). 학생용 재생과 분리.
    # mp4_status: none|building|ready|failed (NULL=아직 요청 안 함).
    mp4_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    mp4_status: Mapped[str | None] = mapped_column(String(16), nullable=True)
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
    # 강의에 선택된 HeyGen 아바타. NULL = voice_gender 기준 기본 아바타
    # (HEYGEN_AVATAR_ID_{MALE,FEMALE}). 교수자가 아바타 페이지에서 특정 아바타
    # (기본 목록 또는 본인 photo avatar)를 고르면 그 ID 를 저장하고
    # heygen.create_video 가 우선 사용한다.
    avatar_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # 우측 패널·갤러리에 노출할 강의별 아바타 표시 이름 (교수자 자유 편집).
    # NULL = 기본 표시명. 영상 생성 로직과 무관한 라벨 전용.
    avatar_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # 영상에서 아바타가 차지하는 크기 배율. 1.0 = 기본. studio 미리보기의 PiP
    # 크기와 1:1로 매핑되며, render.py 가 heygen.create_video(avatar_scale=) 로
    # 전달해 HeyGen character.scale 에 반영한다(작을수록 프레임 안에서 아바타가
    # 작아짐). 합성 시 0.3~2.0 으로 클램프.
    avatar_scale: Mapped[float] = mapped_column(
        Float, nullable=False, default=1.0, server_default="1.0"
    )
    # 영상에서 나올 음성(TTS)의 언어. ISO 639-1 (ko/zh/en/ja/de/fr/ru). 기본 ko.
    voice_lang: Mapped[str] = mapped_column(
        String(10), nullable=False, default="ko", server_default="ko"
    )
    # 영상 자막의 언어. NULL = 음성과 동일(별도 번역 없음). voice_lang 과 다른
    # 값이면 자막은 발화 내용의 번역본(VideoScript.subtitle_segments)을 사용.
    subtitle_lang: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # 교수자가 고른 ElevenLabs 보이스 ID. NULL = voice_gender 기준 기본 보이스
    # (elevenlabs_client.pick_voice_id). render.py 가 합성 시 이 보이스를 사용.
    voice_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # 영상 발화 속도 배율. 1.0 = 기본. ElevenLabs voice_settings.speed 유효범위
    # 0.7~1.2 로 합성 시 클램프. render.py 가 synthesize(speed=) 로 전달.
    voice_speed: Mapped[float] = mapped_column(
        Float, nullable=False, default=1.0, server_default="1.0"
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
        "LearningSession",
        back_populates="lecture",
        cascade="all, delete-orphan",
        passive_deletes=True,
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
    # videos.lecture_id 는 NOT NULL + ondelete=CASCADE. ORM 측에서도 cascade·
    # passive_deletes 를 명시해야 lecture 삭제 시 SQLAlchemy 가 "UPDATE videos
    # SET lecture_id=NULL" 시도하지 않고 DB 의 CASCADE 에 위임한다.
    # 과거 Video.lecture 가 ``backref="videos"`` (옵션 없음) 만 가지고 있어
    # production 에서 IntegrityError(NotNullViolation) 발생 — 본 명시로 해소.
    videos = relationship(
        "Video",
        back_populates="lecture",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
