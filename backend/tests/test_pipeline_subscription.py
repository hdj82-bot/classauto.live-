"""subscription 서비스 단위 테스트."""
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio

from app.models.subscription import PLAN_LIMITS, PlanType, Subscription
from app.services.pipeline.subscription import (
    PlanLimitExceeded,
    check_limit,
    get_monthly_usage,
    get_or_create_subscription,
    update_plan,
)


@pytest.mark.asyncio
class TestGetOrCreateSubscription:
    """get_or_create_subscription() 테스트."""

    async def test_returns_existing_subscription(self):
        user_id = uuid.uuid4()
        existing_sub = MagicMock(spec=Subscription)
        existing_sub.user_id = user_id
        existing_sub.plan = PlanType.basic

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = existing_sub

        db = AsyncMock()
        db.execute.return_value = mock_result

        result = await get_or_create_subscription(db, user_id)

        assert result == existing_sub
        db.add.assert_not_called()

    async def test_creates_new_subscription_if_not_exists(self):
        user_id = uuid.uuid4()

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None

        db = AsyncMock()
        db.execute.return_value = mock_result

        result = await get_or_create_subscription(db, user_id)

        db.add.assert_called_once()
        db.flush.assert_called_once()
        assert result.user_id == user_id


@pytest.mark.asyncio
class TestGetMonthlyUsage:
    """get_monthly_usage() 테스트."""

    async def test_returns_count(self):
        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar.return_value = 5

        db.execute.return_value = mock_result

        result = await get_monthly_usage(db, uuid.uuid4())

        assert result == 5

    async def test_returns_zero_when_none(self):
        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar.return_value = None

        db.execute.return_value = mock_result

        result = await get_monthly_usage(db, uuid.uuid4())

        assert result == 0


@pytest.mark.asyncio
class TestCheckLimit:
    """check_limit() 테스트."""

    @patch("app.services.pipeline.subscription.get_monthly_usage")
    @patch("app.services.pipeline.subscription.get_or_create_subscription")
    async def test_within_limit(self, mock_get_sub, mock_get_usage):
        user_id = uuid.uuid4()
        mock_sub = MagicMock(spec=Subscription)
        mock_sub.monthly_limit = 10
        mock_sub.plan = PlanType.basic

        mock_get_sub.return_value = mock_sub
        mock_get_usage.return_value = 3

        db = AsyncMock()
        sub, used = await check_limit(db, user_id, requested=1)

        assert sub == mock_sub
        assert used == 3

    @patch("app.services.pipeline.subscription.get_monthly_usage")
    @patch("app.services.pipeline.subscription.get_or_create_subscription")
    async def test_exceeds_limit_raises(self, mock_get_sub, mock_get_usage):
        user_id = uuid.uuid4()
        mock_sub = MagicMock(spec=Subscription)
        mock_sub.monthly_limit = 2
        mock_sub.plan = MagicMock()
        mock_sub.plan.value = "FREE"

        mock_get_sub.return_value = mock_sub
        mock_get_usage.return_value = 2

        db = AsyncMock()

        with pytest.raises(PlanLimitExceeded) as exc_info:
            await check_limit(db, user_id, requested=1)

        assert exc_info.value.plan == "FREE"
        assert exc_info.value.monthly_limit == 2
        assert exc_info.value.used == 2

    @patch("app.services.pipeline.subscription.get_monthly_usage")
    @patch("app.services.pipeline.subscription.get_or_create_subscription")
    async def test_exactly_at_limit(self, mock_get_sub, mock_get_usage):
        """사용량이 한도와 정확히 같을 때도 초과 오류."""
        user_id = uuid.uuid4()
        mock_sub = MagicMock(spec=Subscription)
        mock_sub.monthly_limit = 10
        mock_sub.plan = MagicMock()
        mock_sub.plan.value = "BASIC"

        mock_get_sub.return_value = mock_sub
        mock_get_usage.return_value = 10

        db = AsyncMock()

        with pytest.raises(PlanLimitExceeded):
            await check_limit(db, user_id, requested=1)

    @patch("app.services.pipeline.subscription.get_monthly_usage")
    @patch("app.services.pipeline.subscription.get_or_create_subscription")
    async def test_multiple_requested(self, mock_get_sub, mock_get_usage):
        """다수 렌더 요청 시 합산 검사."""
        user_id = uuid.uuid4()
        mock_sub = MagicMock(spec=Subscription)
        mock_sub.monthly_limit = 10
        mock_sub.plan = MagicMock()
        mock_sub.plan.value = "BASIC"

        mock_get_sub.return_value = mock_sub
        mock_get_usage.return_value = 8

        db = AsyncMock()

        # 8 + 3 = 11 > 10
        with pytest.raises(PlanLimitExceeded):
            await check_limit(db, user_id, requested=3)

        # 8 + 2 = 10 — ok
        mock_get_usage.return_value = 8
        sub, used = await check_limit(db, user_id, requested=2)
        assert used == 8


@pytest.mark.asyncio
class TestUpdatePlan:
    """update_plan() 테스트."""

    @patch("app.services.pipeline.subscription.get_or_create_subscription")
    async def test_update_valid_plan(self, mock_get_sub):
        user_id = uuid.uuid4()
        mock_sub = MagicMock(spec=Subscription)
        mock_get_sub.return_value = mock_sub

        db = AsyncMock()
        result = await update_plan(db, user_id, "PRO")

        assert result.plan == PlanType.pro
        db.flush.assert_called_once()

    @patch("app.services.pipeline.subscription.get_or_create_subscription")
    async def test_update_invalid_plan_raises(self, mock_get_sub):
        db = AsyncMock()

        with pytest.raises(ValueError, match="유효하지 않은 플랜"):
            await update_plan(db, uuid.uuid4(), "PLATINUM")

        mock_get_sub.assert_not_called()

    @patch("app.services.pipeline.subscription.get_or_create_subscription")
    async def test_update_sets_started_at(self, mock_get_sub):
        """플랜 변경 시 started_at이 현재 시각으로 갱신."""
        user_id = uuid.uuid4()
        mock_sub = MagicMock(spec=Subscription)
        mock_get_sub.return_value = mock_sub

        db = AsyncMock()
        await update_plan(db, user_id, "BASIC")

        assert mock_sub.started_at is not None
        assert isinstance(mock_sub.started_at, datetime)


class TestPlanLimitExceeded:
    """PlanLimitExceeded 예외 테스트."""

    def test_exception_attributes(self):
        exc = PlanLimitExceeded(plan="FREE", monthly_limit=2, used=2)

        assert exc.plan == "FREE"
        assert exc.monthly_limit == 2
        assert exc.used == 2
        assert "FREE" in str(exc)
        assert "2/2" in str(exc)
