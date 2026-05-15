/**
 * Lecture Creation prototype — data tables.
 * Ported verbatim from docs/prototypes/05-lecture-creation.extracted.html
 * (main <script>) and the two bundled scripts (gallery + interview).
 */

export const han = (c: string) => `<span class="han">${c}</span>`;

export interface Slide {
  n: number;
  title: string;
  status: "warn" | "adopted" | "empty";
  hanThumb: string;
  badge: string;
  heading: string;
  sub: string;
  body: string;
  orig: string;
  ai: string;
  meta: string;
}

export const SLIDES: Slide[] = [
  {
    n: 1,
    title: "把자문 도입",
    status: "warn",
    hanThumb: "导",
    badge: "SLIDE 01 · 도입",
    heading: `오늘의 주제 — ${han("把")}자문`,
    sub: "처치(處置) 의미의 강조 구문",
    body: `<div class="col-card" style="grid-column: span 2">
          <div class="lbl">학습 목표</div>
          <div class="val" style="font-family: var(--font-sans); font-size: 13px; font-weight: 500; color: var(--text-muted)">把자문의 의미·어순·사용 조건을 이해하고, 실제 문장에 적용할 수 있다.</div>
        </div>`,
    orig: `${han("把")}자문 = 처치 의미를 강조하는 중국어 특수 구문`,
    ai: `안녕하세요. 오늘은 중국어 문법 중에서도 학습자들이 가장 어려워하는 ${han("把")}자문에 대해 알아보겠습니다. ${han("把")}자문은 처치 의미를 강조할 때 사용하는 특수 구문이에요. 어순이 일반 SVO와 다르기 때문에 처음 보면 낯설게 느껴질 수 있지만, 핵심 개념만 잡으면 어렵지 않습니다.`,
    meta: "예상 38초 · 142자",
  },
  {
    n: 2,
    title: "把자문의 의미",
    status: "adopted",
    hanThumb: "义",
    badge: "SLIDE 02 · 의미",
    heading: `${han("把")}자문이란 무엇인가`,
    sub: "동작의 대상을 처치(處置)하는 의미",
    body: `<div class="col-card">
          <div class="lbl">구조</div>
          <div class="val">주어 + ${han("把")} + 명사</div>
        </div>
        <div class="col-card">
          <div class="lbl">의미</div>
          <div class="val" style="font-family: var(--font-sans); font-size: 14px">처치 대상 + 동작</div>
        </div>`,
    orig: `${han("把")} + 명사 = 동작의 대상 (처치 대상)`,
    ai: `${han("把")}자문에서 핵심은 '처치(處置)'라는 개념입니다. ${han("把")} 뒤에 오는 명사는 동작의 대상, 즉 누군가가 어떻게 처리하는 그 대상을 의미해요. 그래서 단순한 행위가 아니라 "대상에 작용을 가해 결과를 만든다"는 느낌이 강하게 드러납니다.`,
    meta: "예상 42초 · 168자",
  },
  {
    n: 3,
    title: "어순 비교",
    status: "adopted",
    hanThumb: "序",
    badge: "SLIDE 03 · 어순 비교",
    heading: `${han("把")}자문은 어순이 다릅니다`,
    sub: `일반 SVO 어순과 달리 ${han("把")}를 사용하면 목적어가 동사 앞으로 이동합니다.`,
    body: `<div class="col-card">
          <div class="lbl">일반 SVO</div>
          <div class="val">他 看完 书 了</div>
        </div>
        <div class="col-card">
          <div class="lbl">${han("把")}자문</div>
          <div class="val">他 ${han("把")}书 看完 了</div>
        </div>`,
    orig: `${han("把")}자문은 처치 의미를 강조하는 구문. 목적어가 동사 앞으로 이동. 처치 대상은 한정적·특정적.`,
    ai: `이번에는 ${han("把")}자문의 어순을 자세히 살펴보겠습니다. 일반적으로 중국어는 주어-동사-목적어(SVO) 어순을 따르지만, ${han("把")}자문은 목적어를 동사 앞으로 끌어당겨 "처치(處置)"의 의미를 강조하는 구조예요. 예를 들어 "他看完书了"는 단순한 SVO 어순이지만, "他${han("把")}书看完了"라고 하면 동작의 완결성·영향이 분명하게 드러납니다.`,
    meta: "예상 1분 24초 · 312자",
  },
  {
    n: 4,
    title: "把의 문법적 기능",
    status: "warn",
    hanThumb: "功",
    badge: "SLIDE 04 · 문법 기능",
    heading: `${han("把")}의 문법적 역할`,
    sub: "전치사(介词)로서의 把",
    body: `<div class="col-card" style="grid-column: span 2">
          <div class="lbl">품사 / 기능</div>
          <div class="val" style="font-family: var(--font-sans); font-size: 13.5px; font-weight: 500; color: var(--text-muted); line-height: 1.5">전치사 · 목적어를 동사 앞으로 끌어와 처치 의미 형성</div>
        </div>`,
    orig: `${han("把")}는 전치사. 목적어를 동사 앞으로 끌어옴.`,
    ai: `${han("把")}는 전치사입니다. 일반적으로 동사 뒤에 오는 목적어를 동사 앞으로 끌어내는 역할을 하지요. 이 어순 변화가 처치 의미를 만들어냅니다. 한국어로 직역하면 어색할 수 있지만, 중국어 화자에게는 "그 대상을 어떻게 처리했다"는 결과 중심 표현으로 자연스럽게 받아들여져요.`,
    meta: "예상 48초 · 186자",
  },
  {
    n: 5,
    title: "把자문 예시",
    status: "adopted",
    hanThumb: "例",
    badge: "SLIDE 05 · 예시",
    heading: "실제 사용 예시 3가지",
    sub: "처치 결과가 명확한 동작에 사용",
    body: `<div class="col-card" style="grid-column: span 2">
          <div class="val" style="font-size: 15px">我 ${han("把")}书 放在桌子上 了</div>
          <div class="lbl" style="margin-top: 3px; font-family: var(--font-sans); text-transform: none; letter-spacing: 0; color: var(--text-muted); font-weight: 500; font-size: 11.5px">책을 책상 위에 두었다</div>
        </div>
        <div class="col-card">
          <div class="val">他 ${han("把")}饭 吃完 了</div>
          <div class="lbl" style="margin-top: 3px; font-family: var(--font-sans); text-transform: none; letter-spacing: 0; color: var(--text-muted); font-weight: 500; font-size: 11.5px">밥을 다 먹었다</div>
        </div>
        <div class="col-card">
          <div class="val">妈妈 ${han("把")}房间 打扫干净 了</div>
          <div class="lbl" style="margin-top: 3px; font-family: var(--font-sans); text-transform: none; letter-spacing: 0; color: var(--text-muted); font-weight: 500; font-size: 11.5px">방을 깨끗이 청소했다</div>
        </div>`,
    orig: `처치 결과가 명확한 동작에 사용.`,
    ai: `몇 가지 예시를 보겠습니다. "我${han("把")}书放在桌子上了"는 "책을 책상 위에 두었다"는 의미예요. 책이라는 대상을 어떻게 처치했는지, 즉 "책상 위에 두었다"는 결과가 명확하죠. 다른 예시들도 모두 동작의 결과가 분명히 드러난다는 공통점이 있습니다.`,
    meta: "예상 56초 · 218자",
  },
  {
    n: 6,
    title: "사용 조건",
    status: "adopted",
    hanThumb: "件",
    badge: "SLIDE 06 · 사용 조건",
    heading: `${han("把")}자문 사용 조건`,
    sub: "세 가지가 모두 충족되어야 합니다",
    body: `<div class="col-card" style="grid-column: span 2">
          <div class="lbl" style="color: var(--gold)">① 동작의 결과가 명확할 것</div>
        </div>
        <div class="col-card" style="grid-column: span 2">
          <div class="lbl" style="color: var(--gold)">② 처치할 수 있는 구체적 대상일 것</div>
        </div>
        <div class="col-card" style="grid-column: span 2">
          <div class="lbl" style="color: var(--gold)">③ 동사 뒤에 보어 또는 조사가 와야 함</div>
        </div>`,
    orig: `추상명사·결과 불분명한 동작에는 사용 불가.`,
    ai: `${han("把")}자문은 아무 때나 쓸 수 있는 게 아니에요. 세 가지 조건이 필요합니다. 동작의 결과가 분명하고, 처치할 수 있는 구체적 대상이며, 동사 뒤에 보어나 조사가 따라와야 해요. 추상명사이거나 결과가 불분명한 동작에는 ${han("把")}자문을 쓸 수 없습니다.`,
    meta: "예상 54초 · 210자",
  },
  {
    n: 7,
    title: "흔한 오류",
    status: "warn",
    hanThumb: "误",
    badge: "SLIDE 07 · 흔한 오류",
    heading: "한국 학습자의 흔한 실수",
    sub: "동사 뒤 보어·조사 누락",
    body: `<div class="col-card" style="grid-column: span 2; border-color: rgba(239,68,68,0.30); background: rgba(239,68,68,0.04)">
          <div class="lbl" style="color: #B91C1C">✗ 틀린 예</div>
          <div class="val">我 ${han("把")}汉语 学</div>
        </div>
        <div class="col-card" style="grid-column: span 2; border-color: rgba(16,185,129,0.30); background: rgba(16,185,129,0.04)">
          <div class="lbl" style="color: #047857">✓ 맞는 예</div>
          <div class="val">我 ${han("把")}汉语 学好 了</div>
        </div>`,
    orig: `동사 뒤에 보어·조사 누락이 가장 흔한 오류.`,
    ai: `한국 학습자들이 가장 많이 하는 실수는 ${han("把")}자문에서 동사 뒤에 보어나 조사를 빠뜨리는 거예요. ${han("把")} 뒤에 동사만 달랑 쓰면 비문이 됩니다. 학습 후 "학(學)"이라는 단순 동사 대신, "学好了"처럼 결과를 나타내는 보어와 조사를 함께 써주세요.`,
    meta: "예상 50초 · 196자",
  },
  {
    n: 8,
    title: "마무리",
    status: "adopted",
    hanThumb: "终",
    badge: "SLIDE 08 · 정리",
    heading: "오늘 배운 내용 정리",
    sub: "다음 시간: 被자문(피동문)",
    body: `<div class="col-card">
          <div class="lbl">핵심 1</div>
          <div class="val" style="font-family: var(--font-sans); font-size: 13px; font-weight: 600; color: var(--text)">${han("把")}자문 = 처치 의미</div>
        </div>
        <div class="col-card">
          <div class="lbl">핵심 2</div>
          <div class="val" style="font-family: var(--font-sans); font-size: 13px; font-weight: 600; color: var(--text)">${han("把")} 뒤 = 동작 대상</div>
        </div>
        <div class="col-card">
          <div class="lbl">핵심 3</div>
          <div class="val" style="font-family: var(--font-sans); font-size: 13px; font-weight: 600; color: var(--text)">사용 조건 3가지</div>
        </div>
        <div class="col-card">
          <div class="lbl">핵심 4</div>
          <div class="val" style="font-family: var(--font-sans); font-size: 13px; font-weight: 600; color: var(--text)">보어·조사 필수</div>
        </div>`,
    orig: `다음 시간: 被자문(피동문).`,
    ai: `오늘 배운 ${han("把")}자문, 정리해볼게요. ${han("把")}자문은 처치 의미를 강조하는 구문이고, ${han("把")} 뒤에는 동작의 대상이 옵니다. 사용하려면 세 가지 조건을 만족해야 하고, 동사 뒤에는 반드시 보어나 조사를 붙여주세요. 다음 시간에는 ${han("把")}자문과 짝을 이루는 被자문, 즉 피동문을 다루겠습니다.`,
    meta: "예상 1분 12초 · 286자",
  },
];

