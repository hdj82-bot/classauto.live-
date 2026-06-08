"""아바타 Q&A 캐시 — 유사도 캐시 조회 + 클러스터링 (docs/planning/08 §5).

[확정 결정] HeyGen 은 오직 Q&A 캐시 답변에만 쓴다. 원칙:
- 질문 즉시 RAG 텍스트 답변(이 모듈 밖, pipeline/qa.py).
- 겹치는(임베딩 유사도 0.9↑) 질문만 사전 렌더된 아바타 클립을 캐시에서 즉시 제공.
- 새 질문은 텍스트만 + 클러스터 큐(status=pending)에 적립.
- 실시간 HeyGen 렌더 **절대 금지** — 렌더는 야간 배치(tasks/qa_batch.py)만 수행.

이 모듈의 책임:
1. ``find_ready_avatar`` — 질문 임베딩으로 status=ready 캐시에서 유사도 0.9↑ 클립 조회.
2. ``accrue_pending`` — 미적중 질문을 status=pending 으로 적립.
3. ``resolve_avatar_for_question`` — API(계약 B) 진입점: 적중→avatar, 미적중→적립+None.
4. ``cluster_pending`` / ``cosine_similarity`` — 야간 배치 클러스터링용 순수 헬퍼.
"""
from __future__ import annotations

import logging
import math
from dataclasses import dataclass

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.qa_answer_cache import QAAnswerCache
from app.services.pipeline.embedding import get_embeddings

logger = logging.getLogger(__name__)

STATUS_PENDING = "pending"
STATUS_RENDERING = "rendering"
STATUS_READY = "ready"
STATUS_FAILED = "failed"

# 행 출처 — origin 컬럼 값.
ORIGIN_STUDENT = "student"          # 학생 미적중 질문 적립(야간 배치 클러스터 큐).
ORIGIN_SEED = "instructor_seed"     # 교수자 사전 등록 예상 질문(생성 시 즉시 렌더).

# 교수자가 영상당 등록할 수 있는 사전 질문 최대 개수(= 영상당 렌더 한도와 동일).
SEED_QUESTIONS_MAX = settings.QA_AVATAR_TOP_CLUSTERS


# ── 임베딩 ────────────────────────────────────────────────────────────────────


def embed_question(question: str) -> list[float] | None:
    """질문 텍스트 1건을 임베딩. 실패하면 None (텍스트 답변 흐름은 절대 막지 않는다)."""
    try:
        vecs = get_embeddings([question])
    except Exception as exc:  # noqa: BLE001
        logger.warning("Q&A 아바타 임베딩 실패 (텍스트 답변은 계속): %s", exc)
        return None
    return list(vecs[0]) if vecs else None


def _to_list(embedding) -> list[float]:
    """pgvector readback(ndarray) / list 를 일관되게 list[float] 로."""
    if embedding is None:
        return []
    return [float(x) for x in embedding]


def cosine_similarity(a, b) -> float:
    """코사인 유사도. 어느 한쪽이 비었으면 0.0."""
    av, bv = _to_list(a), _to_list(b)
    if not av or not bv or len(av) != len(bv):
        return 0.0
    dot = sum(x * y for x, y in zip(av, bv))
    na = math.sqrt(sum(x * x for x in av))
    nb = math.sqrt(sum(y * y for y in bv))
    if na == 0.0 or nb == 0.0:
        return 0.0
    return dot / (na * nb)


# ── 캐시 조회 ─────────────────────────────────────────────────────────────────


def find_ready_avatar(
    db: Session,
    lecture_id,
    embedding: list[float],
    *,
    threshold: float | None = None,
) -> QAAnswerCache | None:
    """질문 임베딩으로 status=ready 캐시에서 유사도 ``threshold`` 이상 클립 1건 조회.

    1차로 pgvector 코사인(``<=>``)으로 최근접 1건을 가져와 임계값을 검사한다.
    pgvector 미지원 환경(SQLite 테스트 등)은 OperationalError 가 나므로, 해당
    강의의 ready 행을 적재해 파이썬 코사인으로 폴백한다(ready 행은 강의당 소수).
    """
    thr = settings.QA_AVATAR_SIMILARITY_THRESHOLD if threshold is None else threshold
    if not embedding:
        return None

    vec_str = "[" + ",".join(str(v) for v in embedding) + "]"
    try:
        row = db.execute(
            text(
                """
                SELECT id, 1 - (question_embedding <=> :vec::vector) AS similarity
                FROM qa_answer_cache
                WHERE lecture_id = :lecture_id
                  AND status = 'ready'
                  AND s3_video_url IS NOT NULL
                  AND question_embedding IS NOT NULL
                ORDER BY question_embedding <=> :vec::vector
                LIMIT 1
                """
            ),
            {"vec": vec_str, "lecture_id": str(lecture_id)},
        ).fetchone()
        if row is None or float(row.similarity) < thr:
            return None
        return db.get(QAAnswerCache, row.id)
    except Exception as exc:  # noqa: BLE001 — pgvector 미지원/쿼리 오류 → 파이썬 폴백
        logger.debug("pgvector 캐시 조회 폴백(파이썬 코사인): %s", exc)

    candidates = db.execute(
        select(QAAnswerCache).where(
            QAAnswerCache.lecture_id == lecture_id,
            QAAnswerCache.status == STATUS_READY,
            QAAnswerCache.s3_video_url.isnot(None),
        )
    ).scalars().all()
    best: QAAnswerCache | None = None
    best_sim = thr
    for c in candidates:
        sim = cosine_similarity(embedding, c.question_embedding)
        if sim >= best_sim:
            best, best_sim = c, sim
    return best


