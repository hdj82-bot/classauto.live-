"""렌더 파이프라인 보안/idempotency 단위 테스트 (Critical 7, 8).

대상:
- ``app.tasks.render.render_slide``: instructor 소유권 검증 + 단계별 idempotent skip
- ``app.services.pipeline.cost_log.record_once``: (render_id, operation) 중복 차단
"""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch


# ── Critical 7: instructor 소유권 검증 ──────────────────────────────────────


def _stub_render(instructor_id: uuid.UUID, **overrides):
    render = MagicMock()
    render.id = overrides.get("id", uuid.uuid4())
    render.instructor_id = instructor_id
    render.audio_url = overrides.get("audio_url")
    render.heygen_job_id = overrides.get("heygen_job_id")
    render.avatar_id = overrides.get("avatar_id", "av-1")
    render.lecture_id = overrides.get("lecture_id", uuid.uuid4())
    # Status 비교는 enum 동등성으로 처리
    from app.models.video_render import RenderStatus
    render.status = overrides.get("status", RenderStatus.pending)
    return render


def _patch_db_to_return(render):
    """SyncSessionLocal().query(VideoRender).filter(...).one() 가 render 를 반환하도록 패치."""
    db = MagicMock()
    chain = db.query.return_value.filter.return_value
    chain.one.return_value = render
    return db


def _apply_render_slide(render_id: str, script: str, caller_user_id: str | None):
    """bind=True Celery task — apply() 로 동기 실행."""
    from app.tasks import render as render_task

    return render_task.render_slide.apply(
        args=[render_id, script, caller_user_id],
    )


def _async_value(v):
    """asyncio.run(coro) 로 await 가능한 객체."""
    async def _coro():
        return v
    return _coro()


def test_render_slide_rejects_when_caller_user_id_mismatches():
    """caller_user_id != render.instructor_id → 즉시 종료, TTS/HeyGen 미호출."""
    from app.tasks import render as render_task

    real_owner = uuid.uuid4()
    impostor = uuid.uuid4()
    render = _stub_render(instructor_id=real_owner)
    db = _patch_db_to_return(render)

    with patch.object(render_task, "SyncSessionLocal", return_value=db), \
         patch("app.services.pipeline.tts.synthesize") as mock_tts, \
         patch("app.services.pipeline.heygen.create_video") as mock_heygen, \
         patch("app.services.pipeline.s3.upload_audio_bytes") as mock_s3_audio:
        outcome = _apply_render_slide(str(render.id), "안녕하세요", str(impostor))

    result = outcome.get(propagate=True)
    assert result["status"] == "REJECTED_OWNERSHIP_MISMATCH"
    mock_tts.assert_not_called()
    mock_heygen.assert_not_called()
    mock_s3_audio.assert_not_called()


def test_render_slide_passes_when_caller_user_id_matches():
    """caller_user_id == render.instructor_id → 정상 진행(TTS만, HeyGen 미호출)."""
    from app.tasks import render as render_task
    from app.services.pipeline.tts import TTSResult

    owner = uuid.uuid4()
    render = _stub_render(instructor_id=owner)
    db = _patch_db_to_return(render)

    tts_result = TTSResult(
        audio_bytes=b"audio", provider="elevenlabs", duration_seconds=3.0,
    )

    with patch.object(render_task, "SyncSessionLocal", return_value=db), \
         patch("app.services.pipeline.tts.synthesize", new_callable=AsyncMock) as mock_tts, \
         patch("app.services.pipeline.heygen.create_video", new_callable=AsyncMock) as mock_heygen, \
         patch("app.services.pipeline.s3.upload_audio_bytes", return_value="https://s3/x.mp3"), \
         patch("app.services.pipeline.s3.file_exists", return_value=False), \
         patch("app.services.pipeline.cost_log.record_once_committed", return_value=True) as mock_cost:
        mock_tts.return_value = tts_result

        outcome = _apply_render_slide(str(render.id), "안녕", str(owner))
        result = outcome.get(propagate=True)

    # 본문은 TTS만 — HeyGen 호출 없이 ready 로 끝난다.
    assert result["status"] == "ready"
    assert result.get("audio_url") == "https://s3/x.mp3"
    mock_tts.assert_called_once()
    mock_heygen.assert_not_called()
    # TTS 비용은 별도 트랜잭션으로 1회 기록 (HeyGen submit 비용 제거됨).
    assert mock_cost.call_count >= 1


# ── Critical 8: idempotency ─────────────────────────────────────────────────


def test_render_slide_skips_entirely_when_already_ready():
    """이미 ready + audio_url → 전체 skip, TTS 미호출."""
    from app.tasks import render as render_task
    from app.models.video_render import RenderStatus

    owner = uuid.uuid4()
    render = _stub_render(
        instructor_id=owner,
        status=RenderStatus.ready,
        audio_url="https://s3/x.mp3",
    )
    db = _patch_db_to_return(render)

    with patch.object(render_task, "SyncSessionLocal", return_value=db), \
         patch("app.services.pipeline.tts.synthesize") as mock_tts:
        outcome = _apply_render_slide(str(render.id), "안녕", str(owner))
        result = outcome.get(propagate=True)

    assert result["status"] == "ready"
    assert result.get("skipped") is True
    mock_tts.assert_not_called()


def test_render_slide_skips_tts_when_audio_already_in_s3():
    """audio_url 있고 S3 객체도 존재 → TTS 호출 skip, 곧바로 ready (HeyGen 미사용)."""
    from app.tasks import render as render_task

    owner = uuid.uuid4()
    render = _stub_render(
        instructor_id=owner,
        audio_url="https://s3/audio.mp3",
    )
    db = _patch_db_to_return(render)

    with patch.object(render_task, "SyncSessionLocal", return_value=db), \
         patch("app.services.pipeline.tts.synthesize", new_callable=AsyncMock) as mock_tts, \
         patch("app.services.pipeline.s3.file_exists", return_value=True), \
         patch("app.services.pipeline.heygen.create_video", new_callable=AsyncMock) as mock_heygen, \
         patch("app.services.pipeline.cost_log.record_once_committed"):
        outcome = _apply_render_slide(str(render.id), "스킵", str(owner))
        result = outcome.get(propagate=True)

    assert result["status"] == "ready"
    mock_tts.assert_not_called()   # ← 핵심: TTS 비용 절감
    mock_heygen.assert_not_called()  # 본문은 HeyGen 미사용


# ── cost_log.record_once ────────────────────────────────────────────────────


class TestRecordOnce:
    def _db_with_existing(self, exists: bool):
        db = MagicMock()
        result = MagicMock()
        if exists:
            result.first.return_value = (uuid.uuid4(),)
        else:
            result.first.return_value = None
        db.execute.return_value = result
        db.add = MagicMock()
        db.flush = MagicMock()
        return db

    def test_record_once_skips_when_existing(self):
        from app.services.pipeline import cost_log

        db = self._db_with_existing(exists=True)
        result = cost_log.record_once(
            db=db,
            video_render_id=uuid.uuid4(),
            service="elevenlabs",
            operation="tts_synthesize",
            cost_usd=0.20,
        )
        assert result is None
        db.add.assert_not_called()

    def test_record_once_inserts_when_absent(self):
        from app.services.pipeline import cost_log

        db = self._db_with_existing(exists=False)
        result = cost_log.record_once(
            db=db,
            video_render_id=uuid.uuid4(),
            service="heygen",
            operation="heygen_submit",
            cost_usd=0.50,
        )
        assert result is not None
        db.add.assert_called_once()
        db.flush.assert_called_once()
