import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class UserRole(str, enum.Enum):
    professor = "professor"
    student = "student"
    admin = "admin"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    google_sub: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    role: Mapped[UserRole] = mapped_column(SAEnum(UserRole), nullable=False)
    # 교수자 전용
    school: Mapped[str | None] = mapped_column(String(200), nullable=True)
    department: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # 교수자가 업로드한 프로필 사진 (본인 아바타 소스)의 S3 https URL.
    profile_image_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    # 업로드한 사진으로 HeyGen 에 등록한 Talking Photo ID. 본인 모습으로 강의
    # 영상을 만들 때 heygen.create_video 의 talking_photo_id 로 쓴다. NULL =
    # 아직 본인 아바타 미등록 또는 생성 대기/실패.
    photo_avatar_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # 현재 photo_avatar_id(talking photo)가 어느 룩(photo_avatar_default_look_id)으로
    #   만들어졌는지. 같은 룩이면 재등록하지 않고 재사용하고, 룩이 바뀌면 이전
    #   talking photo 를 HeyGen 에서 삭제(슬롯 회수)한 뒤 새로 만든다 — HeyGen Photo
    #   Avatar 한도(흔히 3개) 누적 초과 방지(2026-06-04).
    photo_avatar_look_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # 본인 아바타 "움직이는 미리보기" — Talking Photo 로 1회 렌더한 짧은 샘플 영상.
    # photo_avatar_preview_url: 완성된 영상의 영구 S3 https URL (있으면 캐시 적중).
    # photo_avatar_preview_video_id: 렌더 진행 중인 HeyGen video_id (폴링 키).
    # photo_avatar_preview_voice_id: 그 미리보기를 렌더할 때 쓴 ElevenLabs voice_id
    #   (다른 음성으로 다시 만들기 판정용).
    # photo_avatar_preview_text: 그 미리보기를 렌더할 때 읽힌 대본(스크립트). 아바타
    #   페이지 "스크립트 테스트"가 임의 문장을 렌더하므로, 같은 (음성·대본) 조합은
    #   캐시 적중시키고 대본이 바뀌면 다시 렌더하도록 키로 쓴다. NULL = 기본 샘플
    #   문장(_PREVIEW_TEXT)으로 렌더된 캐시(과거 데이터 호환).
    photo_avatar_preview_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    photo_avatar_preview_video_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    photo_avatar_preview_voice_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    photo_avatar_preview_text: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    # 이 미리보기가 표준 아바타(등록한 Video Avatar)의 것이면 그 heygen avatar_id.
    # NULL = 포토 아바타(Talking Photo) 미리보기. 동일 슬롯을 두 종류가 공유하므로,
    # 캐시 적중 판정에 이 값을 키로 써서 표준 영상이 포토 미리보기로 잘못 나오지 않게 한다.
    photo_avatar_preview_avatar_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # 교수자가 본인 음성 샘플(mp3 등)로 만든 ElevenLabs Cloned Voice (IVC).
    # cloned_voice_id: ElevenLabs voice_id. 채워지면 GET /api/voices 계정 보이스로
    #   자동 노출돼 음성 패널·미리보기·강의 렌더에 본인 목소리로 쓸 수 있다. NULL =
    #   아직 본인 음성 미생성. 1인 1개(재업로드 시 교체).
    # cloned_voice_name: 표시 이름(예: "<이름> (본인 목소리)").
    # cloned_voice_sample_url: 업로드한 원본 음성 샘플의 S3 https URL(참조·재생성용).
    cloned_voice_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cloned_voice_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    cloned_voice_sample_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    # HeyGen v2 Photo Avatar(Design with AI 룩) — Talking Photo 의 상위 호환 경로.
    # photo_avatar_group_id: 사진으로 만든 avatar group id (룩 생성의 기반).
    # photo_avatar_group_status: "training"|"ready"|"failed" (학습 폴링 결과).
    # photo_avatar_default_look_id: 교수자가 고른 기본 룩의 avatar_id — 강의 렌더가
    #   lecture.avatar_id 가 없을 때 이 값으로 폴백한다(본인 얼굴을 모든 강의에).
    photo_avatar_group_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    photo_avatar_group_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # photo_avatar_group_error: status="failed" 일 때의 사유 분류 코드
    #   ("insufficient_credit"|"invalid_image"|"unknown"). 사용자에게 정확한 안내를
    #   고르기 위함 — 크레딧 부족을 "사진을 바꾸라"고 오안내하지 않도록.
    photo_avatar_group_error: Mapped[str | None] = mapped_column(String(40), nullable=True)
    photo_avatar_default_look_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # recent_avatar_id: 아바타 선택 페이지에서 교수자가 가장 최근에 고른 아바타/룩 id.
    #   표준 HeyGen avatar_id 또는 본인 룩 heygen_look_id(둘 다 렌더용 avatar_id 로 통용).
    #   다음 방문 시 "최근 선택한 아바타" 박스로 복원해 재생성 없이 바로 강의에 적용한다.
    #   기본 룩(photo_avatar_default_look_id, 모든 강의의 폴백)과는 별개의 "최근 선택" 기록.
    recent_avatar_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # VisionStory(본인 얼굴 렌더 제공자) 아바타 id — 사진으로 1회 생성해 재사용한다.
    #   매 렌더 재생성하지 않도록 캐시한다. visionstory_avatar_source 가 현재 소스
    #   이미지(기본 룩 id 또는 프로필 URL)와 다르면 호출부가 아바타를 재생성한다.
    visionstory_avatar_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # 위 avatar_id 를 만든 소스 식별자(룩 id 또는 프로필 이미지 URL). 사진이 바뀌면
    #   이 값과 달라져 자동 재생성된다(별도 무효화 훅 불필요).
    visionstory_avatar_source: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    # Q&A 답변 영상에 "본인 얼굴(Talking Photo)"을 쓸지 여부(옵트인). 기본 False —
    #   Q&A 는 표준 HeyGen 아바타로 렌더한다(HeyGen "사진 아바타 3개 한도"와 무관해
    #   사용자 수와 상관없이 막히지 않음). 교수자가 아바타 페이지에서 이 스위치를
    #   켜야만 본인 얼굴을 시도하고, 한도가 차 있으면 표준으로 폴백한다(2026-06-14).
    #   강의 본편(슬라이드쇼)은 아바타를 쓰지 않으므로 영향 없음 — 이 플래그는 Q&A 전용.
    qa_use_own_face: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    # 학습자 전용
    student_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # 첫 사용 온보딩(영상 시청 4슬라이드 안내)을 "다시 보지 않기" 한 시각. NULL =
    # 아직 안 함(진입 시 안내 표시). 값이 있으면 영구 스킵. localStorage 금지라 서버 저장.
    onboarded_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # 베타 코호트 태그(예: "2026-08", "2026-09"). 교수자는 초대의 cohort 를 가입 시
    # 복사받는다(services/invite + auth). NULL = 미분류. 운영자 콘솔의 코호트 필터·
    # 이탈 분석에 쓴다.
    cohort: Mapped[str | None] = mapped_column(String(40), nullable=True)
    # 베타 모니터링 동의(PIPA) 시각. 교수자 가입 시 동의 체크 시 기록한다. NULL =
    # 미동의(베타 동안 교수자는 동의 없이는 가입 불가 — 학생 흐름과 무관).
    beta_consented_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # 학습 분석 PRO(베타 전용 실기능, docs/planning/analytics-spec.md) 접근 토글.
    # 운영자 콘솔(/admin/users)에서 베타테스터별로 켜고 끈다. 기본 False = 미허용.
    # 게이트는 deps.require_analytics_pro 가 본 플래그 + 전역 ANALYTICS_PRO_ENABLED 로
    # 판정하며, 운영자(ADMIN_EMAILS)는 플래그와 무관하게 항상 접근 가능하다.
    analytics_pro_enabled: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
