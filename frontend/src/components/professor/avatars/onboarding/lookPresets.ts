/**
 * Design with AI "스타일 샘플" 룩 갤러리 카탈로그 (실사 이미지 + 복장·배경 분류).
 *
 * 교수자가 HeyGen Design with AI 로 만든 실제 룩 썸네일을 복장·배경 두 축으로
 * 필터링해 고른다. 카드를 누르면 해당 스타일 프롬프트가 채워지고 바로 생성된다.
 * 썸네일은 public/avatar-looks/<id>.jpg (HeyGen 결과물 크롭). 플랫폼이 한국어
 * 우선이라 label·prompt 는 데이터에 한국어로 둔다(34종 i18n 분리 비용 회피).
 */

export type LookClothing = "suit" | "shirt" | "tee" | "hoodie";
export type LookBackground = "studio" | "study" | "lab" | "lecture" | "lounge" | "cafe";

export interface LookPreset {
  id: string;
  image: string;
  clothing: LookClothing;
  background: LookBackground;
  label: string;
  prompt: string;
}

/** 복장 필터 옵션(표시 순서). */
export const CLOTHING_OPTIONS: { key: LookClothing; label: string }[] = [
  { key: "suit", label: "정장·블레이저" },
  { key: "shirt", label: "셔츠" },
  { key: "tee", label: "티셔츠" },
  { key: "hoodie", label: "후드티" },
];

/** 배경 필터 옵션(표시 순서). */
export const BACKGROUND_OPTIONS: { key: LookBackground; label: string }[] = [
  { key: "studio", label: "스튜디오" },
  { key: "study", label: "서재" },
  { key: "lab", label: "연구실" },
  { key: "lecture", label: "강의실" },
  { key: "lounge", label: "응접실" },
  { key: "cafe", label: "카페" },
];