def accrue_pending(
    db: Session,
    lecture_id,
    instructor_id,
    question: str,
    answer: str | None,
    embedding: list[float] | None,
) -> QAAnswerCache:
    """미적중 질문을 status=pending 으로 적립(야간 배치 클러스터 큐). 행을 반환."""
    row = QAAnswerCache(
        lecture_id=lecture_id,
        instructor_id=instructor_id,
        question_text=question,
        answer_text=answer,
        question_embedding=embedding,
        status=STATUS_PENDING,
        origin=ORIGIN_STUDENT,
    )
    db.add(row)
    db.flush()
    return row


# ── 교수자 사전 질문(instructor_seed) ─────────────────────────────────────────
#
# 첫 영상처럼 학생 질문 축적이 없을 때, 교수자가 영상당 ≤3개의 예상 질문을 미리
# 등록한다. 등록만 하면 status=pending·origin=instructor_seed 행으로 쌓이고, 영상
# 생성(approve) 시 즉시 렌더(tasks/qa_batch.py)되어 첫 학생 질문부터 아바타 답변이
# 나온다. 매칭/재생은 기존 resolve_avatar_for_question(유사도 0.9↑)이 그대로 처리.


def _normalize_seed_questions(
    items: list[tuple[str, str]],
) -> list[tuple[str, str]]:
    """(질문, 답변) 목록 정규화: 질문 trim·빈 질문 제외·질문 기준 중복 제거 → 최대 N.

    답변도 trim 한다(빈 답변은 ""로 두고, 렌더 시 RAG 폴백 신호로 쓴다). 입력 순서를
    유지하며, 같은 질문이 중복되면 첫 항목만 남긴다.
    """
    seen: set[str] = set()
    cleaned: list[tuple[str, str]] = []
    for q, a in items:
        qt = (q or "").strip()
        at = (a or "").strip()
        if not qt or qt in seen:
            continue
        seen.add(qt)
        cleaned.append((qt, at))
    return cleaned[:SEED_QUESTIONS_MAX]


def list_seed_questions(db: Session, lecture_id) -> list[QAAnswerCache]:
    """해당 강의의 교수자 사전 질문(instructor_seed) 행을 결정적 순서로 반환.

    created_at 만으로는 정렬이 흔들린다 — Postgres ``now()`` 는 트랜잭션 단위라 같은
    PUT 으로 함께 insert 된 행들의 created_at 이 모두 동일하기 때문. ``id`` 를 보조
    정렬키로 둬 재조회 시에도 안정적인 순서를 보장한다(입력 순서와 일치하지는 않음).
    """
    return (
        db.execute(
            select(QAAnswerCache)
            .where(
                QAAnswerCache.lecture_id == lecture_id,
                QAAnswerCache.origin == ORIGIN_SEED,
            )
            .order_by(QAAnswerCache.created_at.asc(), QAAnswerCache.id.asc())
        )
        .scalars()
        .all()
    )


def _reset_for_rerender(row: QAAnswerCache, answer: str | None) -> None:
    """답변이 바뀐 행을 재렌더 대기 상태로 되돌린다(기존 클립·잡 폐기)."""
    row.answer_text = answer
    row.status = STATUS_PENDING
    row.s3_video_url = None
    row.heygen_job_id = None
    row.duration_seconds = None
    row.error_message = None
    row.cluster_key = None


def upsert_seed_questions(
    db: Session,
    lecture_id,
    instructor_id,
    items: list[tuple[str, str]],
) -> list[QAAnswerCache]:
    """교수자 사전 질문(+답변) 집합을 ``items`` 로 맞춘다(차집합 동기화). 현재 집합 반환.

    각 항목은 (질문, 답변) 튜플이다. 답변이 비면(``""``) 영상 생성 시 RAG 로 자동
    생성하므로 ``answer_text=None`` 으로 저장한다.

    - 정규화(질문 trim·빈 질문/중복 제거, 최대 ``SEED_QUESTIONS_MAX``) 후:
      · 같은 질문의 기존 행: 답변이 동일하면 그대로 보존(재렌더 없음 — 비용 절약),
        답변이 바뀌었으면 답변을 갱신하고 status=pending 으로 되돌려(클립·잡 폐기)
        다음 영상 생성 때 새 답변으로 다시 렌더한다.
      · 목록에서 빠진 행은 삭제.
      · 새 질문은 origin=instructor_seed, status=pending, embedding=None 으로 추가.
    - 학생 적립 행(origin=student)은 절대 건드리지 않는다.
    """
    wanted = _normalize_seed_questions(items)
    existing = list_seed_questions(db, lecture_id)
    by_text = {row.question_text: row for row in existing}

    # 빠진 질문 삭제.
    wanted_questions = {q for q, _ in wanted}
    for row in existing:
        if row.question_text not in wanted_questions:
            db.delete(row)

    for q, a in wanted:
        answer = a or None  # 빈 답변 → None(렌더 시 RAG 폴백)
        row = by_text.get(q)
        if row is not None:
            # 답변이 바뀌었을 때만 재렌더(텍스트 비교 — None/"" 동등 처리).
            if (row.answer_text or None) != answer:
                _reset_for_rerender(row, answer)
            continue
        db.add(
            QAAnswerCache(
                lecture_id=lecture_id,
                instructor_id=instructor_id,
                question_text=q,
                answer_text=answer,
                question_embedding=None,
                status=STATUS_PENDING,
                origin=ORIGIN_SEED,
            )
        )

    db.flush()
    return list_seed_questions(db, lecture_id)


