"""Add AVATAR_QA value to costcategory enum (QA 아바타 렌더 비용 기록).

Revision ID: 0058
Revises: 0057
Create Date: 2026-06-18

변경 내용:
- ``platform_cost_logs.category`` 의 PG enum ``costcategory`` 에 ``AVATAR_QA`` 값 추가.
    Q&A 아바타 렌더(HeyGen 퍼블릭 / VisionStory 본인 얼굴)는 VideoRender 가 없어
    render_cost_logs(video_render_id FK)에 적재할 수 없어, 그동안 어느 비용 테이블에도
    기록되지 않아 운영자 비용 대시보드(/admin/costs·beta-overview)가 과소집계됐다.
    이제 lecture_id 키의 platform_cost_logs 에 이 카테고리로 적재한다
    (app/tasks/qa_batch.py::_record_qa_render_cost).

멱등: ``ADD VALUE IF NOT EXISTS`` 로 재적용 안전.
다운그레이드: PostgreSQL 은 enum 값 제거를 직접 지원하지 않으므로 no-op
(값이 남아도 무해 — 사용처가 없으면 그냥 미사용 라벨).
SQLite(테스트)는 SAEnum 이 VARCHAR+CHECK 라 모델 정의만으로 반영되어 본 DDL 불필요.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "0058"
down_revision: Union[str, None] = "0057"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        # PG 12+ 는 트랜잭션 안에서 ADD VALUE 가능(같은 트랜잭션에서 사용만 안 하면 됨).
        op.execute("ALTER TYPE costcategory ADD VALUE IF NOT EXISTS 'AVATAR_QA'")


def downgrade() -> None:
    # PostgreSQL 은 enum 값 제거 미지원 — no-op(미사용 라벨로 남겨 둠).
    pass