export const LOOK_PRESETS: LookPreset[] = [
  {
    id: "look-01",
    image: "/avatar-looks/look-01.jpg",
    clothing: "shirt",
    background: "study",
    label: "갈색 셔츠 · 서재",
    prompt: "책장이 있는 서재 배경, 갈색 셔츠 차림, 정면 상반신"
  },
  {
    id: "look-02",
    image: "/avatar-looks/look-02.jpg",
    clothing: "shirt",
    background: "lecture",
    label: "검은 셔츠 · 강의실",
    prompt: "밝은 강의실 배경, 검은 셔츠 차림, 정면 상반신"
  },
  {
    id: "look-03",
    image: "/avatar-looks/look-03.jpg",
    clothing: "shirt",
    background: "study",
    label: "검은 셔츠 · 서재",
    prompt: "책장이 있는 서재 배경, 검은 셔츠 차림, 정면 상반신"
  },
  {
    id: "look-04",
    image: "/avatar-looks/look-04.jpg",
    clothing: "shirt",
    background: "studio",
    label: "검은 셔츠 · 스튜디오",
    prompt: "밝은 스튜디오 배경, 검은 셔츠 차림, 정면 상반신"
  },
  {
    id: "look-05",
    image: "/avatar-looks/look-05.jpg",
    clothing: "shirt",
    background: "studio",
    label: "검은 셔츠 · 스튜디오 2",
    prompt: "밝은 스튜디오 배경, 검은 셔츠 차림, 정면 상반신"
  },
  {
    id: "look-06",
    image: "/avatar-looks/look-06.jpg",
    clothing: "shirt",
    background: "studio",
    label: "검은 셔츠 · 스튜디오 3",
    prompt: "밝은 스튜디오 배경, 검은 셔츠 차림, 정면 상반신"
  },
  {
    id: "look-07",
    image: "/avatar-looks/look-07.jpg",
    clothing: "shirt",
    background: "studio",
    label: "검은 셔츠 · 스튜디오 4",
    prompt: "밝은 스튜디오 배경, 검은 셔츠 차림, 정면 상반신"
  },
  {
    id: "look-08",
    image: "/avatar-looks/look-08.jpg",
    clothing: "shirt",
    background: "studio",
    label: "검은 셔츠 · 스튜디오 5",
    prompt: "밝은 스튜디오 배경, 검은 셔츠 차림, 정면 상반신"
  },
  {
    id: "look-09",
    image: "/avatar-looks/look-09.jpg",
    clothing: "shirt",
    background: "studio",
    label: "검은 셔츠 · 스튜디오 6",
    prompt: "밝은 스튜디오 배경, 검은 셔츠 차림, 정면 상반신"
  },
  {
    id: "look-10",
    image: "/avatar-looks/look-10.jpg",
    clothing: "shirt",
    background: "lab",
    label: "검은 셔츠 · 연구실",
    prompt: "밝은 연구실 배경, 검은 셔츠 차림, 정면 상반신"
  },
  {
    id: "look-11",
    image: "/avatar-looks/look-11.jpg",
    clothing: "shirt",
    background: "lab",
    label: "검은 셔츠 · 연구실 2",
    prompt: "밝은 연구실 배경, 검은 셔츠 차림, 정면 상반신"
  },
  {
    id: "look-12",
    image: "/avatar-looks/look-12.jpg",
    clothing: "shirt",
    background: "lab",
    label: "검은 셔츠 · 연구실 3",
    prompt: "밝은 연구실 배경, 검은 셔츠 차림, 정면 상반신"
  },
  {
    id: "look-13",
    image: "/avatar-looks/look-13.jpg",
    clothing: "shirt",
    background: "lounge",
    label: "검은 셔츠 · 응접실",
    prompt: "식물이 있는 응접실 배경, 검은 셔츠 차림, 정면 상반신"
  },
  {
    id: "look-14",
    image: "/avatar-looks/look-14.jpg",
    clothing: "shirt",
    background: "cafe",
    label: "검은 셔츠 · 카페",
    prompt: "분위기 있는 카페 배경, 검은 셔츠 차림, 정면 상반신"
  },
  {
    id: "look-15",
    image: "/avatar-looks/look-15.jpg",
    clothing: "hoodie",
    background: "studio",
    label: "검은 후드티 · 스튜디오",
    prompt: "밝은 스튜디오 배경, 검은 후드티 차림, 정면 상반신"
  },
  {
    id: "look-16",
    image: "/avatar-looks/look-16.jpg",
    clothing: "shirt",
    background: "study",
    label: "그레이 셔츠 · 서재",
    prompt: "책장이 있는 서재 배경, 그레이 셔츠 차림, 정면 상반신"
  },
  {
    id: "look-17",
    image: "/avatar-looks/look-17.jpg",
    clothing: "suit",
    background: "studio",
    label: "기본 정장 · 스튜디오",
    prompt: "밝은 회색 스튜디오 배경, 정장 차림, 정면 증명사진 구도"
  },
  {
    id: "look-18",
    image: "/avatar-looks/look-18.jpg",
    clothing: "shirt",
    background: "lounge",
    label: "녹색 셔츠 · 응접실",
    prompt: "식물이 있는 응접실 배경, 녹색 셔츠 차림, 정면 상반신"
  },
  {
    id: "look-19",
    image: "/avatar-looks/look-19.jpg",
    clothing: "tee",
    background: "studio",
    label: "베이지 티 · 스튜디오",
    prompt: "밝은 스튜디오 배경, 베이지 티 차림, 정면 상반신"
  },
  {
    id: "look-20",
    image: "/avatar-looks/look-20.jpg",
    clothing: "tee",
    background: "studio",
    label: "보라색 티 · 스튜디오",
    prompt: "밝은 스튜디오 배경, 보라색 티 차림, 정면 상반신"
  },
  {
    id: "look-21",
    image: "/avatar-looks/look-21.jpg",
    clothing: "suit",
    background: "lounge",
    label: "네이비 블레이저 · 응접실",
    prompt: "식물이 있는 밝은 응접실 배경, 네이비 블레이저에 흰 셔츠, 마이크, 정면 상반신"
  },
  {
    id: "look-22",
    image: "/avatar-looks/look-22.jpg",
    clothing: "shirt",
    background: "lounge",
    label: "오렌지 셔츠 · 응접실",
    prompt: "식물이 있는 응접실 배경, 오렌지 셔츠 차림, 정면 상반신"
  },
  {
    id: "look-23",
    image: "/avatar-looks/look-23.jpg",
    clothing: "suit",
    background: "lounge",
    label: "정장 · 응접실(마이크)",
    prompt: "밝은 응접실 배경, 정장 차림, 휴대용 마이크, 정면 상반신"
  },
  {
    id: "look-24",
    image: "/avatar-looks/look-24.jpg",
    clothing: "tee",
    background: "studio",
    label: "청색 티 · 스튜디오",
    prompt: "밝은 스튜디오 배경, 청색 티 차림, 정면 상반신"
  },
  {
    id: "look-25",
    image: "/avatar-looks/look-25.jpg",
    clothing: "shirt",
    background: "lounge",
    label: "초록 셔츠 · 응접실",
    prompt: "식물이 있는 응접실 배경, 초록 셔츠 차림, 정면 상반신"
  },
  {
    id: "look-26",
    image: "/avatar-looks/look-26.jpg",
    clothing: "tee",
    background: "lounge",
    label: "초록색 티 · 응접실",
    prompt: "식물이 있는 응접실 배경, 초록색 티 차림, 정면 상반신"
  },
  {
    id: "look-27",
    image: "/avatar-looks/look-27.jpg",
    clothing: "tee",
    background: "lounge",
    label: "초록색 티 · 응접실 2",
    prompt: "식물이 있는 응접실 배경, 초록색 티 차림, 정면 상반신"
  },
  {
    id: "look-28",
    image: "/avatar-looks/look-28.jpg",
    clothing: "tee",
    background: "studio",
    label: "검은 니트 · 팟캐스트 스튜디오",
    prompt: "따뜻한 조명의 팟캐스트 스튜디오 배경, 검은 니트 차림, 마이크, 정면 상반신"
  },
  {
    id: "look-29",
    image: "/avatar-looks/look-29.jpg",
    clothing: "suit",
    background: "lounge",
    label: "탄 블레이저 슈트 · 응접실",
    prompt: "식물이 있는 응접실 배경, 탄 블레이저 슈트 차림, 정면 상반신"
  },
  {
    id: "look-30",
    image: "/avatar-looks/look-30.jpg",
    clothing: "tee",
    background: "studio",
    label: "푸른 색 티 · 스튜디오",
    prompt: "밝은 스튜디오 배경, 푸른 색 티 차림, 정면 상반신"
  },
  {
    id: "look-31",
    image: "/avatar-looks/look-31.jpg",
    clothing: "shirt",
    background: "cafe",
    label: "푸른 셔츠 · 카페",
    prompt: "분위기 있는 카페 배경, 푸른 셔츠 차림, 정면 상반신"
  },
  {
    id: "look-32",
    image: "/avatar-looks/look-32.jpg",
    clothing: "shirt",
    background: "lecture",
    label: "하늘색 · 강의실",
    prompt: "밝은 강의실 배경, 하늘색 차림, 정면 상반신"
  },
  {
    id: "look-33",
    image: "/avatar-looks/look-33.jpg",
    clothing: "tee",
    background: "studio",
    label: "회색 티 · 스튜디오",
    prompt: "밝은 스튜디오 배경, 회색 티 차림, 정면 상반신"
  },
  {
    id: "look-34",
    image: "/avatar-looks/look-34.jpg",
    clothing: "hoodie",
    background: "studio",
    label: "후드티 · 스튜디오",
    prompt: "밝은 스튜디오 배경, 후드티 차림, 정면 상반신"
  }
];
