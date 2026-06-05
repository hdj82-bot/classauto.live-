"""상호작용 데이터 → 대면수업 솔루션 보고서 (RQ2 핵심 합성 계층).

docs/planning/09-beta-program.md §3·§10, 10-research-data-model.md(G1·G8),
11-analytics-dashboard.md §H·§5 의 "집계 → Claude 요약·권고 → class_briefings"
파이프라인을 구현한다.

- ``models``  : watch_events / slide_engagement / class_briefings (Base 등록)
- ``aggregator``: 강의별 상호작용 데이터 집계(취약 개념·재시청·딴짓·완주)
- ``briefing`` : Claude 경량 합성 + 비용 가드레일 + 캐시(class_briefings)

이 패키지를 임포트하면 신규 ORM 모델이 ``Base.metadata`` 에 등록된다(라우터가
서비스를 임포트 → 모델 임포트). Alembic 은 0039 마이그레이션이 직접 정의한다.
"""
from app.services.insights import models  # noqa: F401  (Base 등록 보장)

__all__ = ["models"]
