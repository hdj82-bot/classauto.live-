"""Fix costcategory enum: add lowercase 'avatar_qa' label (Q&A 렌더 크래시 핫픽스).

Revision ID: 0063
Revises: 0062
Create Date: 2026-06-22

문제:
- SQLAlchemy ``SAEnum(CostCategory)`` 는 (values_callable 미설정) enum 멤버의 **이름**
  (소문자: ``avatar_qa``)을 DB 로 보낸다. 그런데 0058 마이그레이션은 enum 에 **값**
  (대문자: ``AVATAR_QA``)을 추가했다. 둘이 어긋나, Q&A 아바타 렌더 경로에서 도는
  카테고리 필터 SELECT(``budget.visionstory_spend_usd`` →
  ``assert_visionstory_budget``)와 비용 INSERT(``qa_batch._record_qa_render_cost``)가
  모두 다음으로 크래시했다:

      (psycopg2.errors.InvalidTextRepresentation)
      invalid input value for enum costcategory: "avatar_qa"

  ``assert_visionstory_budget`` 은 렌더 제출 **직전** 호출되고 예외가
  ``BudgetExceededError`` 가 아니라서 ``_submit_cluster`` 밖으로 튀어나가,
  ``_render_seed_questions`` 가 모든 사전 질문을 ``failed`` 로 표시했다(=교수자 화면의
  "Q&A 영상 제작 실패"). 즉 본인 얼굴(VisionStory) Q&A 렌더가 무조건 실패했다.

수정:
- ORM 이 실제로 보내는 라벨(소문자 ``avatar_qa``)을 enum 에 추가한다. 0058 이 추가한
  대문자 ``AVATAR_QA`` 는 미사용 라벨로 남지만 무해하다.

멱등: ``ADD VALUE IF NOT EXISTS`` 로 재적용 안전(0058 적용 여부와 무관하게 동작).
다운그레이드: PostgreSQL 은 enum 값 제거 미지원 → no-op.
SQLite(테스트)는 SAEnum 이 VARCHAR+CHECK 라 모델 정의만으로 반영되어 본 DDL 불필요.

후속(이 핫픽스 범위 밖, 점검 권장): ``costcategory`` 의 기존 라벨이 대문자
(``LLM_QA`` …)인지 소문자인지 ``SELECT enumlabel FROM pg_enum WHERE enumtypid =
'costcategory'::regtype`` 로 확인하라. 기존 라벨이 대문자라면 다른 카테고리
(llm_qa·stt·tts …)의 적재/집계도 같은 이름/값 불일치로 깨져 있을 수 있으므로,
모델에 ``values_callable`` 을 주어 값을 보내게 하거나 enum 라벨을 소문자로 통일하는
정합화가 필요하다.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "0063"
down_revision: Union[str, None] = "0062"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        # PG 12+ 는 트랜잭션 안에서 ADD VALUE 가능(같은 트랜잭션에서 사용만 안 하면 됨).
        op.execute("ALTER TYPE costcategory ADD VALUE IF NOT EXISTS 'avatar_qa'")


def downgrade() -> None:
    # PostgreSQL 은 enum 값 제거 미지원 — no-op(미사용 라벨로 남겨 둠).
    pass
