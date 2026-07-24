"""금액(cost_usd) 컬럼이 Numeric(12,6) 인지 회귀 검증.

float 저장은 다수 행 SUM(운영자 비용 대시보드·예산 브레이커)에서 이진 표현
반올림 오차가 누적된다. Numeric 저장 + numeric SUM 은 정확하다. 누가 실수로
Float 로 되돌리면 이 테스트가 막는다. 모델 메타데이터만 보므로 DB 무관.
"""
from __future__ import annotations

import sqlalchemy as sa

from app.models.cost_log import CostLog
from app.models.qa_log import QALog
from app.models.video_render import RenderCostLog


def test_cost_usd_columns_are_numeric_not_float():
    for model in (CostLog, QALog, RenderCostLog):
        col = model.__table__.c.cost_usd
        # SQLAlchemy 에서 Float 는 Numeric 의 서브클래스이므로, "Float 가 아님" 으로
        # 순수 Numeric 을 구분한다.
        assert not isinstance(col.type, sa.Float), (
            f"{model.__tablename__}.cost_usd 가 Float 로 되돌아갔다 — Numeric 유지 필요"
        )
        assert isinstance(col.type, sa.Numeric)
        assert col.type.scale == 6
        # 읽기는 float 를 돌려줘 기존 계산/직렬화와 호환(Decimal/float 혼용 방지).
        assert col.type.asdecimal is False
