"""H2(중복 렌더 원자적 claim) · M7(TTS 글자수 캡) 단위 테스트.

대상: ``app.tasks.render.render_slide``
- H2: HeyGen 제출 직전 FOR UPDATE claim — 잠금 대기 중 다른 실행이 이미 제출했으면
  create_video 를 다시 호출하지 않고 skip(중복 과금 방지).
- M7: 본문 TTS 텍스트가 MAX_SLIDE_TTS_CHARS 를 넘으면 합성 직전에 절단(무제한 과금 방지).
"""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch


def _stub_render(instructor_id: uuid.UUID, **overrides):
    render = MagicMock()
    render.id = overrides.get("id", uuid.uuid4())
    render.instructor_id = instructor_id
    render.audio_url = overrides.get("audio_url")
    render.heygen_job_id = overrides.get("heygen_job_id")
    render.avatar_id = overrides.get("avatar_id", "av-1")
    render.lecture_id = overrides.get("lecture_id", uuid.uuid4())
    from app.models.video_render import RenderStatus
    render.status = overrides.get("status", RenderStatus.pending)
    return render


def _patch_db_to_return(render):
    db = MagicMock()
    chain = db.query.return_value.filter.return_value
    chain.one.return_value = render
    return db


def _apply_render_slide(render_id: str, script: str, caller_user_id: str | None):
    from app.tasks import render as render_task

    return render_task.render_slide.apply(args=[render_id, script, caller_user_id])


# ── H2: 중복 렌더 원자적 claim ──────────────────────────────────────────────


def test_render_slide_skips_heygen_when_claim_finds_concurrent_submit():
    """FOR UPDATE 재확인 시 다른 실행이 이미 heygen_job_id 를 채웠으면 create_video 미호출.

    db.refresh(with_for_update=True) 가 '잠금 후 최신 행 재로드'를 흉내내도록 side_effect
    로 heygen_job_id 를 채워, 두 번째 실행이 중복 제출 없이 skip 하는지 검증한다.
    """
    from app.tasks import render as render_task
    from app.services.pipeline.tts import TTSResult

    owner = uuid.uuid4()
    render = _stub_render(instructor_id=owner)
    db = _patch_db_to_return(render)

    # db.refresh(render, with_for_update=True) → 경쟁 실행이 이미 제출한 상태를 재현.
    def _refresh(obj, with_for_update=None, **kwargs):
        obj.heygen_job_id = "concurrent-job-xyz"

    db.refresh = MagicMock(side_effect=_refresh)

    tts_result = TTSResult(audio_bytes=b"audio", provider="elevenlabs", duration_seconds=3.0)

    with patch("app.core.config.settings.LECTURE_BODY_PROVIDER", "heygen"), \
         patch.object(render_task, "SyncSessionLocal", return_value=db), \
         patch("app.services.pipeline.tts.synthesize", new_callable=AsyncMock) as mock_tts, \
         patch("app.services.pipeline.heygen.create_video", new_callable=AsyncMock) as mock_heygen, \
         patch("app.services.pipeline.s3.upload_audio_bytes", return_value="https://s3/x.mp3"), \
         patch("app.services.pipeline.s3.file_exists", return_value=False), \
         patch("app.services.pipeline.cost_log.record_once_committed", return_value=True):
        mock_tts.return_value = tts_result

        outcome = _apply_render_slide(str(render.id), "안녕", str(owner))
        result = outcome.get(propagate=True)

    assert result.get("skipped") is True
    assert result.get("heygen_job_id") == "concurrent-job-xyz"
    mock_heygen.assert_not_called()  # ← 핵심: 중복 HeyGen 제출(=이중 과금) 차단


def test_render_slide_submits_heygen_when_claim_is_clear():
    """경쟁 실행이 없으면(claim 후에도 job_id 없음) 정상적으로 create_video 제출."""
    from app.tasks import render as render_task
    from app.services.pipeline.tts import TTSResult

    owner = uuid.uuid4()
    render = _stub_render(instructor_id=owner)
    db = _patch_db_to_return(render)
    db.refresh = MagicMock()  # no-op → heygen_job_id 그대로 None

    tts_result = TTSResult(audio_bytes=b"audio", provider="elevenlabs", duration_seconds=3.0)

    with patch("app.core.config.settings.LECTURE_BODY_PROVIDER", "heygen"), \
         patch.object(render_task, "SyncSessionLocal", return_value=db), \
         patch("app.services.pipeline.tts.synthesize", new_callable=AsyncMock) as mock_tts, \
         patch("app.services.pipeline.heygen.create_video", new_callable=AsyncMock) as mock_heygen, \
         patch("app.services.pipeline.s3.upload_audio_bytes", return_value="https://s3/x.mp3"), \
         patch("app.services.pipeline.s3.file_exists", return_value=False), \
         patch("app.services.pipeline.cost_log.record_once_committed", return_value=True):
        mock_tts.return_value = tts_result
        mock_heygen.return_value = "heygen-job-1"

        outcome = _apply_render_slide(str(render.id), "안녕", str(owner))
        result = outcome.get(propagate=True)

    assert result.get("heygen_job_id") == "heygen-job-1"
    mock_heygen.assert_called_once()
    # FOR UPDATE 잠금이 걸렸는지(refresh 가 with_for_update 로 호출됐는지) 확인.
    assert db.refresh.called
    _, kwargs = db.refresh.call_args
    assert kwargs.get("with_for_update") is True


