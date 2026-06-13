/**
 * 자막 문장 단위 동기화(노래방식)의 순수 타이밍 로직.
 *
 * 슬라이드 본문은 슬라이드 1장 = 음성 1파일 = 자막 1블록 구조라, 한 슬라이드 안에
 * 여러 문장이 있으면 음성은 다음 문장으로 가는데 자막 블록은 그대로 남아 어긋난다.
 * 여기서는 **실측 음성 기준** 경과 시간(elapsed)·길이(duration)로 현재 문장을 고른다.
 * 추정 타임라인(start/end_seconds, 5자/초)을 쓰면 실측 재생과 어긋나므로 쓰지 않는다.
 */

/** 절(clause) 단위로 더 쪼갤 때의 최소 길이 — 이보다 짧으면 그대로 둔다. */
const CLAUSE_SPLIT_MIN = 28;
/** 절 경계 — 한국어·중국어 쉼표/구분점/세미콜론 뒤에서 끊는다. */
const CLAUSE_BOUNDARY = /(?<=[,，、;；·])\s*/u;

/**
 * 한국어·중국어 종결 부호와 줄바꿈 기준으로 문장 분리(CJK 공백 없음도 처리).
 *
 * 한 슬라이드 자막이 마침표 없는 **긴 한 문장**이면(번역 자막에서 흔함) 노래방식
 * 진행이 멈춰 통째로 떠 PPT 를 가린다. 그래서 길이가 ``CLAUSE_SPLIT_MIN`` 이상인
 * 문장은 쉼표 등 절 경계에서 한 번 더 쪼개 음성 진행에 맞춰 촘촘히 넘어가게 한다.
 */
export function splitIntoSentences(text: string): string[] {
  const sentences = text
    .split(/(?<=[。．.!?！？\n])/u)
    .map((s) => s.trim())
    .filter(Boolean);
  const base = sentences.length ? sentences : [text];
  const out: string[] = [];
  for (const s of base) {
    if (s.length < CLAUSE_SPLIT_MIN) {
      out.push(s);
      continue;
    }
    const clauses = s
      .split(CLAUSE_BOUNDARY)
      .map((c) => c.trim())
      .filter(Boolean);
    out.push(...(clauses.length ? clauses : [s]));
  }
  return out.length ? out : [text];
}

/**
 * 자막 전환을 음성보다 살짝 앞당기는 기본 리드(초). 문장/절 경계를 글자 수 비례로
 * 잡다 보니(실제 발성 속도와 완전히 같지 않음) 자막이 음성보다 한 박자 늦게
 * 느껴진다. 전환 시점을 이만큼 앞당겨 체감 동기화를 맞춘다.
 *
 * 음성/자막 언어 조합·TTS 마다 체감이 달라, 미리보기 설정 패널에서 사용자가
 * ``leadSeconds`` 로 직접 조절한다. 이 상수는 그 기본값이다.
 */
export const DEFAULT_CAPTION_LEAD_SECONDS = 0.2;

/**
 * 슬라이드 내 경과 시간에 해당하는 자막 문장을 고른다.
 *
 * @param text       표시할 자막(번역 자막 또는 발화 원문).
 * @param sourceText 발화 원문. 자막과 문장 수가 같으면 음성 속도에 더 가깝게
 *                   발화 길이로 가중한다. 없으면 자막 자체 길이로 가중.
 * @param elapsed    현재 슬라이드가 시작된 뒤 흐른 실측 시간(초).
 * @param duration   현재 슬라이드의 실측 재생 길이(초).
 * @param leadSeconds 자막을 음성보다 앞당기는 리드(초). 양수=자막이 빨라짐,
 *                    음수=느려짐. 기본 ``DEFAULT_CAPTION_LEAD_SECONDS``.
 */
export function pickActiveCaption(
  text: string,
  sourceText: string | undefined,
  elapsed: number,
  duration: number,
  leadSeconds: number = DEFAULT_CAPTION_LEAD_SECONDS,
): string {
  const sentences = splitIntoSentences(text);
  if (sentences.length <= 1) return sentences[0] ?? text;

  const dur = Math.max(duration, 0.001);
  // 리드만큼 앞당겨(=경과를 더 준 셈) 자막이 음성보다 살짝 먼저 넘어가게 한다.
  const frac = Math.min(
    Math.max((elapsed + leadSeconds) / dur, 0),
    0.9999,
  );

  // 가중 기준: 발화 원문 문장 수가 자막과 같으면 발화(=음성) 길이, 아니면 자막 길이.
  // 문장별 표시 시간을 균등이 아니라 글자 수에 비례시켜 짧은/긴 문장을 보정한다.
  const srcSents = sourceText ? splitIntoSentences(sourceText) : [];
  const basis = srcSents.length === sentences.length ? srcSents : sentences;
  const weights = basis.map((s) => Math.max(1, s.length));
  const totalW = weights.reduce((a, b) => a + b, 0);

  let acc = 0;
  for (let i = 0; i < sentences.length; i += 1) {
    acc += weights[i] / totalW;
    if (frac < acc) return sentences[i];
  }
  return sentences[sentences.length - 1];
}