export interface Avatar {
  id: string;
  name: string;
  region: string;
  tags: string[];
  langs: string[];
  meta: string;
  rec: boolean;
  gradient: [string, string, string];
  skin: string;
  hair: string;
}

export const AVATARS: Avatar[] = [
  { id: "kim", name: "김교수 페르소나", region: "kr", tags: ["추천", "비즈니스"], langs: ["한국어", "中文"], meta: "비즈니스 캐주얼 · 한국어 발화 최적", rec: true, gradient: ["#FFB627", "#E89E0E", "#B88308"], skin: "#F4D8B8", hair: "#2A2520" },
  { id: "anderson", name: "Mr. Anderson", region: "us", tags: ["비즈니스"], langs: ["English"], meta: "영미권 비즈니스 강사 · 영어 최적", rec: false, gradient: ["#9BC9FF", "#5A93D4", "#3D6EA8"], skin: "#F0CFA8", hair: "#3A2E20" },
  { id: "wang", name: "Wáng Lǎoshī", region: "cn", tags: ["캐주얼"], langs: ["中文", "English"], meta: "中文 보통화 최적 · 캐주얼 강의자", rec: false, gradient: ["#FFD9E8", "#F4A8C8", "#C97A9F"], skin: "#F4D2B0", hair: "#1A1410" },
  { id: "leejihye", name: "이지혜 강사", region: "kr", tags: ["추천", "캐주얼", "친근"], langs: ["한국어"], meta: "친근한 톤 · 캐주얼 일반 강의", rec: true, gradient: ["#FFEFC9", "#F8C97A", "#D9A040"], skin: "#F8DCB8", hair: "#3D2818" },
  { id: "chen", name: "Dr. Chen", region: "us", tags: ["비즈니스", "학술"], langs: ["English", "中文"], meta: "학술 강의 최적 · 영미 아시안", rec: false, gradient: ["#C9F0E0", "#7DC8A8", "#4A9C7A"], skin: "#F0CFA8", hair: "#1A1410" },
  { id: "muller", name: "Prof. Müller", region: "eu", tags: ["비즈니스"], langs: ["English", "독일어"], meta: "유럽 학술 · 영어·독일어", rec: false, gradient: ["#DDDDE8", "#9CA3C0", "#5A6798"], skin: "#FCE4C8", hair: "#A88858" },
  { id: "tanaka", name: "田中先生", region: "jp", tags: ["캐주얼"], langs: ["日本語", "English"], meta: "일본어 발화 최적 · 캐주얼", rec: false, gradient: ["#FFD9D9", "#F4A8A8", "#C97777"], skin: "#F8D8B8", hair: "#1A1410" },
  { id: "sofia", name: "Sofia", region: "eu", tags: ["비즈니스"], langs: ["스페인어", "English"], meta: "라틴 비즈니스 · 스페인어·영어", rec: false, gradient: ["#FFC9A8", "#F49870", "#D26840"], skin: "#E8B888", hair: "#1A1008" },
  { id: "jpark", name: "James Park", region: "us", tags: ["비즈니스"], langs: ["English", "한국어"], meta: "한국계 미국인 · 영어·한국어 이중언어", rec: false, gradient: ["#A8C9FF", "#7099E0", "#4868B8"], skin: "#E8C09C", hair: "#1A1008" },
  { id: "hanjw", name: "한지원", region: "kr", tags: ["캐주얼", "친근"], langs: ["한국어"], meta: "20대 친근한 강의자 · 캐주얼", rec: false, gradient: ["#E8C9FF", "#B898E0", "#8868B8"], skin: "#F8DCB8", hair: "#2A1810" },
  { id: "smith", name: "Dr. Smith", region: "us", tags: ["추천", "비즈니스", "학술"], langs: ["English"], meta: "의학·공학 학술 강의 최적", rec: true, gradient: ["#A8E0E0", "#70B8B8", "#488888"], skin: "#F0CFA8", hair: "#888888" },
  { id: "li", name: "Lǐ Lǎoshī", region: "cn", tags: ["비즈니스", "학술"], langs: ["中文", "English"], meta: "中文 학술 강의 최적", rec: false, gradient: ["#FFE8A8", "#E0C070", "#A88838"], skin: "#F4D2B0", hair: "#1A1410" },
];

