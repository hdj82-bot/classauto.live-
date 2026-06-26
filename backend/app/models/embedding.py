"""SlideEmbedding 모델 (app/ embedding 흡수)."""

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Column,
    Date,
    DateTime,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)

from app.db.base import Base

EMBEDDING_DIMENSIONS = 1536  # OpenAI text-embedding-3-small


class SlideEmbedding(Base):
    __tablename__ = "slide_embeddings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    task_id = Column(String(64), nullable=False, index=True)
    slide_number = Column(Integer, nullable=False)
    text_content = Column(Text, nullable=False)
    embedding = Column(Vector(EMBEDDING_DIMENSIONS), nullable=False)
    # PPTX 를 LibreOffice 헤드리스로 렌더한 슬라이드 PNG 의 S3 https URL.
    # studio 편집기가 중앙 미리보기에서 ``<img>`` 로 직접 노출. 렌더 실패 시 NULL —
    # 파이프라인은 graceful 하게 진행되고 프론트는 fallback mock 으로 그린다.
    slide_image_url = Column(String(1024), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ScriptSegmentEmbedding(Base):
    """생성된 강의 스크립트(교수자 발화 텍스트) 세그먼트의 임베딩.

    슬라이드 임베딩(``slide_embeddings``)은 PPT 텍스트를 step2 에서 저장하지만,
    발화 스크립트는 step3 에서야 만들어져 ``slide_embeddings`` 에 없다. 종전 retriever
    는 학생 질문마다 강의의 **전체 스크립트 세그먼트를 OpenAI 로 재임베딩**해(질문당 수십
    개) 익명 폭주 시 비용이 증폭됐다(C3-b). 파이프라인 step3 에서 세그먼트를 **1회**
    임베딩해 여기 저장하고, retriever 는 질문 임베딩 1회 + pgvector 조회로 답한다. 저장분이
    없는 구 강의는 retriever 가 on-the-fly 임베딩으로 폴백한다.

    ``slide_number`` 는 retriever/_script_segments_for_task 와 동일하게 1-based
    (segment.slide_index + 1). 검색 키는 ``task_id``(= lecture.pipeline_task_id).
    """

    __tablename__ = "script_segment_embeddings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    task_id = Column(String(64), nullable=False, index=True)
    slide_number = Column(Integer, nullable=False)
    text_content = Column(Text, nullable=False)
    embedding = Column(Vector(EMBEDDING_DIMENSIONS), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PublicQADailyCount(Base):
    """공개(/qa/public) 익명 Q&A 의 강의별·일자별 호출 카운터.

    전역 RateLimitMiddleware(IP 당 분당) 위에 두는 2차 방어선(C3-c). 익명 시청자 다수가
    각자 레이트리밋 한도 안에서 질문해도 강의 1개에 누적되는 일일 Claude 호출 총량을
    하드 캡으로 막아 비용 폭주를 차단한다. ``task_id``(= lecture.pipeline_task_id)와
    UTC 일자 단위로 1행을 두고 호출 시 증가시킨다.
    """

    __tablename__ = "public_qa_daily_counts"
    __table_args__ = (
        UniqueConstraint("task_id", "day", name="uq_public_qa_daily_task_day"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    task_id = Column(String(64), nullable=False, index=True)
    day = Column(Date, nullable=False)
    count = Column(Integer, nullable=False, default=0, server_default="0")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
