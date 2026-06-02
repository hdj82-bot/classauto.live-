/**
 * v0.2 구조화 룩 옵션 카탈로그 (gpt-image-2 / Photo Avatar §0).
 *
 * 자유 프롬프트 프리셋(v0.1 lookPresets) 대신, 계약(schemas/avatar.py)의 4개
 * enum 을 그대로 노출한다. 키는 백엔드 ``openai_image.build_prompt`` 의 매핑
 * 키와 **1:1** 이어야 하므로 임의로 추가/변경하지 않는다. 라벨은 플랫폼
 * 한국어 우선 정책상 데이터에 한국어로 둔다(소수 enum → i18n 분리 비용 회피).
 *
 * persona 는 필수, 나머지(outfit/background/expression)는 선택(null=백엔드 자동
 * 추론). ``RECOMMENDED`` 는 persona 선택 시 채워줄 합리적 기본 조합이다.
 */
import type {
  BackgroundKey,
  ExpressionKey,
  LookGenerateInput,
  OutfitKey,
  PersonaKey,
  PoseKey,
  PropKey,
} from "./photoAvatarTypes";

export interface Option<K extends string> {
  key: K;
  label: string;
}

/** 페르소나(필수). 기본 educator. */
export const PERSONA_OPTIONS: Option<PersonaKey>[] = [
  { key: "educator", label: "친근한 교수자" },
  { key: "researcher", label: "연구자" },
  { key: "mentor", label: "멘토" },
  { key: "podcast_host", label: "팟캐스트 진행자" },
];

/** 복장(선택). */
export const OUTFIT_OPTIONS: Option<OutfitKey>[] = [
  { key: "suit", label: "정장" },
  { key: "blazer", label: "블레이저" },
  { key: "shirt", label: "셔츠" },
  { key: "knit", label: "니트" },
  { key: "tee", label: "티셔츠" },
  { key: "hoodie", label: "후드티" },
];

/** 배경(선택). */
export const BACKGROUND_OPTIONS: Option<BackgroundKey>[] = [
  { key: "lecture", label: "강의실" },
  { key: "lab", label: "연구실" },
  { key: "study", label: "서재" },
  { key: "studio", label: "스튜디오" },
  { key: "lounge", label: "응접실" },
  { key: "cafe", label: "카페" },
];

/** 표정(선택). */
export const EXPRESSION_OPTIONS: Option<ExpressionKey>[] = [
  { key: "neutral", label: "차분" },
  { key: "friendly", label: "친근" },
  { key: "warm", label: "따뜻" },
  { key: "confident", label: "자신감" },
  { key: "thoughtful", label: "사려깊음" },
];

/** 소품(선택, null=없음). v0.3. */
export const PROP_OPTIONS: Option<PropKey>[] = [
  { key: "mic_stand", label: "스탠드 마이크" },
];

/** 손·팔 자세(선택, null=자동). v0.3. */
export const POSE_OPTIONS: Option<PoseKey>[] = [
  { key: "crossed_arms", label: "팔짱" },
  { key: "gesturing", label: "말하는 제스처" },
  { key: "holding_mic", label: "마이크 잡기" },
  { key: "relaxed_at_sides", label: "자연스럽게" },
];

/** persona 선택 시 채워줄 추천 기본 조합(사용자는 이후 자유 변경 가능). */
export const RECOMMENDED: Record<
  PersonaKey,
  { outfit: OutfitKey; background: BackgroundKey; expression: ExpressionKey }
> = {
  educator: { outfit: "blazer", background: "lecture", expression: "friendly" },
  researcher: { outfit: "shirt", background: "lab", expression: "thoughtful" },
  mentor: { outfit: "knit", background: "study", expression: "warm" },
  podcast_host: { outfit: "tee", background: "studio", expression: "confident" },
};

/** key→한국어 라벨 빠른 조회(라벨은 위 OPTIONS 가 단일 출처). */
function labelOf<K extends string>(options: Option<K>[], key: K | null | undefined): string | null {
  if (!key) return null;
  return options.find((o) => o.key === key)?.label ?? null;
}

/**
 * 생성 입력 → 사람이 읽는 한국어 카테고리 조합 라벨.
 * 예: { persona:"podcast_host", outfit:"tee", background:"studio", expression:"confident" }
 *   → "팟캐스트 진행자 · 티셔츠 · 스튜디오 · 자신감".
 * persona 는 항상 포함하고, 자동(null)인 항목은 건너뛴다. 영어 프롬프트를 화면에
 * 노출하지 않기 위한 표시용 라벨(2026-06-02 사용자 요청).
 */
export function categoryLabel(input: LookGenerateInput): string {
  return [
    labelOf(PERSONA_OPTIONS, input.persona),
    labelOf(OUTFIT_OPTIONS, input.outfit),
    labelOf(BACKGROUND_OPTIONS, input.background),
    labelOf(EXPRESSION_OPTIONS, input.expression),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** persona 의 추천 조합으로 초기 입력을 만든다. */
export function defaultInputFor(persona: PersonaKey): LookGenerateInput {
  const r = RECOMMENDED[persona];
  return {
    persona,
    outfit: r.outfit,
    background: r.background,
    expression: r.expression,
    extra: null,
  };
}
