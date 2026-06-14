"""HeyGen 예산 서킷 브레이커 + mock 모드 검증."""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.config import settings
from app.services.pipeline import budget
from app.services.pipeline.budget import BudgetExceededError, assert_heygen_budget


# ── assert_heygen_budget ─────────────────────────────────────────────────────


def _db():
    return MagicMock()


def test_passes_when_under_limits():
    with patch.object(settings, "HEYGEN_MOCK", False), \
         patch.object(settings, "HEYGEN_DAILY_BUDGET_USD", 3.0), \
         patch.object(settings, "HEYGEN_MONTHLY_BUDGET_USD", 15.0), \
         patch.object(budget, "heygen_spend_usd", return_value=1.0):
        assert_heygen_budget(_db())  # 예외 없어야 함


def test_blocks_when_daily_exceeded():
    with patch.object(settings, "HEYGEN_MOCK", False), \
         patch.object(settings, "HEYGEN_DAILY_BUDGET_USD", 3.0), \
         patch.object(settings, "HEYGEN_MONTHLY_BUDGET_USD", 15.0), \
         patch.object(budget, "heygen_spend_usd", return_value=3.0):
        with pytest.raises(BudgetExceededError):
            assert_heygen_budget(_db())


def test_blocks_when_monthly_exceeded():
    # 일은 통과(0.5 < 3), 월만 초과(20 >= 15) 하도록 윈도별로 다른 값 반환.
    def by_window(_db, since):
        # since 의 day 가 1 이면 월 시작 → 월 합계, 아니면 일 합계로 간주.
        return 20.0 if since.day == 1 else 0.5

    with patch.object(settings, "HEYGEN_MOCK", False), \
         patch.object(settings, "HEYGEN_DAILY_BUDGET_USD", 3.0), \
         patch.object(settings, "HEYGEN_MONTHLY_BUDGET_USD", 15.0), \
         patch.object(budget, "heygen_spend_usd", side_effect=by_window):
        with pytest.raises(BudgetExceededError):
            assert_heygen_budget(_db())


def test_mock_mode_skips_check():
    # mock 모드면 합계가 한도를 넘어도 통과해야 한다 (실비용 0).
    with patch.object(settings, "HEYGEN_MOCK", True), \
         patch.object(settings, "HEYGEN_DAILY_BUDGET_USD", 3.0), \
         patch.object(budget, "heygen_spend_usd", return_value=999.0) as spend:
        assert_heygen_budget(_db())
        spend.assert_not_called()


def test_zero_limit_disables_that_window():
    # 일 한도 0 = 비활성. 월만 검사하고 통과.
    with patch.object(settings, "HEYGEN_MOCK", False), \
         patch.object(settings, "HEYGEN_DAILY_BUDGET_USD", 0.0), \
         patch.object(settings, "HEYGEN_MONTHLY_BUDGET_USD", 15.0), \
         patch.object(budget, "heygen_spend_usd", return_value=100.0):
        # 일 한도가 0 이라 일 검사는 건너뛰지만 월(100 >= 15)에서 막힌다.
        with pytest.raises(BudgetExceededError):
            assert_heygen_budget(_db())

    with patch.object(settings, "HEYGEN_MOCK", False), \
         patch.object(settings, "HEYGEN_DAILY_BUDGET_USD", 0.0), \
         patch.object(settings, "HEYGEN_MONTHLY_BUDGET_USD", 0.0), \
         patch.object(budget, "heygen_spend_usd", return_value=100.0):
        # 둘 다 0 = 완전 비활성 → 통과.
        assert_heygen_budget(_db())


# ── HEYGEN_MOCK: heygen 클라이언트가 실제 API 를 호출하지 않음 ─────────────────


@pytest.mark.asyncio
async def test_create_video_mock_returns_fake_id_without_api():
    from app.services.pipeline import heygen

    with patch.object(settings, "HEYGEN_MOCK", True), \
         patch("app.services.pipeline.heygen._request_with_retry",
               new_callable=AsyncMock) as mock_req:
        video_id = await heygen.create_video(audio_url="https://x/a.mp3", avatar_id="av-1")

    assert video_id.startswith("mock_")
    mock_req.assert_not_called()


@pytest.mark.asyncio
async def test_get_video_status_mock_returns_completed():
    from app.services.pipeline import heygen

    with patch.object(settings, "HEYGEN_MOCK", True), \
         patch.object(settings, "HEYGEN_MOCK_VIDEO_URL", "https://mock/v.mp4"), \
         patch("app.services.pipeline.heygen._request_with_retry",
               new_callable=AsyncMock) as mock_req:
        status = await heygen.get_video_status("mock_abc")

    assert status["status"] == "completed"
    assert status["video_url"] == "https://mock/v.mp4"
    assert status["duration"] == 0.0
    mock_req.assert_not_called()


