"""외부 API 실연동 테스트 (Mock 없이).

CI에서는 skip — 환경변수 미설정 시 자동 skip.
로컬에서 실행:
    export HEYGEN_API_KEY=... ELEVENLABS_API_KEY=... OPENAI_API_KEY=... \
           STRIPE_SECRET_KEY=... DEEPL_API_KEY=...
    pytest -m external --tb=short
"""
import pytest
import httpx

pytestmark = pytest.mark.external


# ── HeyGen API ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_heygen_api_connection(heygen_api_key):
    """HeyGen API 연결 확인 — 남은 크레딧 조회 (과금 없음)."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://api.heygen.com/v2/user/remaining_quota",
            headers={"X-Api-Key": heygen_api_key},
            timeout=15,
        )
    assert resp.status_code == 200
    data = resp.json()
    assert "data" in data
    assert "remaining_quota" in data["data"]


@pytest.mark.asyncio
async def test_heygen_list_avatars(heygen_api_key):
    """HeyGen 아바타 목록 조회 (과금 없음)."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://api.heygen.com/v2/avatars",
            headers={"X-Api-Key": heygen_api_key},
            timeout=15,
        )
    assert resp.status_code == 200
    data = resp.json()
    assert "data" in data


# ── ElevenLabs TTS ────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_elevenlabs_api_connection(elevenlabs_api_key):
    """ElevenLabs API 연결 — 사용자 정보 조회 (과금 없음)."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://api.elevenlabs.io/v1/user",
            headers={"xi-api-key": elevenlabs_api_key},
            timeout=15,
        )
    assert resp.status_code == 200
    data = resp.json()
    assert "subscription" in data


@pytest.mark.asyncio
async def test_elevenlabs_list_voices(elevenlabs_api_key):
    """ElevenLabs 사용 가능한 음성 목록 조회 (과금 없음)."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://api.elevenlabs.io/v1/voices",
            headers={"xi-api-key": elevenlabs_api_key},
            timeout=15,
        )
    assert resp.status_code == 200
    data = resp.json()
    assert "voices" in data
    assert len(data["voices"]) > 0


# ── OpenAI Embeddings ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_openai_embeddings(openai_api_key):
    """OpenAI 임베딩 생성 — 최소 1회 호출 (비용: ~$0.00001)."""
    import openai

    client = openai.OpenAI(api_key=openai_api_key)
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=["테스트 문장"],
    )
    assert len(response.data) == 1
    embedding = response.data[0].embedding
    assert len(embedding) == 1536
    assert all(isinstance(v, float) for v in embedding[:10])


@pytest.mark.asyncio
async def test_openai_embeddings_batch(openai_api_key):
    """OpenAI 임베딩 배치 호출 검증."""
    import openai

    client = openai.OpenAI(api_key=openai_api_key)
    texts = ["첫 번째 문장", "두 번째 문장", "세 번째 문장"]
    response = client.embeddings.create(
        model="text-embedding-3-small",
        input=texts,
    )
    assert len(response.data) == 3
    for item in response.data:
        assert len(item.embedding) == 1536


# ── Stripe 테스트 모드 ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_stripe_connection(stripe_api_key):
    """Stripe API 연결 (테스트 모드) — 계정 정보 조회."""
    import stripe

    stripe.api_key = stripe_api_key
    # 테스트 키(sk_test_)인지 확인하여 실제 과금 방지
    assert stripe_api_key.startswith("sk_test_"), (
        "안전을 위해 Stripe 테스트 키(sk_test_)만 허용합니다."
    )
    account = stripe.Account.retrieve()
    assert account.id is not None


@pytest.mark.asyncio
async def test_stripe_list_products(stripe_api_key):
    """Stripe 상품 목록 조회 (테스트 모드)."""
    import stripe

    stripe.api_key = stripe_api_key
    assert stripe_api_key.startswith("sk_test_")
    products = stripe.Product.list(limit=3)
    assert hasattr(products, "data")


# ── DeepL 번역 ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_deepl_translation(deepl_api_key):
    """DeepL 번역 API — 최소 1회 번역 (Free 플랜 무료)."""
    import deepl

    translator = deepl.Translator(deepl_api_key)
    result = translator.translate_text("Hello", target_lang="KO")
    assert result.text  # 비어있지 않은 번역 결과
    assert "안녕" in result.text or "헬로" in result.text or len(result.text) > 0


@pytest.mark.asyncio
async def test_deepl_usage(deepl_api_key):
    """DeepL 사용량 조회 (과금 없음)."""
    import deepl

    translator = deepl.Translator(deepl_api_key)
    usage = translator.get_usage()
    assert usage.character is not None