# ── M7: 본문 TTS 글자수 캡 ──────────────────────────────────────────────────


def test_render_slide_caps_tts_text_length():
    """MAX_SLIDE_TTS_CHARS 초과 텍스트는 합성 직전에 절단되어 synthesize 로 전달된다."""
    from app.tasks import render as render_task
    from app.services.pipeline.tts import TTSResult

    cap = render_task.MAX_SLIDE_TTS_CHARS
    long_script = "가" * (cap + 500)

    owner = uuid.uuid4()
    render = _stub_render(instructor_id=owner)
    db = _patch_db_to_return(render)

    tts_result = TTSResult(audio_bytes=b"audio", provider="elevenlabs", duration_seconds=3.0)

    captured = {}

    async def _fake_syn(text, **kwargs):
        captured["text"] = text
        return tts_result

    with patch("app.core.config.settings.LECTURE_BODY_PROVIDER", "slideshow"), \
         patch.object(render_task, "SyncSessionLocal", return_value=db), \
         patch("app.services.pipeline.tts.synthesize", new=AsyncMock(side_effect=_fake_syn)), \
         patch("app.services.pipeline.s3.upload_audio_bytes", return_value="https://s3/x.mp3"), \
         patch("app.services.pipeline.s3.file_exists", return_value=False), \
         patch("app.services.video_status.finalize_video_if_all_ready", return_value=False), \
         patch("app.services.pipeline.cost_log.record_once_committed", return_value=True):
        outcome = _apply_render_slide(str(render.id), long_script, str(owner))
        result = outcome.get(propagate=True)

    assert result.get("mode") == "slideshow"
    assert "text" in captured
    assert len(captured["text"]) == cap          # 정확히 상한으로 절단
    assert captured["text"] == long_script[:cap]


def test_render_slide_does_not_cap_normal_text():
    """상한 이내 정상 텍스트는 절단되지 않고 그대로 합성된다."""
    from app.tasks import render as render_task
    from app.services.pipeline.tts import TTSResult

    normal = "안녕하세요. 오늘 수업을 시작하겠습니다."

    owner = uuid.uuid4()
    render = _stub_render(instructor_id=owner)
    db = _patch_db_to_return(render)

    tts_result = TTSResult(audio_bytes=b"audio", provider="elevenlabs", duration_seconds=3.0)
    captured = {}

    async def _fake_syn(text, **kwargs):
        captured["text"] = text
        return tts_result

    with patch("app.core.config.settings.LECTURE_BODY_PROVIDER", "slideshow"), \
         patch.object(render_task, "SyncSessionLocal", return_value=db), \
         patch("app.services.pipeline.tts.synthesize", new=AsyncMock(side_effect=_fake_syn)), \
         patch("app.services.pipeline.s3.upload_audio_bytes", return_value="https://s3/x.mp3"), \
         patch("app.services.pipeline.s3.file_exists", return_value=False), \
         patch("app.services.video_status.finalize_video_if_all_ready", return_value=False), \
         patch("app.services.pipeline.cost_log.record_once_committed", return_value=True):
        outcome = _apply_render_slide(str(render.id), normal, str(owner))
        outcome.get(propagate=True)

    assert captured["text"] == normal


def test_cap_tts_text_helper():
    """_cap_tts_text 순수 함수: None/짧은 텍스트/긴 텍스트 처리."""
    from app.tasks.render import _cap_tts_text, MAX_SLIDE_TTS_CHARS

    assert _cap_tts_text(None) == ""
    assert _cap_tts_text("짧음") == "짧음"
    long = "x" * (MAX_SLIDE_TTS_CHARS + 10)
    assert len(_cap_tts_text(long)) == MAX_SLIDE_TTS_CHARS