export const AVATAR_FILTERS = [
  { id: "all", label: "전체" },
  { id: "rec", label: "추천" },
  { id: "한국어", label: "한국어" },
  { id: "English", label: "English" },
  { id: "中文", label: "中文" },
  { id: "日本語", label: "日本語" },
  { id: "비즈니스", label: "비즈니스" },
  { id: "캐주얼", label: "캐주얼" },
];

export interface Voice {
  id: string;
  name: string;
  gender: "f" | "m";
  lang: string;
  tags: string[];
  meta: string;
  rec: boolean;
  preview: string;
}

export const VOICES: Voice[] = [
  { id: "yuna", name: "Yuna", gender: "f", lang: "한국어", tags: ["자연스러움", "추천"], meta: "속도: 보통 · 톤: 친근", rec: true, preview: "把자문은 처치 의미를 강조하는 구문입니다" },
  { id: "sora", name: "Sora", gender: "f", lang: "한국어", tags: ["친근", "강의"], meta: "속도: 보통 · 톤: 따뜻함", rec: false, preview: "把자문은 처치 의미를 강조하는 구문입니다" },
  { id: "junho", name: "Junho", gender: "m", lang: "한국어", tags: ["학술", "표준"], meta: "속도: 차분 · 톤: 학술", rec: false, preview: "把자문은 처치 의미를 강조하는 구문입니다" },
  { id: "minsoo", name: "Minsoo", gender: "m", lang: "한국어", tags: ["캐주얼", "따뜻함"], meta: "속도: 보통 · 톤: 친근", rec: false, preview: "把자문은 처치 의미를 강조하는 구문입니다" },
  { id: "sarah", name: "Sarah", gender: "f", lang: "English", tags: ["표준", "US"], meta: "Pace: medium · Tone: clear", rec: false, preview: "The 把 construction emphasizes disposal meaning." },
  { id: "emma", name: "Emma", gender: "f", lang: "English", tags: ["학술", "UK"], meta: "Pace: medium · Tone: academic", rec: false, preview: "The 把 construction emphasizes disposal meaning." },
  { id: "adam", name: "Adam", gender: "m", lang: "English", tags: ["자연스러움", "US"], meta: "Pace: natural · Tone: friendly", rec: false, preview: "The 把 construction emphasizes disposal meaning." },
  { id: "william", name: "William", gender: "m", lang: "English", tags: ["비즈니스", "UK"], meta: "Pace: steady · Tone: formal", rec: false, preview: "The 把 construction emphasizes disposal meaning." },
  { id: "xiaoming", name: "Xiaoming", gender: "m", lang: "中文", tags: ["표준", "추천"], meta: "速度: 中 · 音色: 标准", rec: true, preview: "把字句强调处置意义。" },
  { id: "mei", name: "Mei", gender: "f", lang: "中文", tags: ["친근", "보통화"], meta: "速度: 中 · 音色: 亲切", rec: false, preview: "把字句强调处置意义。" },
  { id: "sakura", name: "Sakura", gender: "f", lang: "日本語", tags: ["표준", "친근"], meta: "速度: 普通 · トーン: 親しみ", rec: false, preview: "把構文は処置の意味を強調します。" },
  { id: "lin", name: "Lin", gender: "f", lang: "中文", tags: ["활기", "청소년"], meta: "速度: 快 · 音色: 活泼", rec: false, preview: "把字句强调处置意义。" },
];

