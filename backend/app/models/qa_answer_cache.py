"""QAAnswerCache 모델 — 아바타 Q&A 클러스터 답변 캐시 (docs/planning/08 §5)."""
import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.embedding import EMBEDDING_DIMENSIONS


class QAAnswerCache(Base):
    """학생 질문 → (야간 배치) 아바타 클립 캐시.

    실시간 HeyGen 렌더는 금지(지연 → 학습자 이탈). 질문은 항상 즉시 RAG 텍스트로
    답하고, 이 테이블은 "겹치는 질문에만 사전 렌더된 아바타 클립을 즉시 제공"하기
    위한 캐시다. 미적중 질문은 status=pending 으로 적립돼, 야간 배치가 임베딩
    클러스터링 후 상위 클러스터만 대표 질문으로 렌더한다.

    status 전이: pending → rendering → ready | failed.
    - pending:   적립된 질문(아직 렌더 대상 아님 / 클러스터 대기).
    - rendering: 야간 배치가 HeyGen 제출(대표 행만 heygen_job_id 보유).
    - ready:     클립 S3 이전 완료 — API 가 즉시 제공.
    - failed:    렌더 실패.

    클러스터 형제(같은 cluster_key)는 대표 행 1개만 HeyGen 으로 렌더하고, 완료
    시 같은 s3_video_url 을 공유한다(형제 행의 heygen_job_id 는 NULL).
    """
    __tablename__ = "qa_answer_cache"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    lecture_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("lectures.id", ondelete="CASCADE"), nullable=False, index=True
    )
    instructor_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # 원 질문(투명성 — 캐시 답변은 원 질문과 함께 표시: 08 §5.4) + 임베딩(유사도 캐시).
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    # pgvector 컬럼은 SlideEmbedding 과 동일하게 Column 으로 선언(타입드 Mapped 미사용).
    question_embedding = Column(Vector(EMBEDDING_DIMENSIONS), nullable=True)
    # 적립 시점의 RAG 텍스트 답변 — 배치가 대표 질문 클립의 TTS 원고로 재사용.
    answer_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 야간 배치가 부여하는 클러스터 식별자(같은 cluster_key = 같은 클립 공유).
    cluster_key: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending", index=True
    )
    # 대표 행만 heygen_job_id 를 가진다(형제 행은 NULL — UNIQUE 가 다중 NULL 허용).
    heygen_job_id: Mapped[str | None] = mapped_column(String(255), unique=True, index=True)
    s3_video_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 캐시 적중 횟수(질문 겹침 측정 — 클러스터 대표 선정·투명성).
    hit_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
