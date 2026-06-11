"""사용자 본인(/me) API — 온보딩 영구 스킵 테스트."""
from tests.conftest import make_auth_header


async def test_me_onboarded_at_null_initially(client, student):
    resp = await client.get("/api/v1/users/me", headers=make_auth_header(student))
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == str(student.id)
    assert data["role"] == "student"
    assert data["onboarded_at"] is None


async def test_mark_onboarded_sets_and_is_idempotent(client, student):
    headers = make_auth_header(student)

    r1 = await client.post("/api/v1/users/me/onboarded", headers=headers)
    assert r1.status_code == 200
    first = r1.json()["onboarded_at"]
    assert first is not None

    # 멱등 — 다시 호출해도 최초 시각을 덮어쓰지 않는다.
    r2 = await client.post("/api/v1/users/me/onboarded", headers=headers)
    assert r2.status_code == 200
    assert r2.json()["onboarded_at"] == first

    # 이후 /me 는 채워진 값을 반환(영구 스킵 판정 근거).
    r3 = await client.get("/api/v1/users/me", headers=headers)
    assert r3.json()["onboarded_at"] is not None


async def test_me_requires_auth(client):
    resp = await client.get("/api/v1/users/me")
    assert resp.status_code == 401