export const VOICE_FILTERS = [
  { id: "all", label: "전체" },
  { id: "한국어", label: "한국어" },
  { id: "English", label: "English" },
  { id: "中文", label: "中文" },
  { id: "日本語", label: "日本語" },
  { id: "f", label: "여성" },
  { id: "m", label: "남성" },
  { id: "자연스러움", label: "자연스러움" },
  { id: "표준", label: "표준" },
  { id: "친근", label: "친근" },
  { id: "학술", label: "학술" },
];

export interface DiffToken {
  t: string;
  text: string;
}

export const DIFF_TOKENS: DiffToken[] = [
  { t: "add", text: "안녕하세요. 이번에는" },
  { t: "keep", text: " " },
  { t: "keep-han", text: "把" },
  { t: "keep", text: "자문의 어순을 " },
  { t: "add", text: "좀 더 " },
  { t: "keep", text: "자세히 살펴보겠습니다. " },
  { t: "add", text: "일반적으로 중국어는 주어-동사-목적어(SVO) 어순을 따르지만, " },
  { t: "keep-han", text: "把" },
  { t: "keep", text: "자문은 목적어를 동사 앞으로 " },
  { t: "chg-old", text: "이동해" },
  { t: "chg-new", text: "끌어당겨" },
  { t: "keep", text: " “처치(處置)”" },
  { t: "chg-old", text: "가 강조됨" },
  { t: "chg-new", text: "의 의미를 강조하는" },
  { t: "add", text: " 구조예요" },
  { t: "del", text: "구문" },
  { t: "keep", text: ". " },
  { t: "add", text: "예를 들어 “他看完书了”는 단순한 SVO 어순이지만, “他" },
  { t: "add-han", text: "把" },
  { t: "add", text: "书看完了”라고 하면 동작의 완결성·영향이 분명하게 드러납니다." },
  { t: "del-sent", text: "· 처치 대상은 한정적·특정적." },
];
