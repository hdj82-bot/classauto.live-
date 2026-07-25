import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ProfessorInvite(Base):
    """교수자 회원가입 초대 (베타 게이트).

    계정주(ADMIN_EMAILS)가 발급하는 **단일 사용** 토큰. 두 가지 형태가 있다.

    - **공개 초대** (``email IS NULL``): 받는 사람을 미리 지정하지 않는다. 운영자가
      링크·QR 만 만들어 전달하고, 그 링크를 연 **첫 1명**이 교수자로 가입한다.
      초대받은 사람이 링크를 남에게 공유해도 이미 사용됐으면 아무도 못 쓴다.
    - **이메일 지정 초대** (``email`` 존재): 종전 방식. 그 이메일의 Google 계정만
      가입할 수 있다. 대상을 아는 경우 한 겹 더 잠그고 싶을 때 쓴다.

    학습자 가입은 이 게이트와 무관하다(교수자가 만든 강의 링크로 자유 가입).

    단일 사용은 ``used_at`` 으로 표시하되, 공개 초대에서는 이메일 잠금이 없어
    **토큰 자체가 자격증명**이므로 단일 사용이 마지막 방어선이 된다. 그래서 소비는
    ``used_at IS NULL`` 조건부 UPDATE 로 원자적으로 처리한다
    (``services/invite.claim_invite``) — 같은 링크를 동시에 연 두 사람 중 하나만
    통과한다. 추가로 Google ``google_sub`` 유니크 제약이 동일 계정의 재사용을 막는다.
    """

    __tablename__ = "professor_invites"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    # 초대 링크 토큰 (secrets.token_urlsafe). 링크: /auth/invite?token=...
    token: Mapped[str] = mapped_column(
        String(64), unique=True, nullable=False, index=True
    )
    # 초대 대상 이메일 (소문자 정규화). 지정하면 가입 시 Google 이메일과 일치해야
    # 한다. NULL = 공개 초대 — 대상을 잠그지 않고 링크를 연 첫 1명이 가입한다.
    email: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    # 현재는 'professor' 고정. 향후 역할 확장 대비 컬럼으로 보관.
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="professor")
    # 베타 코호트 태그(예: "2026-08"). 운영자가 초대 발급 시 지정(없으면 NULL).
    # 가입 시 생성된 교수자 users.cohort 로 복사된다(api/v1/auth.complete_profile).
    cohort: Mapped[str | None] = mapped_column(String(40), nullable=True)
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
