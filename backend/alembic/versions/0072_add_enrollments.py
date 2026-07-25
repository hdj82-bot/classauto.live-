"""수강 등록(enrollments) 테이블 + courses.term — 스펙 15 1단계.

Revision ID: 0072
Revises: 0071
Create Date: 2026-07-26

배경: 교수자와 학생을 잇는 관계가 저장돼 있지 않아, "내 학생"이 세션 기록을 거꾸로 탄
사후 파생이었다. 그래서 (1) 등록만 하고 한 번도 안 본 학생은 존재 자체가 보이지 않고,
(2) 출석률 분모가 "본 사람 수"이며, (3) 학생을 반에서 뺄 방법이 없었다.

변경 내용:
- ``enrollments`` 신규 — (course_id, student_id) 유니크. 제적은 행 삭제가 아니라
  ``status='withdrawn'`` 으로 남긴다. 삭제하면 이미 쌓인 세션·평가 결과가 주인을 잃고
  연구 데이터(스펙 10) 코호트 집계가 과거와 어긋난다. 유니크 제약 덕에 재등록은 새 행이
  아니라 같은 행의 상태 전이가 되어 이력이 한 줄에 모인다.
- ``enrollments.section`` — 분반 라벨. 같은 과목의 여러 분반은 **같은 영상을 보므로**
  Course 를 분반마다 만들지 않는다(영상·RAG 임베딩을 분반 수만큼 복제하게 되고 렌더
  비용이 배가 된다). 스키마에만 넣고 UI 노출은 3단계.
- ``courses.term`` — 학기 라벨(예: "2026-2"). 없으면 2027-1 에 같은 과목을 다시 열 때
  지난 학기 학생과 섞인다. 나중에 추가하면 백필이 필요하므로 여기서 함께 넣는다.
  **기존 행은 NULL 로 둔다** — 어느 학기였는지 알 방법이 없고, 추정해 넣으면 틀린 값이
  사실처럼 굳는다.

멱등: 테이블/컬럼 존재 시 건너뜀. 다운그레이드는 역순.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0072"
down_revision: Union[str, None] = "0071"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "enrollments"


def _has_table(table: str) -> bool:
    insp = sa.inspect(op.get_bind())
    return table in insp.get_table_names()


def _has_column(table: str, column: str) -> bool:
    insp = sa.inspect(op.get_bind())
    try:
        return any(c["name"] == column for c in insp.get_columns(table))
    except Exception:  # noqa: BLE001 — 테이블이 없으면 컬럼도 없다고 본다.
        return False


def upgrade() -> None:
    if not _has_table(_TABLE):
        op.create_table(
            _TABLE,
            sa.Column("id", sa.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "course_id",
                sa.UUID(as_uuid=True),
                sa.ForeignKey("courses.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "student_id",
                sa.UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            # active | withdrawn. 승인제가 필요해지면 'pending' 을 더하면 된다.
            sa.Column(
                "status",
                sa.String(16),
                nullable=False,
                server_default="active",
            ),
            # 분반 라벨(예: "01", "화3"). NULL = 분반 구분 없음.
            sa.Column("section", sa.String(20), nullable=True),
            # link = 강의/강좌 링크로 자동 등록, manual = 교수자가 명단에서 추가.
            sa.Column(
                "source",
                sa.String(16),
                nullable=False,
                server_default="link",
            ),
            sa.Column(
                "joined_at",
                sa.DateTime(timezone=True),
                server_default=sa.func.now(),
                nullable=False,
            ),
            sa.Column("withdrawn_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column(
                "withdrawn_by",
                sa.UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            ),
            sa.Column("note", sa.Text(), nullable=True),
            sa.UniqueConstraint(
                "course_id", "student_id", name="uq_enrollments_course_student"
            ),
        )
        # 명단 조회 핫패스(강좌의 활성 수강생).
        op.create_index(
            "ix_enrollments_course_status", _TABLE, ["course_id", "status"]
        )
        # "내가 듣는 강좌" 역방향 + create_session 게이트 조회.
        op.create_index("ix_enrollments_student_id", _TABLE, ["student_id"])

    if _has_table("courses") and not _has_column("courses", "term"):
        op.add_column("courses", sa.Column("term", sa.String(20), nullable=True))


def downgrade() -> None:
    if _has_column("courses", "term"):
        op.drop_column("courses", "term")

    if _has_table(_TABLE):
        op.drop_index("ix_enrollments_student_id", table_name=_TABLE)
        op.drop_index("ix_enrollments_course_status", table_name=_TABLE)
        op.drop_table(_TABLE)
