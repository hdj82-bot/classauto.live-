"""delete_talking_photo 다중 엔드포인트 삭제 테스트 (asset 우선 → v2 폴백).

v1 업로드 Talking Photo 는 asset 삭제 엔드포인트로 지워야 슬롯이 회수된다. 종전엔
v2 만 호출해 404 → 슬롯 미회수 → 한도 자가 회복 실패(seed 렌더 무한 재시도)였다.
"""
from __future__ import annotations

import httpx
import pytest

respx = pytest.importorskip("respx")

from app.core.config import settings  # noqa: E402
from app.services.pipeline.heygen import delete_talking_photo  # noqa: E402


@pytest.fixture(autouse=True)
def _real_heygen(monkeypatch):
    monkeypatch.setattr(settings, "HEYGEN_MOCK", False)
    monkeypatch.setattr(settings, "HEYGEN_API_KEY", "test-key")
    yield


@pytest.mark.asyncio
@respx.mock
async def test_delete_uses_asset_endpoint_first():
    base = settings.HEYGEN_BASE_URL
    asset = respx.post(f"{base}/v1/asset/tp-1/delete").mock(
        return_value=httpx.Response(200, json={})
    )
    v2 = respx.delete(f"{base}/v2/talking_photo/tp-1").mock(
        return_value=httpx.Response(404)
    )
    assert await delete_talking_photo("tp-1") is True
    assert asset.called
    assert not v2.called  # 첫 엔드포인트 성공 → v2 안 부름


@pytest.mark.asyncio
@respx.mock
async def test_delete_falls_back_to_v2():
    base = settings.HEYGEN_BASE_URL
    respx.post(f"{base}/v1/asset/tp-2/delete").mock(return_value=httpx.Response(404))
    v2 = respx.delete(f"{base}/v2/talking_photo/tp-2").mock(
        return_value=httpx.Response(204)
    )
    assert await delete_talking_photo("tp-2") is True
    assert v2.called


@pytest.mark.asyncio
@respx.mock
async def test_delete_returns_false_when_all_fail():
    base = settings.HEYGEN_BASE_URL
    respx.post(f"{base}/v1/asset/tp-3/delete").mock(return_value=httpx.Response(404))
    respx.delete(f"{base}/v2/talking_photo/tp-3").mock(return_value=httpx.Response(404))
    assert await delete_talking_photo("tp-3") is False


@pytest.mark.asyncio
async def test_delete_mock_mode_skips_http(monkeypatch):
    monkeypatch.setattr(settings, "HEYGEN_MOCK", True)
    # HTTP 모킹 없이도 True (mock 모드는 외부 호출 생략).
    assert await delete_talking_photo("tp-mock") is True
