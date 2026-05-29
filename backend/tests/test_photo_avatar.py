"""Photo Avatar(Design with AI) — 클라이언트 mock·태스크·API 엔드포인트 검증."""
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.config import settings
from tests.conftest import make_auth_header


# ── HeyGen 클라이언트 HEYGEN_MOCK 분기 ────────────────────────────────────────


class TestHeyGenPhotoAvatarMock:
    @pytest.mark.asyncio
    async def test_create_group_and_train_no_api(self):
        from app.services.pipeline import heygen

        with patch.object(settings, "HEYGEN_MOCK", True), patch(
            "app.services.pipeline.heygen._request_with_retry", new_callable=AsyncMock
        ) as req:
            gid = await heygen.create_photo_avatar_group("n", b"img-bytes", "image/jpeg")
            await heygen.train_photo_avatar_group(gid)

        assert gid.startswith("mockgrp_")
        req.assert_not_called()

    @pytest.mark.asyncio
    async def test_group_status_ready(self):
        from app.services.pipeline import heygen

        with patch.object(settings, "HEYGEN_MOCK", True):
            st = await heygen.get_photo_avatar_group_status("grp")
        assert st["status"] == "ready"

    @pytest.mark.asyncio
    async def test_generate_and_status_returns_n_looks(self):
        from app.services.pipeline import heygen

        with patch.object(settings, "HEYGEN_MOCK", True), patch(
            "app.services.pipeline.heygen._request_with_retry", new_callable=AsyncMock
        ) as req:
            gen = await heygen.generate_photo_avatar_looks("grp", "정장·흰 배경", 3)
            res = await heygen.get_photo_avatar_generation_status(gen, 3)

        assert gen.startswith("mockgen_")
        assert res["status"] == "ready"
        assert len(res["looks"]) == 3
        assert all(lk["look_id"].startswith("mocklook_") for lk in res["looks"])
        req.assert_not_called()


# ── Celery 태스크: 룩 행 생성 ─────────────────────────────────────────────────


def test_poll_photo_avatar_looks_creates_rows():
    from app.tasks import photo_avatar as t

    user = MagicMock()
    user.id = uuid.uuid4()

    db = MagicMock()
    db.query.return_value.filter.return_value.one.return_value = user
    db.query.return_value.filter.return_value.first.return_value = None  # dedup: 없음
    added: list = []
    db.add = lambda obj: added.append(obj)

    with patch.object(settings, "HEYGEN_MOCK", True), patch.object(
        t, "SyncSessionLocal", return_value=db
    ):
        out = t.poll_photo_avatar_looks.apply(
            args=[str(user.id), "mockgen_abc", "정장", 3]
        ).get(propagate=True)

    assert out["status"] == "ready"
    assert out["created"] == 3
    assert len(added) == 3
    assert all(o.heygen_look_id.startswith("mocklook_") for o in added)
    assert all(o.status == "ready" for o in added)


# ── API 엔드포인트 ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_photo_avatar_endpoint(client, professor):
    with patch.object(settings, "HEYGEN_MOCK", True), patch(
        "app.tasks.photo_avatar.poll_photo_avatar_training.delay"
    ) as delay:
        resp = await client.post(
            "/api/avatars/me/photo-avatar",
            files={"file": ("a.jpg", b"\xff\xd8\xff" + b"x" * 200, "image/jpeg")},
            headers=make_auth_header(professor),
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "training"
    assert body["group_id"].startswith("mockgrp_")
    delay.assert_called_once()


@pytest.mark.asyncio
async def test_create_photo_avatar_rejects_non_image(client, professor):
    with patch.object(settings, "HEYGEN_MOCK", True):
        resp = await client.post(
            "/api/avatars/me/photo-avatar",
            files={"file": ("a.txt", b"not-an-image-payload", "text/plain")},
            headers=make_auth_header(professor),
        )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_generate_looks_requires_ready_group(client, professor):
    # 그룹이 아직 없음 → 400
    with patch.object(settings, "HEYGEN_MOCK", True):
        resp = await client.post(
            "/api/avatars/me/looks",
            json={"prompt": "정장", "count": 4},
            headers=make_auth_header(professor),
        )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_generate_looks_clamps_to_batch_max(client, professor, db):
    professor.photo_avatar_group_id = "grp"
    professor.photo_avatar_group_status = "ready"
    await db.flush()

    with patch.object(settings, "HEYGEN_MOCK", True), patch.object(
        settings, "PHOTO_AVATAR_LOOK_BATCH_MAX", 4
    ), patch("app.tasks.photo_avatar.poll_photo_avatar_looks.delay") as delay:
        resp = await client.post(
            "/api/avatars/me/looks",
            json={"prompt": "정장", "count": 10},
            headers=make_auth_header(professor),
        )

    assert resp.status_code == 200
    assert resp.json()["status"] == "generating"
    delay.assert_called_once()
    # count 가 BATCH_MAX(4)로 클램프되어 task 에 전달됐는지
    assert delay.call_args.args[3] == 4


@pytest.mark.asyncio
async def test_list_and_select_look(client, professor, db):
    from app.models.photo_avatar import PhotoAvatarLook

    db.add(
        PhotoAvatarLook(
            user_id=professor.id,
            heygen_look_id="look-1",
            preview_image_url="https://h/look1.png",
            prompt="정장",
            status="ready",
        )
    )
    await db.flush()

    resp = await client.get(
        "/api/avatars/me/looks", headers=make_auth_header(professor)
    )
    assert resp.status_code == 200
    body = resp.json()
    # 맨 배열(프론트 listLooks 가 직접 map). 래핑 객체 아님.
    assert isinstance(body, list)
    assert len(body) == 1
    assert body[0]["look_id"] == "look-1"
    assert body[0]["is_default"] is False

    sel = await client.post(
        "/api/avatars/me/looks/look-1/select", headers=make_auth_header(professor)
    )
    assert sel.status_code == 200
    assert sel.json()["default_look_id"] == "look-1"
    assert professor.photo_avatar_default_look_id == "look-1"
