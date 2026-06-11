import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ProfessorInvite(Base):
    """교수자 회원가입 초대 (베타 게이트).

    계정주(ADMIN_EMAILS)가 초대 대상 이메일을 지정해 발급하는 단일 사용 토큰.
    그 이메일의 Google 계정만 1회 교수자로 가입할 수 있다. 학습자 가입은 이
    게이트와 무관(강의 링크로 자유 가입).

    단일 사용은 ``used_at`` 으로 표시하며, 추가로 가입 시 Google ``google_sub``
    유니크 제약이 동일 계정의 재사용을 막는다. 이메일 잠금 + 단일 사용 + 만료
    (``expires_at``) 3중으로 무단 교수자 가입을 차단한다.
    """

    __tablename__ = "professor_invites"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    # 초대 링크 토큰 (secrets.token_urlsafe). 링크: /auth/invite?token=...
    token: Mapped[str] = mapped_column(
        String(64), unique=True, nullable=False, index=True
    )
    # 초대 대상 이메일 (소문자 정규화). 가입 시 Google 이메일과 일치해야 한다.
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    # 현재는 'professor' 고정. 향후 역할 확장 대비 컬럼으로 보관.
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="professor")
    # 발급한 운영자. 유저 삭제 시 초대 기록은 남기되 FK 만 비운다.
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # 이 초대로 생성된 유저. 미사용이면 NULL.
    used_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # NULL = 무기한. 설정 시 이후엔 사용 불가.
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
