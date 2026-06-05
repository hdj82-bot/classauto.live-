"""인사이트 보고서 신규 ORM 모델 (docs/planning/10-research-data-model.md).

소유권 메모: ``app/models/`` 패키지는 본 작업창의 소유가 아니므로(read-only),
신규 연구 테이블 모델을 이 패키지 안에 정의한다. ``from app.db.base import Base``
로 같은 메타데이터에 등록되며, 라우터가 ``app.services.insights`` 를 임포트할 때
함께 로드된다. 스키마 생성은 Alembic 0039 가 직접(autogenerate 아님) 담당한다.

연구 스키마 정렬(09 §3 측정 항목):
- ``watch_events``      → "시청" 범주: play/pause/seek·구간 체류·재시청·완주(G1)
- ``slide_engagement``  → 위 이벤트의 야간/요청 롤업(재생 히트맵, G1)
- ``class_briefings``   → "교수자 루프" 범주: AI 대면수업 브리핑 저장(G8, 11 §H)

소급 수집 불가(09 §3) — 컬럼명을 데이터 모델 문서와 1:1로 맞춘다.
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    Enum as SAEnum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class WatchEventType(str, enum.Enum):
    """세그먼트 단위 재생 이벤트 종류 (10번 §3.1)."""

    play = "play"
    pause = "pause"
    seek = "seek"
    segment_enter = "segment_enter"
    segment_complete = "segment_complete"
    rewatch = "rewatch"
    speed_change = "speed_change"
    ended = "ended"


class WatchEvent(Base):
    """세그먼트(슬라이드) 단위 재생 이벤트 — append-only (10번 §3.1, G1).

    슬라이드쇼 플레이어(08 §4.1)가 자연 발생원. 클라이언트가 배치(10초/20건)로
    전송 → 단건 POST 폭주 방지. 재생 히트맵·이탈 분석·RQ1/RQ3의 1차 자료.
    """

    __tablename__ = "watch_events"
    __table_args__ = (
        Index("ix_watch_events_session_ts", "session_id", "server_ts"),
        Index("ix_watch_events_lecture_slide", "lecture_id", "slide_index"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("learning_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    lecture_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("lectures.id", ondelete="CASCADE"), nullable=False, index=True
    )
    event_type: Mapped[WatchEventType] = mapped_column(
        SAEnum(WatchEventType), nullable=False
    )
    # 세그먼트(슬라이드) 번호. seek/play 등 슬라이드 무관 이벤트는 NULL 가능.
    slide_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # 발생 시점 재생 위치(초).
    position_seconds: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    # seek 의 출발 위치(초).
    from_position_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    # speed_change 시의 배속.
    playback_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    # 클라이언트 시각(드리프트 분석) — 서버 시각은 server_ts.
    client_ts: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    server_ts: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    meta: Mapped[dict | None] = mapped_column(JSONB, nullable=True)


class SlideEngagement(Base):
    """watch_events 롤업 — 대시보드 재생 히트맵을 싸게 그린다 (10번 §3.2, G1).

    session_id 가 NULL 이면 강의 전체 집계행, 값이 있으면 학생별 행.
    ``rollup_slide_engagement`` 가 (lecture_id, slide_index, session_id=NULL)
    행을 upsert 한다. 보고서 생성 시 스냅샷으로 재현성을 확보한다.
    """

    __tablename__ = "slide_engagement"
    __table_args__ = (
        UniqueConstraint(
            "lecture_id", "slide_index", "session_id", name="uq_slide_engagement_scope"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    lecture_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("lectures.id", ondelete="CASCADE"), nullable=False, index=True
    )
    slide_index: Mapped[int] = mapped_column(Integer, nullable=False)
    # NULL = 강의 전체 집계행. 값 = 학생별 행.
    session_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("learning_sessions.id", ondelete="CASCADE"), nullable=True
    )
    dwell_seconds: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    rewatch_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    drop_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    avg_completion_pct: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    rolled_up_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ClassBriefing(Base):
    """AI 대면 수업 브리핑 저장소 (10번 §3.10, G8 · 11 §H·§5).

    강의×주 1회 Claude 호출(저비용)의 산출물을 JSONB 로 보관한다. ``source_window``
    에 집계 대상 기간·필터를 적어 재현성을 확보하고(11 §5), ``model`` 로 생성
    모델·버전을 남긴다. 같은 강의의 최신 행이 보고서 GET 의 캐시 역할을 한다.
    """

    __tablename__ = "class_briefings"
    __table_args__ = (
        Index("ix_class_briefings_lecture_generated", "lecture_id", "generated_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    lecture_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("lectures.id", ondelete="CASCADE"), nullable=False, index=True
    )
    course_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), nullable=True
    )
    week_no: Mapped[int | None] = mapped_column(Integer, nullable=True)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    # summary[] / weak_concepts[] / recommendations[] / class_vs_individual 구조화 페이로드.
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    # 생성 모델·버전 (예: "claude-haiku-4-5" 또는 "rule-based-mock").
    model: Mapped[str] = mapped_column(String(40), nullable=False)
    # 집계 대상 기간·필터(재현성) — {generated_for, totals, source_counts...}.
    source_window: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
