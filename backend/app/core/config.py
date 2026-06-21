import logging

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

# 화이트리스트 — 오타("prodution")로 인해 prod 보호 분기를 우회당하는 사고 방지.
_ALLOWED_ENVIRONMENTS: frozenset[str] = frozenset(
    {"development", "staging", "production", "test"}
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # ── Environment ────────────────────────────────────────────
    ENVIRONMENT: str = "development"  # development | staging | production | test

    @field_validator("ENVIRONMENT")
    @classmethod
    def _validate_environment(cls, v: str) -> str:
        v_norm = (v or "").strip().lower()
        if v_norm not in _ALLOWED_ENVIRONMENTS:
            raise ValueError(
                f"ENVIRONMENT must be one of {sorted(_ALLOWED_ENVIRONMENTS)} (got {v!r})"
            )
        return v_norm

    # ── DB / Redis ──────────────────────────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://user:pass@db:5432/ifl"
    DATABASE_URL_SYNC: str = "postgresql://user:pass@db:5432/ifl"
    REDIS_URL: str = "redis://redis:6379/0"

    # ── JWT ─────────────────────────────────────────────────────
    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ── Google OAuth ────────────────────────────────────────────
    GOOGLE_OAUTH_CLIENT_ID: str = ""
    GOOGLE_OAUTH_CLIENT_SECRET: str = ""
    GOOGLE_OAUTH_REDIRECT_URI: str = "http://localhost:8000/api/auth/google/callback"

    # ── Anthropic ───────────────────────────────────────────────
    # 모델 정책(2026-05-23): 모든 생성 과정은 "속도 최우선" — 가장 빠른 경량
    # 모델(Haiku)을 기본으로 한다. 특정 과정의 결과 품질이 부족하다고 판단되면
    # 그 과정의 *_MODEL 만 상위 모델(sonnet/opus)로 올려 대응한다. 모델은 모두
    # 설정값이므로 코드 변경 없이 env 로 즉시 조정 가능.
    ANTHROPIC_API_KEY: str = ""
    CLAUDE_MODEL: str = "claude-haiku-4-5"        # 공용 기본값(현재 직접 사용처 없음)
    SCRIPT_MODEL: str = "claude-haiku-4-5"        # 발화 스크립트 생성 (스튜디오)
    QUESTION_MODEL: str = "claude-haiku-4-5"      # 평가 문제 생성 (스튜디오)
    QA_MODEL: str = "claude-haiku-4-5"            # 학생 RAG Q&A
    # 소크라테스식 인터랙티브 퀴즈 저작 대화. 다중 턴 추론 품질을 위해 Sonnet 을
    # 쓰던 경로지만, 비용/잔액 운영 단순화를 위해 다른 과정과 동일하게 Haiku 로
    # 통일한다(2026-06-12). 품질이 부족하면 env(SOCRATIC_MODEL)로 즉시 상향 가능.
    # 비용은 CostLog(LLM_ASSESSMENT)에 서버 기록만 하고 교수자 UI엔 노출하지 않는다.
    SOCRATIC_MODEL: str = "claude-haiku-4-5"      # 퀴즈 저작 소크라테스 대화 (스튜디오)
    SOCRATIC_MAX_TOKENS: int = 2048
    # 자막 번역 전용 — 텍스트→텍스트라 가장 빠르고 저렴한 Haiku 로 충분.
    # 슬라이드별로 1회씩 병렬 호출한다(전체를 1회로 묶으면 출력이 커져 30s
    # 타임아웃 → 폴백 hang 으로 이어졌다). max_tokens 는 슬라이드 1장 분량 상한.
    TRANSLATE_MODEL: str = "claude-haiku-4-5"
    TRANSLATE_MAX_TOKENS: int = 4096
    # 자막 번역 동시 호출 상한. Anthropic 계정의 "동시 연결 수" 제한이 낮아
    # 10 이면 429(concurrent connections exceeded) 발생 → 스크립트 생성(5)보다
    # 보수적으로 4. 초과분은 retry_external 백오프 재시도가 흡수.
    TRANSLATE_CONCURRENCY: int = 4
    # Google Translate 폴백 활성화 여부. 운영엔 Google 번역 자격증명이 없어
    # 기본 비활성 — 켜면 google.cloud Client() 가 자격증명을 못 찾아 GCE
    # 메타데이터 서버 조회로 무한 대기(요청 hang)하므로, 실제 자격증명을
    # 구성한 환경에서만 true 로 둔다.
    GOOGLE_TRANSLATE_ENABLED: bool = False
    SCRIPT_MAX_TOKENS: int = 2048
    # 슬라이드별 스크립트 생성 시 동시 호출 상한. Anthropic 분당 요청 수
    # rate limit 보호용. 너무 높이면 429 가 늘어 retry 백오프로 오히려 느려진다.
    SCRIPT_CONCURRENCY: int = 5
    # 본인 음성 녹음용 대본 생성 전용 — 짧은 단발 호출이라 "가장 빠르고 싼"
    # 최신 Haiku 를 고정한다(앞당겨진 응답 시간이 UX 핵심). thinking 미사용.
    VOICE_SCRIPT_MODEL: str = "claude-haiku-4-5-20251001"
    # 대본은 ~500자 한 단락 — 한국어/일본어 500자는 출력 토큰 ~600~700 수준이라
    # mid-sentence 잘림을 피하면서도 기본(2048)보다 타이트하게 768 로 캡한다.
    VOICE_SCRIPT_MAX_TOKENS: int = 768
    CLAUDE_INPUT_COST_PER_M: float = 3.00
    CLAUDE_OUTPUT_COST_PER_M: float = 15.00
    # 학습 분석 PRO(베타 전용) AI 브리핑·학생솔루션(docs/planning/analytics-spec.md
    # §2.4). 강의×주 1회 수준의 저빈도·고가치 분석이라 다른 경로와 달리 품질 우선
    # 모델(Sonnet)을 기본으로 둔다(스펙 권장). env 로 즉시 하향 가능. 키 미설정/오류
    # 시 규칙기반 폴백.
    ANALYTICS_BRIEFING_MODEL: str = "claude-sonnet-4-6"
    ANALYTICS_BRIEFING_MAX_TOKENS: int = 1500
    # 학기 전체 분석(§3) 설문/총평 — 출력이 길어 별도 상한. 설문 6문항(근거·DOI)·
    # 총평(장단점·논문 제안)이라 브리핑보다 토큰이 크다. 학기말 저빈도라 비용 영향 작다.
    ANALYTICS_SURVEY_MAX_TOKENS: int = 2000
    ANALYTICS_REVIEW_MAX_TOKENS: int = 2000
    # 학습 분석 PRO 전역 킬스위치. False 면 운영자(ADMIN_EMAILS) 외 전원 차단(인시던트).
    ANALYTICS_PRO_ENABLED: bool = True
    # 실기능을 노출할 명시 허용 이메일(쉼표 구분). 현재는 계정주 2계정에만 노출하고
    # 베타테스터에게는 숨긴다. classauto101@gmail.com 은 ADMIN_EMAILS 라 자동 포함되므로
    # 여기엔 hdj82@kyonggi.ac.kr 만 둔다. env 로 추가 가능.
    ANALYTICS_PRO_ALLOWED_EMAILS: str = "hdj82@kyonggi.ac.kr"
    # 정식 베타 오픈 스위치. True 로 켜면 운영자 콘솔 토글(analytics_pro_enabled)이
    # 베타테스터에게도 작동한다. 기본 False = 토글이 켜져 있어도 베타테스터에겐 비노출.
    ANALYTICS_PRO_OPEN_TO_TESTERS: bool = False

    # ── OpenAI (임베딩) ─────────────────────────────────────────
    OPENAI_API_KEY: str = ""
    EMBEDDING_MODEL: str = "text-embedding-3-small"

    # ── 플랜 차등(아바타/음성 등) 게이트 ─────────────────────────────
    # AVATAR_VOICE_FEATURE_ROADMAP.md 의 Free/Basic/Pro 차등을 위한 전역 킬스위치.
    # 베타는 결제 UI 가 가려져 전원 무제한이므로 기본 False(게이팅 비활성 — 전원 통과).
    # 정식 런칭 시 True 로 켜면 deps.require_plan 이 구독 플랜으로 실제 게이팅한다.
    PLAN_GATING_ENABLED: bool = False

    # ── 평가 시스템 ─────────────────────────────────────────────
    FORMATIVE_SERVE_COUNT: int = 5
    SUMMATIVE_SERVE_COUNT: int = 5
    TIMESTAMP_TOLERANCE_SECONDS: int = 120

    # ── 출석 판단 기준 ───────────────────────────────────────────
    DEFAULT_LIVE_DEADLINE_MINUTES: int = 30  # 강의별 설정이 없을 때 사용

    # ── HeyGen ──────────────────────────────────────────────────
    HEYGEN_API_KEY: str = ""
    HEYGEN_BASE_URL: str = "https://api.heygen.com"
    # 단일 변수(HEYGEN_AVATAR_ID)는 deprecated alias — _MALE 의 fallback 으로만 사용.
    # 신규 코드는 services/pipeline/heygen.py:pick_avatar_id(gender) 를 써야 함.
    HEYGEN_AVATAR_ID: str = ""
    HEYGEN_AVATAR_ID_MALE: str = ""
    HEYGEN_AVATAR_ID_FEMALE: str = ""
    HEYGEN_WEBHOOK_SECRET: str = ""
    HEYGEN_CALLBACK_URL: str = "http://localhost:8000/api/v1/webhooks/heygen"
    # 영상 1초당 USD 단가 — API 종량제 실측 기준 약 $1/min = $0.0167/sec.
    # 0 으로 두면 비용 기록은 duration 만 남기고 cost_usd=0 (회계 비활성).
    HEYGEN_COST_USD_PER_SECOND: float = 0.0167
    # 렌더 해상도. 720p 가 기본(비용·플랜 안정). 아바타 화질은 해상도보다
    # Talking Photo 입력 이미지 다운스케일이 더 큰 영향(아래 PHOTO_AVATAR 참조).
    HEYGEN_DIMENSION_WIDTH: int = 1280
    HEYGEN_DIMENSION_HEIGHT: int = 720
    # mock 모드: 켜면 실제 HeyGen API 를 호출하지 않아 크레딧이 ₩0 (로컬/테스트용).
    HEYGEN_MOCK: bool = False
    # mock 완료 처리 시 사용할 placeholder 영상 URL (비우면 mock 렌더는 완료되지 않음).
    HEYGEN_MOCK_VIDEO_URL: str = ""
    # 예산 서킷 브레이커 — create_video 직전 누적 HeyGen 비용 검사. 0 이면 해당 한도 비활성.
    # ── C(스펙 13): 베타 규모 예산 (2026-06-18) ──────────────────────────────────
    # 개발 기본값(일$3/월$15)은 베타에선 즉시 BudgetExceededError 로 모든 교수자의
    # 렌더가 차단되므로 베타 규모로 둔다. 산정: 월예산 ≈ 테스터 수 × 월 강의 수 ×
    # 강의당 평균 비용(Q&A 아바타 ≤3클립) × 안전계수. 강의 본문은 slideshow 라
    # HeyGen 을 쓰지 않는다. 강의당 변동비는 재렌더 상한(C-2)으로 따로 죈다.
    # ⚠️ 실제 운영값은 .env.production 의 환경변수로 override 해 코드 재배포 없이
    #    조정한다(테스터가 늘면 env 만 올린다). 실질 하드캡은 HeyGen 계정 잔액
    #    (auto-refill OFF)이며 이 브레이커는 사고(재시도 루프·대량 생성) 2차 방어선.
    HEYGEN_DAILY_BUDGET_USD: float = 250.0
    HEYGEN_MONTHLY_BUDGET_USD: float = 600.0

    # ── VisionStory (본인 얼굴 Q&A·미리보기 렌더 — V-Talk) ───────────────────────
    # HeyGen Photo Avatar 는 계정당 3개 한도라 다수 사용자에게 본인 얼굴을 줄 수 없다.
    # VisionStory 는 사진으로 아바타를 1회 생성(avatar_id)한 뒤 그 아바타로 영상을
    # 만든다(등록 한도 없음 → 사용자 수만큼 확장). 교수자별 avatar_id 는
    # users.visionstory_avatar_id 에 캐시해 재사용한다. 강의에 '교수자 본인 아바타'를
    # 적용한 Q&A 에 쓴다(본인/타인은 적용 avatar_id 가 결정 — _is_own_face_lecture).
    # 키가 비어 있거나 MOCK 이면 HeyGen 표준 아바타로 폴백한다(서비스 연속성).
    VISIONSTORY_API_KEY: str = ""
    VISIONSTORY_BASE_URL: str = "https://openapi.visionstory.ai"
    # 본인 아바타 제작 모델 — 항상 V-Character 3.0("vs_character_v3", 큰 동작·생동감)으로
    # 고정한다(교수자 선택 없음 — 2026-06-15 정책). GET /api/v1/models 기준:
    #   vs_talk_v1(립싱크 위주) / vs_character_v1(2.0) / vs_character_v3(3.0).
    VISIONSTORY_MODEL_ID: str = "vs_character_v3"
    # 본인 아바타 제작은 항상 720P 고정(교수자 선택 없음). vs_character_v3 는 720p/1080p 지원.
    VISIONSTORY_RESOLUTION: str = "720p"  # "720p" | "1080p" (vs_character_v3)
    VISIONSTORY_ASPECT_RATIO: str = "16:9"  # "16:9" | "9:16" | "1:1"
    # 캐릭터 표현(emotion) — 웹앱 "모션"은 공개 API 에 없고 emotion 5종만 가능하다
    # (cheerful/angry/marketing/news/singing). 교수자 강의 톤(엄숙·차분)에 가장 가까운
    # "news"(뉴스 앵커 톤)를 기본값으로 항상 적용한다(교수자 선택 없음 — 2026-06-15 정책).
    # 비우면 emotion 을 payload 에서 생략한다(모델이 거부하면 빈 문자열로 끌 수 있음).
    VISIONSTORY_EMOTION: str = "news"
    # 영상 1초당 USD 환산(회계용 근사치). VisionStory 는 크레딧 과금이라 정확치는 응답
    # cost_credit 으로 본다. 단가 = HeyGen 공용 아바타(HEYGEN_COST_USD_PER_SECOND
    # 0.0167)의 정확히 2배 = 0.0334 (2026-06-19 사용자 확인).
    VISIONSTORY_COST_USD_PER_SECOND: float = 0.0334
    # mock: 켜면 실제 VisionStory 호출 0 — 제출/폴링을 placeholder 로 시뮬레이션.
    VISIONSTORY_MOCK: bool = False
    VISIONSTORY_MOCK_VIDEO_URL: str = ""
    # VisionStory 전역 $ 서킷 브레이커(본인 얼굴 Q&A 렌더). HeyGen 과 달리 VS 비용은
    # platform_cost_logs(category=AVATAR_QA, model='visionstory')에 적재되므로 그 합으로
    # 일/월 한도를 본다(budget.assert_visionstory_budget). 0 이면 해당 검사 비활성.
    # 2026-06-19 결정: 일 200 / 월 1500 — 20명 베타 정상 사용(~$960/월) 위, C-2 하향 후
    # 이론상 최대(~$3.8k) 아래에서 재시도 폭주·버그성 대량 렌더만 끊는 2차 방어선.
    # (1차 방어선은 강의당 횟수 상한 AVATAR_RERENDER_MAX_PER_LECTURE.)
    VISIONSTORY_DAILY_BUDGET_USD: float = 200.0
    VISIONSTORY_MONTHLY_BUDGET_USD: float = 1500.0

    # ── 아바타 Q&A 캐시 (docs/planning/08 §5, 09 §5) ─────────────
    # 실시간 HeyGen 렌더 금지(지연). 질문은 항상 즉시 RAG 텍스트로 답하고, 겹치는
    # 질문만 야간 배치로 사전 렌더한 아바타 클립을 캐시에서 즉시 제공한다.
    # 캐시 적중 임계값 — 08 §5.4: 0.9 시작, 베타에서 오답 재생 빈도로 보정.
    QA_AVATAR_SIMILARITY_THRESHOLD: float = 0.9
    # 야간 배치 클러스터링에서 같은 질문으로 묶는 코사인 임계값(적중 임계값과 동일 기준).
    QA_AVATAR_CLUSTER_THRESHOLD: float = 0.9
    # 배치 1회가 렌더할 상위 클러스터 수 — 영상당 3렌더(09 §5).
    QA_AVATAR_TOP_CLUSTERS: int = 3
    # 교수자당 월 Q&A 아바타 한도 — '배포(is_published)된 강의' 단위 (2026-06-14 개정).
    # 한 강의에 사전 질문이 3개여도, 디버깅으로 여러 번 재렌더해도 그 강의는 1로 센다.
    # 제작 중(미배포) 강의 렌더는 한도를 소모하지 않고 실제 배포한 강의만 센다.
    # 베타테스터 월 8강의. 무제한 화이트리스트(QA_AVATAR_UNLIMITED_EMAILS)는 면제.
    QA_AVATAR_MONTHLY_RENDERS_PER_INSTRUCTOR: int = 8
    # 월 한도를 면제받는 계정(테스트 계정·계정주). 콤마 구분, 소문자 비교.
    # 베타테스터(계정주 초대로 가입)는 위 월 한도가 적용된다.
    QA_AVATAR_UNLIMITED_EMAILS: str = "hdj82@kyonggi.ac.kr,classauto101@gmail.com"

    @property
    def qa_avatar_unlimited_email_set(self) -> frozenset[str]:
        """무제한 Q&A 화이트리스트를 정규화(소문자·공백 제거)한 집합."""
        return frozenset(
            e.strip().lower()
            for e in self.QA_AVATAR_UNLIMITED_EMAILS.split(",")
            if e.strip()
        )
    # 클러스터가 렌더 대상이 되기 위한 최소 누적 질문 수(1회성 잡음 질문 렌더 방지).
    QA_AVATAR_MIN_CLUSTER_SIZE: int = 1
    # 아바타 답변 길이 상한(글자) — 렌더 TTS 에 넘기는 답변을 자른다. 교수자 입력
    # 스키마(seed_question.answer max_length=400)와 일치시켜, 교수자가 적은 답변이
    # 그대로 발화되게 한다. 어느 언어로 만들든 400자 이하로 제한한다(2026-06-16 사용자
    # 결정 — VisionStory 는 렌더 영상 초당 과금이라 답변이 길수록 비용이 커진다). 변동비
    # (렌더 길이)는 이 상한 × 발화 속도로 결정되므로, 비용을 더 죄어야 하면 이 값을
    # 낮춘다(낮춰도 저장된 answer_text 원문은 보존됨 — qa_batch 참조).
    QA_AVATAR_MAX_ANSWER_CHARS: int = 400
    # Q&A 답변 아바타의 발화 속도(배). 슬라이드 내레이션과 별개로 Q&A 답변은 항상 이
    # 속도로 렌더한다 — 빠를수록 영상이 짧아져 VisionStory 비용이 줄기 때문(2026-06-16
    # 사용자 결정: 기본 1.2배). ElevenLabs voice_settings.speed 실효 범위(0.7~1.2)의 상단.
    QA_AVATAR_VOICE_SPEED: float = 1.2
    # 야간 배치 실행 시각(UTC 시). 기본 18시(UTC) = KST 03:00 — 일일 백업(03 UTC) 이후.
    QA_AVATAR_BATCH_HOUR_UTC: int = 18
    # 강의당 아바타 제작(렌더 패스) 횟수 상한 — "첫 제작 1 + 재제작 2 = 총 3회"
    # (docs/planning/13-beta-admin-console.md §C-2). 월 한도(QA_AVATAR_MONTHLY_…)는
    # '배포된 강의 수'를 세지 같은 강의의 재제작 횟수를 세지 않아, 결과가 맘에 안 들어
    # 여러 번 다시 뽑으면 비용이 매번 발생해도 슬롯은 1로만 친다. 특히 VisionStory(본인
    # 얼굴)는 전역 $ 서킷 브레이커가 없어 이 횟수 상한이 유일한 방어선이다. HeyGen·
    # VisionStory 둘 다 동일 적용. 성공한 제작 패스만 카운트(실패/취소 제외). 면제
    # 계정(QA_AVATAR_UNLIMITED_EMAILS)은 무제한. **0 이하면 상한 비활성(무제한)**.
    # 2026-06-19: 5 → 3 으로 하향(첫 제작 1 + 재제작 2). 20명 베타 규모에서 VisionStory
    # 본인얼굴 렌더의 이론상 천장을 낮추기 위함(전역 $ 브레이커 도입 전 노출 축소).
    AVATAR_RERENDER_MAX_PER_LECTURE: int = 3

    # ── 강의 본문 렌더 방식 (docs/planning/08-cost-optimization.md) ──────────────
    # "slideshow"(기본) = 본문을 HeyGen 영상으로 굽지 않고, 슬라이드 이미지 + 구간
    # TTS 음성 + 타임라인(VideoScript.segments)을 클라이언트가 동기 재생한다. 슬라이드
    # 마다 HeyGen 클립을 만들던 비용(슬라이드 N × $1/분 올림 과금)을 제거한다. HeyGen
    # 립싱크는 Q&A 답변 등에만 쓴다. "heygen" = 슬라이드별 립싱크 렌더(레거시·롤백용).
    LECTURE_BODY_PROVIDER: str = "slideshow"  # slideshow | heygen
    # Photo Avatar 룩 생성 상한 — 룩 1개당 이미지 생성 비용이 발생하므로
    # 한 번에 생성할 수 개수와 교수자당 누적 개수를 제한해 비용 폭주를 막는다.
    PHOTO_AVATAR_LOOK_BATCH_MAX: int = 4
    # 온보딩에서 만들 수 있는 룩 후보(non-failed)의 누적 상한. 2026-06-02 사용자
    # 결정으로 20. 이 한도에 도달하면 후보를 삭제해야 다시 생성할 수 있다.
    PHOTO_AVATAR_LOOK_TOTAL_MAX: int = 20
    # 라이브러리(saved_to_library)에 보관 가능한 확정 룩 수의 상한. 후보(20)와 별개로
    # 사용자가 '확정/저장'한 것만 들어가며, 선택 피로를 막기 위해 10 으로 둔다.
    PHOTO_AVATAR_LIBRARY_MAX: int = 10
    # '내 아바타'(룩+음성 조합) 라이브러리에 저장 가능한 조합 수 상한. 미리보기
    # 렌더가 HeyGen 비용을 유발하므로 선택 피로·비용 양쪽을 고려해 12 로 둔다.
    PHOTO_AVATAR_SAVED_MAX: int = 12
    # 룩이 이 시간(분) 넘게 generating 에 머물면 reaper 가 failed 로 정리한다.
    # 워커 장애로 정체된 룩이 누적 cap 을 영구 점유해 생성 버튼이 사라지는 것을
    # 막는다(app.tasks.photo_avatar.reap_stuck_looks). 정상 생성 소요(수 분)보다
    # 넉넉히 크게 둬 실제 진행 중인 작업을 죽이지 않는다.
    PHOTO_AVATAR_LOOK_STUCK_MINUTES: int = 15

    # ── Photo Avatar v0.2: gpt-image-2 룩 + Talking Photo (docs/planning/12 §0) ──
    # 룩 생성 제공자 전환 feature flag. "gpt" = OpenAI gpt-image-2 즉석 생성 +
    # Talking Photo 최종(train 0). "heygen" = 기존 Design with AI 풀코스(롤백용).
    PHOTO_AVATAR_PROVIDER: str = "gpt"
    # 룩 생성 모델·품질. tier 가 비용의 핵심 레버(high↔medium ~4배).
    OPENAI_IMAGE_MODEL: str = "gpt-image-2"
    # 사용자 결정(2026-06-01): 베타 품질 우선 — medium(~$0.042/장) → high(~$0.17/장).
    # 3장 배치 1회 ≈ $0.51. 추가 비용은 라이브러리 상한(10) + 1회성 온보딩으로 흡수.
    PHOTO_AVATAR_IMAGE_QUALITY: str = "high"  # low|medium|high
    # reference(교수 사진) 얼굴 보존 강도. **gpt-image-1 전용 파라미터** —
    # gpt-image-2 는 이 파라미터를 지원하지 않으며, 보내면 400
    # `invalid_input_fidelity_model` 로 거부된다(2026-06-01 확인).
    # 빈 문자열이면 호출 시 파라미터를 생략한다(openai_image.py 참조).
    # 모델별 권장값: gpt-image-2 → "" / gpt-image-1 → "high".
    PHOTO_AVATAR_INPUT_FIDELITY: str = ""
    PHOTO_AVATAR_LOOK_BATCH_DEFAULT: int = 3    # 한 번에 보여줄 후보 수
    # mock 모드: 켜면 OpenAI 를 호출하지 않고 더미 이미지를 반환(테스트 비용 ₩0).
    # HEYGEN_MOCK 와 동일 패턴.
    OPENAI_IMAGE_MOCK: bool = False
    # 룩 출력 비율을 16:9 로 맞춘다. gpt-image-2 는 16:9 를 직접 지원하지 않아
    # (가장 가까운 1536x1024=3:2 로 생성), 생성된 3:2 고화질 이미지를 그대로 살린 채
    # **선명하게 16:9 로 크롭**해 강의 영상(16:9) 톤에 맞춘다. 흐림·여백 없이 화면을
    # 꽉 채우는 "확대" 효과(2026-06-02 사용자 요청). 잘리는 높이는 위쪽 여백에서
    # 우선 덜어내 하단(손·허리)을 보존한다(PHOTO_AVATAR_16_9_TOP_BIAS). 끄면 3:2 원본.
    PHOTO_AVATAR_OUTPUT_16_9: bool = True
    # 16:9 크롭 시 잘라낼 세로 초과분을 위쪽에서 덜어내는 비율(0~1). 1.0=전부 위에서
    # (하단 무손실), 0.0=전부 아래에서(상단/머리 무손실), 0.5=상하 균등.
    # 기본 0.0 — **머리 위 잘림을 원천 차단**한다(2026-06-03 사용자 보고: "자세히 보기
    # 시 머리 윗부분이 짤림"). gpt-image-2 가 프롬프트의 머리 위 여백 지시를 항상
    # 지키지 못해 위쪽을 자르면 머리가 잘리는 사고가 있었다. 초과분은 전부 아래에서
    # 덜어내므로(=하단의 손·허리 일부가 잘릴 수 있음) 프롬프트는 머리를 위쪽에 작은
    # 여백으로 배치하도록 갱신했다(openai_image._HIDDEN_HEYGEN_RULES).
    PHOTO_AVATAR_16_9_TOP_BIAS: float = 0.0

    # ── TTS: ElevenLabs (primary) ───────────────────────────────
    ELEVENLABS_API_KEY: str = ""
    # 단일 변수(ELEVENLABS_VOICE_ID)는 deprecated alias — _MALE 의 fallback 으로만 사용.
    # 신규 코드는 services/pipeline/elevenlabs_client.py:pick_voice_id(gender) 를 써야 함.
    ELEVENLABS_VOICE_ID: str = ""
    ELEVENLABS_VOICE_ID_MALE: str = ""
    ELEVENLABS_VOICE_ID_FEMALE: str = ""
    ELEVENLABS_MODEL_ID: str = "eleven_multilingual_v2"
    # 사이트 전체 음성 합성의 1차 모델. eleven_v3 는 한 번의 합성으로 문장 내 한·중
    # 코드스위칭까지 처리해, 구간 분리·이어붙임 없이 끊김/오발음을 없앤다. (변수명은
    # 도입 경위상 _ZH 지만 현재는 전체 텍스트에 적용.) 빈 문자열로 두면 v3 를 끄고
    # 위 ELEVENLABS_MODEL_ID(multilingual_v2) 경로로 폴백한다(escape hatch).
    ELEVENLABS_MODEL_ID_ZH: str = "eleven_v3"
    # ── 클론(IVC) 음성 합성 전용 ─────────────────────────────────
    # 교수자 본인 목소리(Instant Voice Cloning)도 eleven_v3 로 합성한다(2026-06-05
    # 사용자 결정: multilingual_v2 의 "책 읽는 듯 밋밋한 톤" 해소 위해 v3 의 자연스러운
    # 운율을 우선). v3 는 voice_settings 중 stability(Creative0.0/Natural0.5/Robust1.0)
    # 만 의미가 있어 similarity_boost 등 클론 튜닝키는 무시되지만, 운율·표현력이
    # multilingual_v2 보다 자연스럽다. tts._elevenlabs_primary 의 클론 경로가 v3 단일
    # 호출(코드스위칭)을 먼저 시도하고, v3 실패 시 multilingual_v2 + 클론 튜닝 세팅으로
    # graceful 폴백한다(본인 목소리 닮음이 더 중요하면 이 값을 multilingual_v2 로
    # 되돌려 v2 경로만 쓰면 된다).
    ELEVENLABS_MODEL_ID_CLONE: str = "eleven_v3"
    ELEVENLABS_CLONE_STABILITY: float = 0.45
    ELEVENLABS_CLONE_SIMILARITY_BOOST: float = 0.85
    ELEVENLABS_CLONE_STYLE: float = 0.0
    ELEVENLABS_CLONE_USE_SPEAKER_BOOST: bool = True
    # 합성 출력 포맷(품질). mp3_44100_128(=44.1kHz/128kbps) 이상 권장.
    ELEVENLABS_OUTPUT_FORMAT: str = "mp3_44100_128"
    # 자막 정밀 싱크: 렌더 시 ElevenLabs Forced Alignment 로 슬라이드 음성의 실제
    # 발성 시각을 산출해 VideoRender.subtitle_cues 에 저장한다. 플레이어는 이 cue 로
    # 자막을 싱크하고, 없으면 글자수 균등분배로 폴백한다. 합성 경로와 독립적이며
    # 실패해도 렌더는 진행된다(best-effort). False 면 정렬 호출 자체를 건너뛴다.
    SUBTITLE_ALIGNMENT_ENABLED: bool = True
    # IVC 생성 시 업로드 샘플의 배경 잡음 제거(마이크 녹음 품질 보정 → 클론 fidelity↑).
    ELEVENLABS_IVC_REMOVE_NOISE: bool = True
    # 교수자 음성 선택 UI 에 노출할 큐레이션 보이스 ID(쉼표 구분). 비우면
    # voices.py 의 DEFAULT_CURATED_VOICE_IDS(한국어 강의용 기본 20종) 사용.
    # "차차 추가" 시 이 환경변수에 ID 를 덧붙이면 코드 배포 없이 목록 확장.
    CURATED_VOICE_IDS: str = ""

    # ── TTS: Google Cloud (fallback) ────────────────────────────
    GOOGLE_TTS_CREDENTIALS_JSON: str = ""
    GOOGLE_TTS_LANGUAGE_CODE: str = "ko-KR"
    GOOGLE_TTS_VOICE_NAME: str = "ko-KR-Neural2-A"

    # ── AWS S3 ──────────────────────────────────────────────────
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_REGION: str = "ap-northeast-2"
    S3_BUCKET: str = "ifl-platform-videos"
    S3_PREFIX: str = "heygen/"
    S3_PPT_PREFIX: str = "ppt/"
    S3_PRESIGNED_EXPIRATION: int = 3600  # presigned URL 만료 시간 (초)
    BACKUP_S3_PREFIX: str = "backups/"  # 일일 DB 백업 저장 prefix

    # ── Celery / Redis ──────────────────────────────────────────
    CELERY_BROKER_URL: str = "redis://redis:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://redis:6379/0"
    # 렌더 전용 큐 분리(선택). True 면 영상 렌더·아바타 생성 같은 I/O 위주 태스크를
    # 별도 큐(RENDER_QUEUE_NAME)로 보내, 전용 워커가 고동시성으로 처리하게 한다.
    # Claude 호출 태스크(스크립트 생성 등)는 기본 큐에 남겨 저동시성으로 Anthropic
    # 동시 연결 한도(~5)를 지킨다. **기본 False — 코드만 머지하면 동작 불변(전 태스크
    # 기본 큐).** ⚠️ True 로 켜기 전에 반드시 그 큐를 소비하는 워커가 떠 있어야 한다
    # (기본 워커를 `-Q celery,render` 로 두거나 전용 render 워커 추가). 안 그러면
    # 렌더가 큐에 조용히 적체된다. 자세한 절차는 docs/RAILWAY_DEPLOY.md.
    RENDER_QUEUE_ENABLED: bool = False
    RENDER_QUEUE_NAME: str = "render"

    # ── 알림 / 폴링 ────────────────────────────────────────────
    NOTIFICATION_WEBHOOK_URL: str = ""
    POLLING_INTERVAL_SECONDS: int = 600

    # ── 렌더 신뢰성 (멈춤 자동 복구) ─────────────────────────────
    # 워커 재시작·크래시·네트워크 단절로 render_slide 가 끝내지 못하면 행이
    # TTS 진행(또는 pending/uploading) 상태에 갇혀 슬라이드쇼가 영구 멈춘다.
    # task_acks_late + Redis 라 재전달은 visibility_timeout(기본 1h) 뒤에야 일어나
    # UX 상 "오류 없이 멈춤"으로 보인다. reaper(아래)가 updated_at 이 이 임계를
    # 넘긴 비종료 렌더를 pending 으로 되돌려 render_slide 를 재큐잉한다.
    # 슬라이드 1장 TTS 는 통상 수 초~수십 초라 20분 정체면 확실히 멈춘 것.
    # rendering(HeyGen 대기)은 poll_pending_renders + HeyGen 24h 타임아웃이
    # 따로 다루므로 reaper 대상에서 제외한다(이중 제출 방지).
    RENDER_STUCK_MINUTES: int = 20
    # render_slide 작업별 시간 제한(초). soft 는 catch 가능한 예외(→ 재시도),
    # hard 는 워커 자식 프로세스 강제 종료. TTS 클라이언트 타임아웃(120s)+재시도+
    # 후처리를 덮되 무한 hang 은 끊도록 보수적으로 둔다. 전역(task_time_limit)으로
    # 두지 않는 이유: mp4 합성·QA 야간 배치 등 정상적으로 긴 태스크를 죽일 수 있어
    # render_slide 에만 건다.
    RENDER_SLIDE_SOFT_TIME_LIMIT_SECONDS: int = 300
    RENDER_SLIDE_TIME_LIMIT_SECONDS: int = 360

    # ── 집중 경고 ───────────────────────────────────────────────
    ATTENTION_HEARTBEAT_INTERVAL_SECONDS: int = 10
    ATTENTION_NO_RESPONSE_TIMEOUT_SECONDS: int = 30

    # ── 번역 ────────────────────────────────────────────────────
    DEEPL_API_KEY: str = ""

    # ── Stripe 결제 ──────────────────────────────────────────────
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_PRICE_BASIC: str = ""   # Stripe Price ID for BASIC plan
    STRIPE_PRICE_PRO: str = ""     # Stripe Price ID for PRO plan

    # ── pgvector ──────────────────────────────────────────────────
    # 학생 실시간 Q&A 범위 게이트(is_in_scope). 0.7 은 정상 강의 질문(유사도
    # 0.5~0.65)까지 거부해 0.4 로 낮춘다(사용자 결정 — 강의 내용 질문은 답변되어야
    # 함). seed 답변 경로는 게이트 미적용. Railway 환경변수로도 덮어쓸 수 있다.
    SIMILARITY_THRESHOLD: float = 0.4

    # ── Sentry ──────────────────────────────────────────────────
    SENTRY_DSN: str = ""
    SENTRY_TRACES_SAMPLE_RATE: float = 0.1  # 프로덕션 트레이싱 10%

    # ── 베타 초대제 (교수자 가입 게이트) ─────────────────────────
    # 계정주(운영자) 이메일 목록 — 교수자 초대 링크를 발급할 수 있는 사람.
    # 쉼표 구분. 이 목록의 이메일을 가진 로그인 사용자는 role 과 무관하게
    # 초대 발급 화면(/owner/invites)과 /api/owner/invites/* 를 쓸 수 있다.
    # (베타 동안 신규 교수자 가입은 이 사람이 보낸 초대 링크로만 가능.)
    ADMIN_EMAILS: str = "classauto101@gmail.com"
    # 교수자 초대 링크 유효기간(일). 0 이면 무기한.
    PROFESSOR_INVITE_TTL_DAYS: int = 14

    # ── Frontend ────────────────────────────────────────────────
    FRONTEND_URL: str = "http://localhost:3000"
    # FRONTEND_URL 외 추가 허용 CORS origin(쉼표 구분) — apex/www/커스텀 도메인 등.
    # 예: "https://classauto.live,https://www.classauto.live"
    CORS_EXTRA_ORIGINS: str = ""
    # Vercel 프리뷰 배포(https://*.vercel.app) 허용 — 프리뷰에서 API 테스트 시 필요.
    CORS_ALLOW_VERCEL_PREVIEWS: bool = False

    @property
    def admin_email_set(self) -> set[str]:
        """ADMIN_EMAILS(쉼표 구분)를 소문자 set 으로 정규화 — 운영자 식별용."""
        return {e.strip().lower() for e in self.ADMIN_EMAILS.split(",") if e.strip()}

    @property
    def analytics_pro_allowed_email_set(self) -> set[str]:
        """ANALYTICS_PRO_ALLOWED_EMAILS(쉼표 구분)를 소문자 set 으로 — 실기능 허용 이메일."""
        return {e.strip().lower() for e in self.ANALYTICS_PRO_ALLOWED_EMAILS.split(",") if e.strip()}


settings = Settings()


# 프로덕션에서 비어 있으면 부팅을 막을 필수 키.
# 핵심 파이프라인(스크립트·영상·룩·임베딩·저장)이 키 하나만 비어도 조용히
# 죽기 때문에, 경고가 아니라 부팅 크래시로 즉시 드러나게 한다(실패는 시끄럽게).
# 1단계(베타 무료 배포)는 결제 비활성화 — STRIPE_* 는 제외. 결제 엔드포인트는
# STRIPE_SECRET_KEY 가 비어 있으면 런타임에 503 으로 차단된다
# (app/api/v1/payment.py 의 _require_stripe). Phase 7 유료 전환 시 추가.
_REQUIRED_IN_PROD = [
    "HEYGEN_WEBHOOK_SECRET",
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",      # 임베딩(RAG)·gpt-image 룩 생성
    "HEYGEN_API_KEY",      # 아바타 영상 렌더
    "S3_BUCKET",           # PPT·썸네일·룩 이미지 저장
    "AWS_ACCESS_KEY_ID",   # S3 자격증명
    "AWS_SECRET_ACCESS_KEY",
]

# 키 자리에 그대로 남은 템플릿 placeholder — 비어 있지 않아 종전 검증을 통과한 뒤
# 런타임 401 로 조용히 실패하던 것을 부팅에서 차단한다(.env.production 의 CHANGE_ME 등).
# 주의: 너무 일반적인 패턴(예: "XXXXX")은 정상 시크릿("x"*32 등)을 오탐하므로
# 템플릿에서만 쓰이는 구체적 마커로 한정한다.
_PLACEHOLDER_MARKERS = ("CHANGE_ME", "CHANGE-ME", "CHANGEME", "YOUR_", "YOUR-", "PLACEHOLDER")


def _looks_like_placeholder(value: str) -> bool:
    upper = value.strip().upper()
    return any(marker in upper for marker in _PLACEHOLDER_MARKERS)


def _validate_settings() -> None:
    """프로덕션 환경에서 필수 설정값 검증."""
    if settings.ENVIRONMENT == "production":
        if settings.JWT_SECRET_KEY == "change-me-in-production":
            raise RuntimeError("프로덕션에서 JWT_SECRET_KEY를 반드시 변경해야 합니다.")
        if len(settings.JWT_SECRET_KEY) < 32:
            raise RuntimeError("JWT_SECRET_KEY는 최소 32자 이상이어야 합니다.")
        if settings.JWT_ALGORITHM != "HS256":
            raise RuntimeError("JWT_ALGORITHM은 HS256만 허용됩니다.")
        if not settings.GOOGLE_OAUTH_CLIENT_ID or not settings.GOOGLE_OAUTH_CLIENT_SECRET:
            raise RuntimeError("프로덕션에서 Google OAuth 설정은 필수입니다.")
        if _looks_like_placeholder(settings.JWT_SECRET_KEY):
            raise RuntimeError("JWT_SECRET_KEY 가 placeholder 값입니다 — 실제 시크릿으로 교체하세요.")

        # 빈 문자열·공백만 들어간 값도 누락으로 간주 — pydantic 의 default ""
        # 가 환경변수로 무심코 덮어써졌을 때 production 에서 사일런트 통과 차단.
        missing = [
            k for k in _REQUIRED_IN_PROD
            if not (getattr(settings, k) or "").strip()
        ]
        if missing:
            raise RuntimeError(f"프로덕션 필수 환경변수 누락: {missing}")

        # 비어있진 않지만 CHANGE_ME 류 placeholder 가 남은 키 — 런타임 401 전에 차단.
        placeholders = [
            k for k in _REQUIRED_IN_PROD
            if _looks_like_placeholder(getattr(settings, k) or "")
        ]
        if placeholders:
            raise RuntimeError(
                f"프로덕션 필수 환경변수에 placeholder 값이 남아 있습니다: {placeholders}"
            )

        # 키 형식 sanity — 잘못 붙여넣은 키를 조기에 잡는다. 프록시/Azure 등 변형을
        # 막지 않도록 하드 실패가 아니라 경고만 한다.
        if settings.ANTHROPIC_API_KEY and not settings.ANTHROPIC_API_KEY.startswith("sk-ant-"):
            logger.warning("ANTHROPIC_API_KEY 형식이 'sk-ant-' 로 시작하지 않습니다 — 키를 확인하세요.")
        if settings.OPENAI_API_KEY and not settings.OPENAI_API_KEY.startswith("sk-"):
            logger.warning("OPENAI_API_KEY 형식이 'sk-' 로 시작하지 않습니다 — 키를 확인하세요.")

    # 개발/프로덕션 공통: 핵심 API 키 경고
    missing_keys = []
    if not settings.ANTHROPIC_API_KEY:
        missing_keys.append("ANTHROPIC_API_KEY")
    if not settings.OPENAI_API_KEY:
        missing_keys.append("OPENAI_API_KEY")
    if missing_keys:
        logger.warning("필수 API 키 미설정: %s — 관련 기능이 작동하지 않습니다.", ", ".join(missing_keys))


_validate_settings()
