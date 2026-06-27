"""C3 — 익명 사용자 RAG 비용 증폭 차단 단위 테스트.

세 갈래를 검증한다(외부 호출 0, 로컬 DB 불필요 — sync SQLite + mock):
- (a) X-Forwarded-For 파싱: 레이트리밋 키가 클라 위조 가능한 leftmost 가 아니라 신뢰
      프록시가 덧붙인 마지막 홉을 쓴다(middleware._extract_client_id).
- (b) 스크립트 세그먼트 임베딩을 1회 저장(store)하고, retriever 가 저장분 조회/폴백을
      올바르게 가른다(search_similar_script).
- (c) 공개(/qa/public) 익명 경로의 강의별 일일 하드 캡.
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.services.pipeline import qa as qa_svc
from app.services.pipeline import retriever as retr_svc
from app.services.pipeline.qa import answer_question
from app.services.pipeline.retriever import RetrievalResult


# ──────────────────────────────────────────────────────────────────────────────
# (a) X-Forwarded-For 파싱 — 마지막(신뢰 프록시) 홉 사용
# ──────────────────────────────────────────────────────────────────────────────

from app.core.middleware import _client_ip_from_forwarded, _extract_client_id


def test_xff_uses_last_trusted_hop_not_forged_leftmost():
    # 클라가 leftmost 를 위조해도 신뢰 프록시(rightmost)가 덧붙인 실제 IP 를 쓴다.
    assert _client_ip_from_forwarded("1.1.1.1, 203.0.113.7") == "203.0.113.7"
    # 단일 항목(프록시가 본 실제 클라)이면 그대로.
    assert _client_ip_from_forwarded("203.0.113.7") == "203.0.113.7"
    # 공백·빈 항목은 무시.
    assert _client_ip_from_forwarded(" , 9.9.9.9 ") == "9.9.9.9"
    # 빈 헤더 → None (호출부가 request.client.host 로 폴백).
    assert _client_ip_from_forwarded("") is None
    assert _client_ip_from_forwarded("   ") is None


def _fake_request(headers: dict, client_host: str | None = None):
    client = SimpleNamespace(host=client_host) if client_host else None
    return SimpleNamespace(headers=headers, client=client)


def test_extract_client_id_prefers_last_xff_hop():
    req = _fake_request({"X-Forwarded-For": "1.2.3.4, 203.0.113.7"}, client_host="10.0.0.1")
    # leftmost(1.2.3.4) 위조분이 아니라 마지막 홉을 키로 잡아야 우회가 막힌다.
    assert _extract_client_id(req) == "ip:203.0.113.7"


def test_extract_client_id_forged_leftmost_does_not_change_key():
    # 같은 클라(같은 마지막 홉)가 leftmost 만 매번 바꿔도 레이트리밋 키는 동일해야 한다.
    r1 = _fake_request({"X-Forwarded-For": "9.9.9.9, 203.0.113.7"})
    r2 = _fake_request({"X-Forwarded-For": "8.8.8.8, 203.0.113.7"})
    assert _extract_client_id(r1) == _extract_client_id(r2) == "ip:203.0.113.7"


def test_extract_client_id_falls_back_to_peer_without_xff():
    req = _fake_request({}, client_host="198.51.100.5")
    assert _extract_client_id(req) == "ip:198.51.100.5"

    req_none = _fake_request({})
    assert _extract_client_id(req_none) == "ip:unknown"


# ──────────────────────────────────────────────────────────────────────────────
# (b) 스크립트 세그먼트 임베딩 — 1회 저장 + 저장분 조회/폴백
# ──────────────────────────────────────────────────────────────────────────────


class TestStoreScriptSegmentEmbeddings:
    @patch("app.services.pipeline.embedding.get_embeddings")
    def test_stores_non_empty_segments_and_dedupes_existing(self, mock_get_emb):
        from app.services.pipeline.embedding import store_script_segment_embeddings

        db = MagicMock()
        fake = [0.1] * 1536
        mock_get_emb.return_value = [fake, fake]

        n = store_script_segment_embeddings(
            db, "task-1", [(1, "첫 세그먼트"), (2, "  "), (3, "셋째 세그먼트")]
        )

        assert n == 2  # 공백 세그먼트는 제외
        # 멱등 — 기존 행 삭제 후 재삽입
        db.query.return_value.filter.return_value.delete.assert_called_once()
        db.add_all.assert_called_once()
        records = db.add_all.call_args[0][0]
        assert [r.slide_number for r in records] == [1, 3]
        assert records[0].task_id == "task-1"
        # 임베딩 호출은 1회(전체 세그먼트 배치) — 질문당 재임베딩이 아니다.
        mock_get_emb.assert_called_once()

    @patch("app.services.pipeline.embedding.get_embeddings")
    def test_empty_segments_returns_zero_without_embedding(self, mock_get_emb):
        from app.services.pipeline.embedding import store_script_segment_embeddings

        db = MagicMock()
        n = store_script_segment_embeddings(db, "task-1", [(1, "   "), (2, "")])
        assert n == 0
        mock_get_emb.assert_not_called()
        # 재생성으로 비어도 과거 저장분은 정리한다.
        db.query.return_value.filter.return_value.delete.assert_called_once()


def _row(slide: int, text: str, sim: float):
    return SimpleNamespace(slide_number=slide, text_content=text, similarity=sim)


class TestSearchSimilarScript:
    @patch.object(retr_svc, "get_embeddings", return_value=[[0.1, 0.2, 0.3]])
    def test_uses_stored_embeddings_when_present(self, _mock_emb):
        db = MagicMock()
        db.execute.return_value.fetchall.return_value = [
            _row(1, "발화 1", 0.82), _row(2, "발화 2", 0.55),
        ]
        results = retr_svc.search_similar_script(db, "task-1", "질문?")
        assert [r.slide_number for r in results] == [1, 2]
        assert results[0].similarity == pytest.approx(0.82)
        # 저장분이 있으면 on-the-fly 폴백(_script_segments_for_task)을 타지 않는다.

    @patch.object(retr_svc, "_script_segments_for_task")
    @patch.object(retr_svc, "get_embeddings")
    def test_falls_back_on_the_fly_when_no_stored_rows(self, mock_emb, mock_segs):
        # 질문 임베딩 1회 + 세그먼트 임베딩 1회. 저장분 조회는 빈 결과 → 폴백.
        mock_emb.side_effect = [[[0.1, 0.0, 0.0]], [[0.1, 0.0, 0.0]]]
        db = MagicMock()
        db.execute.return_value.fetchall.return_value = []  # 저장분 없음
        mock_segs.return_value = [(1, "폴백 세그먼트")]

        results = retr_svc.search_similar_script(db, "task-old", "질문?")

        mock_segs.assert_called_once()  # 폴백 경로 진입
        assert len(results) == 1
        assert results[0].slide_number == 1

    @patch.object(retr_svc, "_script_segments_for_task", return_value=[(1, "폴백")])
    @patch.object(retr_svc, "get_embeddings")
    def test_falls_back_when_pgvector_query_raises(self, mock_emb, _mock_segs):
        # pgvector 미지원(SQLite 등)에서 조회가 던지면 on-the-fly 로 폴백한다.
        mock_emb.side_effect = [[[0.1, 0.0, 0.0]], [[0.1, 0.0, 0.0]]]
        db = MagicMock()
        db.execute.side_effect = RuntimeError("no vector operator")

        results = retr_svc.search_similar_script(db, "task-x", "질문?")
        assert len(results) == 1
        assert results[0].slide_number == 1


# ──────────────────────────────────────────────────────────────────────────────
# (c) 공개(익명) Q&A 강의별 일일 하드 캡
# ──────────────────────────────────────────────────────────────────────────────


@pytest.fixture
def sync_session():
    """카운터 테이블만 생성한 동기 SQLite 세션(JSONB/Vector 회피).

    answer_question·_public_qa_within_daily_cap 은 동기 Session 으로 동작하므로,
    PublicQADailyCount 테이블 하나만 만들어 실제 commit/조회 흐름을 검증한다.
    """
    from app.models.embedding import PublicQADailyCount

    engine = create_engine("sqlite://")
    PublicQADailyCount.__table__.create(engine)
    Session = sessionmaker(bind=engine)
    sess = Session()
    try:
        yield sess
    finally:
        sess.close()
        engine.dispose()


def _fake_qa_resp(text: str = "답변입니다."):
    block = MagicMock()
    block.type = "text"
    block.text = text
    resp = MagicMock()
    resp.content = [block]
    resp.usage.input_tokens = 10
    resp.usage.output_tokens = 5
    return resp


def test_public_within_daily_cap_increments_then_blocks(sync_session, monkeypatch):
    monkeypatch.setattr(qa_svc, "PUBLIC_QA_DAILY_CAP", 2)
    from app.services.pipeline.qa import _public_qa_within_daily_cap

    assert _public_qa_within_daily_cap(sync_session, "task-1") is True   # 1
    assert _public_qa_within_daily_cap(sync_session, "task-1") is True   # 2
    assert _public_qa_within_daily_cap(sync_session, "task-1") is False  # 캡 초과
    # 다른 강의는 독립 카운터.
    assert _public_qa_within_daily_cap(sync_session, "task-2") is True


def test_public_qa_blocked_after_cap_skips_claude(sync_session, monkeypatch):
    monkeypatch.setattr(qa_svc, "PUBLIC_QA_DAILY_CAP", 1)

    with patch.object(qa_svc, "search_similar_script", return_value=[
        RetrievalResult(slide_number=1, text_content="발화", similarity=0.9),
    ]), patch("anthropic.Anthropic") as anthropic_cls, \
         patch.object(qa_svc, "_claude_qa_call", return_value=_fake_qa_resp()) as call:
        # 1번째: 캡 이내 → 정상 답변(Claude 호출).
        r1 = answer_question(sync_session, "task-1", "public", "질문1")
        # 2번째: 캡 초과 → Claude 미호출·비용 0·안내 메시지.
        r2 = answer_question(sync_session, "task-1", "public", "질문2")

    assert r1.in_scope is True
    assert r2.in_scope is False
    assert r2.answer == qa_svc.PUBLIC_QA_CAP_MESSAGE
    assert r2.cost_usd == 0.0
    call.assert_called_once()        # 2번째는 Claude 를 부르지 않았다.
    anthropic_cls.assert_called_once()


def test_non_public_session_does_not_touch_cap(sync_session, monkeypatch):
    monkeypatch.setattr(qa_svc, "PUBLIC_QA_DAILY_CAP", 1)
    from app.models.embedding import PublicQADailyCount

    with patch.object(qa_svc, "search_similar_script", return_value=[
        RetrievalResult(slide_number=1, text_content="발화", similarity=0.9),
    ]), patch("anthropic.Anthropic"), \
         patch.object(qa_svc, "_claude_qa_call", return_value=_fake_qa_resp()):
        # 학생/미리보기 세션(session_id != "public")은 캡 카운터를 건드리지 않는다.
        answer_question(sync_session, "task-1", "sess-1", "질문")
        answer_question(sync_session, "task-1", "preview-abc", "질문")

    assert sync_session.query(PublicQADailyCount).count() == 0
