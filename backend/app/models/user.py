import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class UserRole(str, enum.Enum):
    professor = "professor"
    student = "student"
    admin = "admin"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    google_sub: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    role: Mapped[UserRole] = mapped_column(SAEnum(UserRole), nullable=False)
    # 교수자 전용
    school: Mapped[str | None] = mapped_column(String(200), nullable=True)
    department: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # 교수자가 업로드한 프로필 사진 (본인 아바타 소스)의 S3 https URL.
    profile_image_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    # 업로드한 사진으로 HeyGen 에 등록한 Talking Photo ID. 본인 모습으로 강의
    # 영상을 만들 때 heygen.create_video 의 talking_photo_id 로 쓴다. NULL =
    # 아직 본인 아바타 미등록 또는 생성 대기/실패.
    photo_avatar_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # 본인 아바타 "움직이는 미리보기" — Talking Photo 로 1회 렌더한 짧은 샘플 영상.
    # photo_avatar_preview_url: 완성된 영상의 영구 S3 https URL (있으면 캐시 적중).
    # photo_avatar_preview_video_id: 렌더 진행 중인 HeyGen video_id (폴링 키).
    # photo_avatar_preview_voice_id: 그 미리보기를 렌더할 때 쓴 ElevenLabs voice_id
    #   (다른 음성으로 다시 만들기 판정용).
    photo_avatar_preview_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    photo_avatar_preview_video_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    photo_avatar_preview_voice_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # 교수자가 본인 음성 샘플(mp3 등)로 만든 ElevenLabs Cloned Voice (IVC).
    # cloned_voice_id: ElevenLabs voice_id. 채워지면 GET /api/voices 계정 보이스로
    #   자동 노출돼 음성 패널·미리보기·강의 렌더에 본인 목소리로 쓸 수 있다. NULL =
    #   아직 본인 음성 미생성. 1인 1개(재업로드 시 교체).
    # cloned_voice_name: 표시 이름(예: "<이름> (본인 목소리)").
    # cloned_voice_sample_url: 업로드한 원본 음성 샘플의 S3 https URL(참조·재생성용).
    cloned_voice_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cloned_voice_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    cloned_voice_sample_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    # HeyGen v2 Photo Avatar(Design with AI 룩) — Talking Photo 의 상위 호환 경로.
    # photo_avatar_group_id: 사진으로 만든 avatar group id (룩 생성의 기반).
    # photo_avatar_group_status: "training"|"ready"|"failed" (학습 폴링 결과).
    # photo_avatar_default_look_id: 교수자가 고른 기본 룩의 avatar_id — 강의 렌더가
    #   lecture.avatar_id 가 없을 때 이 값으로 폴백한다(본인 얼굴을 모든 강의에).
    photo_avatar_group_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    photo_avatar_group_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # photo_avatar_group_error: status="failed" 일 때의 사유 분류 코드
    #   ("insufficient_credit"|"invalid_image"|"unknown"). 사용자에게 정확한 안내를
    #   고르기 위함 — 크레딧 부족을 "사진을 바꾸라"고 오안내하지 않도록.
    photo_avatar_group_error: Mapped[str | None] = mapped_column(String(40), nullable=True)
    photo_avatar_default_look_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # 학습자 전용
    student_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