@pytest.mark.asyncio
async def test_cancel_and_delete_mock_no_api():
    from app.services.pipeline import heygen

    with patch.object(settings, "HEYGEN_MOCK", True), \
         patch("app.services.pipeline.heygen._request_with_retry",
               new_callable=AsyncMock) as mock_req:
        assert await heygen.cancel_video("mock_abc") is True
        assert await heygen.delete_video("mock_abc") is True

    mock_req.assert_not_called()


# ── 단가 기본값 회귀 가드 ─────────────────────────────────────────────────────


def test_default_cost_rate_is_corrected():
    # 0.0083(과소 추정) → 0.0167(약 $1/min) 정정값 고정.
    assert settings.HEYGEN_COST_USD_PER_SECOND == pytest.approx(0.0167, abs=1e-9)


def test_default_dimension_is_720p():
    assert settings.HEYGEN_DIMENSION_WIDTH == 1280
    assert settings.HEYGEN_DIMENSION_HEIGHT == 720


# ── render_slide 통합: 예산 초과 시 retry 없이 실패 처리 ──────────────────────


def test_render_slide_blocks_on_budget_and_skips_heygen():
    from app.models.video_render import RenderStatus
    from app.tasks import render as render_task

    owner = uuid.uuid4()
    render = MagicMock()
    render.id = uuid.uuid4()
    render.instructor_id = owner
    render.lecture_id = uuid.uuid4()
    render.audio_url = None
    render.heygen_job_id = None
    render.avatar_id = "av-1"
    render.status = RenderStatus.pending

    main_db = MagicMock()
    main_db.query.return_value.filter.return_value.one.return_value = render

    with patch("app.core.config.settings.LECTURE_BODY_PROVIDER", "heygen"), \
         patch.object(render_task, "SyncSessionLocal", return_value=main_db), \
         patch("app.services.pipeline.budget.assert_heygen_budget",
               side_effect=BudgetExceededError("HeyGen 일 예산 초과: $3.00 / $3.00")), \
         patch("app.services.pipeline.tts.synthesize", new_callable=AsyncMock) as mock_tts, \
         patch("app.services.pipeline.heygen.create_video", new_callable=AsyncMock) as mock_heygen, \
         patch.object(render_task, "_archive_videos_for_lecture"):
        outcome = render_task.render_slide.apply(
            args=[str(render.id), "스크립트", str(owner)],
        )
        result = outcome.get(propagate=True)

    assert result["status"] == "BUDGET_EXCEEDED"
    # 차단은 TTS·HeyGen 호출 이전에 일어나야 한다.
    mock_tts.assert_not_called()
    mock_heygen.assert_not_called()
    assert render.status == RenderStatus.failed


# ── Q&A 아바타 렌더 한도 (assert_qa_render_budget) ─────────────────────────────


def test_qa_render_quota_remaining_counts_down():
    # 한도 단위는 '배포된 강의' 수. used 만큼 사용했으면 cap-used 가 남는다.
    used = 2
    with patch.object(budget, "instructor_has_unlimited_qa", return_value=False), \
         patch.object(budget, "qa_renders_used_this_month", return_value=used):
        remaining = budget.qa_render_quota_remaining(_db(), uuid.uuid4())
    assert remaining == max(0, settings.QA_AVATAR_MONTHLY_RENDERS_PER_INSTRUCTOR - used)


def test_assert_qa_render_budget_blocks_when_quota_exhausted():
    from app.services.pipeline.budget import QARenderQuotaError, assert_qa_render_budget

    # 배포 강의 한도 소진 + 현재 강의는 한도 집합 밖(새 강의) → 차단.
    with patch.object(budget, "instructor_has_unlimited_qa", return_value=False), \
         patch.object(budget, "_lecture_in_quota_set", return_value=False), \
         patch.object(budget, "qa_renders_used_this_month",
                      return_value=settings.QA_AVATAR_MONTHLY_RENDERS_PER_INSTRUCTOR):
        with pytest.raises(QARenderQuotaError):
            assert_qa_render_budget(_db(), uuid.uuid4(), uuid.uuid4())


def test_assert_qa_render_budget_passes_under_quota_in_mock():
    from app.services.pipeline.budget import assert_qa_render_budget

    # 한도 충분 + mock → $ 브레이커도 통과.
    with patch.object(budget, "instructor_has_unlimited_qa", return_value=False), \
         patch.object(budget, "_lecture_in_quota_set", return_value=False), \
         patch.object(budget, "qa_renders_used_this_month", return_value=0), \
         patch.object(settings, "HEYGEN_MOCK", True):
        assert_qa_render_budget(_db(), uuid.uuid4(), uuid.uuid4())  # 예외 없이 통과


def test_assert_qa_render_budget_unlimited_account_bypasses():
    from app.services.pipeline.budget import assert_qa_render_budget

    # 무제한 계정은 한도 소진 상태여도 통과($ 브레이커는 mock 으로 면제).
    with patch.object(budget, "instructor_has_unlimited_qa", return_value=True), \
         patch.object(settings, "HEYGEN_MOCK", True):
        assert_qa_render_budget(_db(), uuid.uuid4(), uuid.uuid4())
