/**
 * Design with AI "스타일 샘플" 룩 갤러리의 데이터 카탈로그.
 *
 * 텍스트 칩 4개(looks.preset1~4) 대신, 결과를 눈으로 가늠할 수 있는 샘플
 * 이미지 갤러리로 교체한다(HeyGen 스타일). 카드를 누르면 해당 스타일의
 * 프롬프트가 채워지고 바로 룩 생성이 시작된다.
 *
 * 데이터 주도 설계 — 어떤 스타일이 있는지/순서/썸네일 경로는 여기에서만
 * 정의한다. label·prompt 는 로케일(ko/en)에 따라 달라지므로 i18n 키
 * (``looks.presets.<id>.label`` / ``looks.presets.<id>.prompt``) 로 분리한다.
 *
 * 썸네일은 ``frontend/public/avatar-looks/<id>.svg`` 의 폴백 미리보기다
 * (라이트 베이지 배경 + 골드 톤 그라데이션, design-system v2). 실제 대표
 * 사진이 준비되면 **같은 경로의 파일만 교체**하면 코드 변경 없이 바뀐다.
 */

export interface LookPreset {
  /** 안정적 식별자 = 썸네일 파일명 = i18n 하위 키. */
  id: string;
  /** public 기준 절대 경로의 썸네일 (`/avatar-looks/<id>.svg`). 사진으로 교체 가능. */
  image: string;
  /** 카드 라벨 i18n 키 (예: `looks.presets.studio-navy.label`). */
  labelKey: string;
  /** 생성 프롬프트 i18n 키 (textarea 에 채워지고 백엔드로 전송). */
  promptKey: string;
}

/** 썸네일 경로 + i18n 키를 id 한 곳에서 파생해 표기 오류를 줄인다. */
function preset(id: string): LookPreset {
  return {
    id,
    image: `/avatar-looks/${id}.svg`,
    labelKey: `looks.presets.${id}.label`,
    promptKey: `looks.presets.${id}.prompt`,
  };
}

/**
 * 8개 스타일 프리셋. 배경 톤·복장 다양성을 의도적으로 분산해 결과를 가늠할
 * 수 있게 한다. (밝은 회색·네이비 / 따뜻한 베이지·가디건 / 짙은 배경·정장 ·
 * 넥타이 / 연구실·셔츠 / 서재·블레이저 …)
 */
export const LOOK_PRESETS: LookPreset[] = [
  preset("studio-navy"),
  preset("warm-cardigan"),
  preset("formal-tie"),
  preset("lab-shirt"),
  preset("study-blazer"),
  preset("lecture-casual"),
  preset("bookshelf-knit"),
  preset("classic-portrait"),
];