# ── API(계약 B) 진입점 ────────────────────────────────────────────────────────


@dataclass
class AvatarResolution:
    """resolve_avatar_for_question 결과. ``payload`` 는 계약 B 의 avatar 필드."""
    payload: dict | None  # None = 미적중(텍스트만)
    cache_hit: bool


def resolve_avatar_for_question(
    db: Session,
    *,
    lecture_id,
    instructor_id,
    question: str,
    answer: str,
    in_scope: bool,
) -> AvatarResolution:
    """계약 B 의 ``avatar`` 필드를 결정한다.

    - 범위 밖 질문(in_scope=False)은 캐시·적립 모두 하지 않고 avatar=None.
    - 범위 안: 질문 임베딩으로 ready 캐시 조회.
        · 적중(유사도 0.9↑) → hit_count++ 후 avatar payload 반환.
        · 미적중 → status=pending 적립 후 avatar=None(텍스트만).
    실시간 렌더는 어떤 경우에도 트리거하지 않는다.
    """
    if not in_scope:
        return AvatarResolution(payload=None, cache_hit=False)

    embedding = embed_question(question)

    if embedding:
        hit = find_ready_avatar(db, lecture_id, embedding)
        if hit is not None:
            hit.hit_count = (hit.hit_count or 0) + 1
            db.flush()
            return AvatarResolution(
                payload={
                    "status": "ready",
                    "video_url": hit.s3_video_url,
                    "cache_id": str(hit.id),
                    # 투명성(09 §5.2) — 캐시 클립은 "이 학생의 질문"이 아니라 "비슷한
                    # 과거 질문"에 맞춰 렌더된 것이므로, 그 원 질문을 함께 내려보내
                    # 프론트가 "비슷한 질문에 대한 답변입니다: …"로 표기하게 한다.
                    "matched_question": hit.question_text,
                },
                cache_hit=True,
            )

    # 미적중 — 클러스터 큐에 적립(렌더는 야간 배치). 임베딩 실패해도 텍스트로 적립.
    accrue_pending(db, lecture_id, instructor_id, question, answer, embedding)
    return AvatarResolution(payload=None, cache_hit=False)


# ── 야간 배치 클러스터링 ──────────────────────────────────────────────────────


@dataclass
class Cluster:
    """임베딩 그리디 클러스터. ``members`` 는 QAAnswerCache 행 리스트."""
    members: list  # list[QAAnswerCache]
    centroid: list[float]

    @property
    def size(self) -> int:
        return len(self.members)

    def representative(self):
        """대표 질문 = hit_count 최다 → created_at 빠른 순."""
        return max(
            self.members,
            key=lambda r: ((r.hit_count or 0), -_ts(r)),
        )


def _ts(row) -> float:
    created = getattr(row, "created_at", None)
    try:
        return created.timestamp() if created is not None else 0.0
    except Exception:  # noqa: BLE001
        return 0.0


def cluster_pending(rows, *, threshold: float | None = None) -> list[Cluster]:
    """pending 행들을 임베딩 코사인 그리디 클러스터링.

    각 행을 가장 가까운(유사도 ≥ threshold) 기존 클러스터에 합치고, 없으면 새
    클러스터를 만든다. 임베딩이 없는 행은 단독 클러스터로 둔다(렌더 후보에서 자연히
    배제 — 대표 임베딩이 없으면 배치가 건너뜀). centroid 는 누적 평균.
    """
    thr = settings.QA_AVATAR_CLUSTER_THRESHOLD if threshold is None else threshold
    clusters: list[Cluster] = []
    for row in rows:
        emb = _to_list(getattr(row, "question_embedding", None))
        if not emb:
            clusters.append(Cluster(members=[row], centroid=[]))
            continue
        best: Cluster | None = None
        best_sim = thr
        for c in clusters:
            if not c.centroid:
                continue
            sim = cosine_similarity(emb, c.centroid)
            if sim >= best_sim:
                best, best_sim = c, sim
        if best is None:
            clusters.append(Cluster(members=[row], centroid=list(emb)))
        else:
            n = len(best.members)
            best.centroid = [
                (cv * n + ev) / (n + 1) for cv, ev in zip(best.centroid, emb)
            ]
            best.members.append(row)
    return clusters
