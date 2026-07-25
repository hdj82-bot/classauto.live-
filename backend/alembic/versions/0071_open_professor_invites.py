"""professor_invites.email 을 nullable 로 — 이메일 없는 1회용 초대(공개 초대).

Revision ID: 0071
Revises: 0070
Create Date: 2026-07-25

배경: 종전 초대는 **이메일 잠금 + 단일 사용 + 만료** 3중이었다. 베타테스터 모집에서
상대의 Google 이메일을 미리 알아야 발급할 수 있어 불편했다. ``email`` 을 nullable 로
바꿔 **공개 초대**(email IS NULL)를 허용한다 — 받는 사람이 누구든 링크/QR 을 연 첫
1명만 가입한다.

보안 등가: 이메일 잠금이 빠지면 토큰 자체가 자격증명(bearer)이 된다. 따라서 단일 사용
보장이 3중의 마지막 방어선이 되므로, 애플리케이션에서 ``used_at IS NULL`` 조건부
UPDATE 로 **원자적 claim** 을 한다(services/invite.claim_invite). 이 마이그레이션은
그 claim 이 인덱스를 타도록 부분 인덱스도 함께 만든다.

- ``professor_invites.email`` : NOT NULL → NULL 허용
- ``ix_professor_invites_unused`` : 미사용 초대 조회/claim 핫패스용 부분 인덱스

멱등: 이미 nullable 이면 건너뜀. 다운그레이드는 email IS NULL 행이 남아 있으면
NOT NULL 로 되돌릴 수 없으므로, 그 행들을 먼저 삭제한 뒤 복원한다(공개 초대는 다운그레이드
대상 버전에서 의미가 없는 데이터다).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0071"
down_revision: Union[str, None] = "0070"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "professor_invites"
_PARTIAL_INDEX = "ix_professor_invites_unused"


def _has_table(table: str) -> bool:
    insp = sa.inspect(op.get_bind())
    return table in insp.get_table_names()


def _column(table: str, column: str) -> dict | None:
    insp = sa.inspect(op.get_bind())
    try:
        for c in insp.get_columns(table):
            if c["name"] == column:
                return c
    except Exception:  # noqa: BLE001 — 테이블이 없으면 컬럼도 없다고 본다.
        return None
    return None


def _has_index(table: str, name: str) -> bool:
    insp = sa.inspect(op.get_bind())
    try:
        return any(ix["name"] == name for ix in insp.get_indexes(table))
    except Exception:  # noqa: BLE001
        return False


def upgrade() -> None:
    if not _has_table(_TABLE):
        return

    col = _column(_TABLE, "email")
    if col is not None and not col.get("nullable", False):
        op.alter_column(
            _TABLE,
            "email",
            existing_type=sa.String(length=255),
            nullable=True,
        )

    # 미사용 초대만 담는 부분 인덱스 — claim(UPDATE ... WHERE used_at IS NULL)과
    # 운영자 목록의 active 필터가 함께 쓴다. SQLite 는 부분 인덱스를 지원하지만
    # 방언 차이를 피하려고 지원 여부와 무관하게 postgresql 에서만 만든다.
    bind = op.get_bind()
    if bind.dialect.name == "postgresql" and not _has_index(_TABLE, _PARTIAL_INDEX):
        op.create_index(
            _PARTIAL_INDEX,
            _TABLE,
            ["created_at"],
            unique=False,
            postgresql_where=sa.text("used_at IS NULL"),
        )


def downgrade() -> None:
    if not _has_table(_TABLE):
        return

    if _has_index(_TABLE, _PARTIAL_INDEX):
        op.drop_index(_PARTIAL_INDEX, table_name=_TABLE)

    col = _column(_TABLE, "email")
    if col is not None and col.get("nullable", False):
        # NOT NULL 복원 전에 공개 초대(email IS NULL) 행을 정리한다.
        # 이 버전에는 공개 초대 개념이 없어 되살릴 값이 없다.
        op.execute(sa.text(f"DELETE FROM {_TABLE} WHERE email IS NULL"))
        op.alter_column(
            _TABLE,
            "email",
            existing_type=sa.String(length=255),
            nullable=False,
        )
