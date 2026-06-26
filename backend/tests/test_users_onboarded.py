"""사용자 본인(/me) API — 온보딩 영구 스킵 테스트."""
from tests.conftest import make_auth_header


async def test_me_onboarded_at_null_initially(client, student):
    resp = await client.get("/api/v1/users/me", headers=make_auth_header(student))
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == str(student.id)
    assert data["role"] == "student"
    assert data["onboarded_at"] is None


async def test_me_returns_email_and_name(client, student, professor):
    """H4: /me 가 email·name 을 반환해야 프론트가 신원 표시·노출 게이트를 채운다.

    종전에는 응답에 email/name 이 없어 프론트 user 가 빈 문자열로 남고, 분석 PRO 메뉴·
    종합보고서 버튼(이메일 허용목록 게이트)이 영구히 사라졌다.
    """
    r_stu = await client.get("/api/v1/users/me", headers=make_auth_header(student))
    assert r_stu.status_code == 200
    body = r_stu.json()
    assert body["email"] == student.email == "stu@test.ac.kr"
    assert body["name"] == student.name == "테스트 학생"

    # 교수자(분석 PRO 게이트 대상)도 동일하게 채워진다.
    r_prof = await client.get("/api/v1/users/me", headers=make_auth_header(professor))
    assert r_prof.status_code == 200
    prof_body = r_prof.json()
    assert prof_body["email"] == professor.email
    assert prof_body["name"] == professor.name


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
