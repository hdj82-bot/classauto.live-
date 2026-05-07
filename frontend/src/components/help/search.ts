/**
 * 도움말 fuzzy 검색 — 차트 라이브러리와 마찬가지로 외부 의존성 없이
 * 클라이언트단에서만 동작하도록 한다. Algolia 등은 GA 이후 도입.
 *
 * 매칭 정책:
 *   - 토큰화: 공백 기준 split. 한국어 띄어쓰기와 영어 어절 모두 자연스러움.
 *   - 점수: 토큰별 정확 일치(2점) + 부분 일치(1점) + 카테고리명 일치(0.5점).
 *   - 최소 임계값: 1점 미만은 제외.
 *   - 결과 정렬: 점수 desc → 카테고리 정렬 순 → 인덱스 asc (안정적).
 *   - matchedField 는 가장 강한 일치가 발생한 필드를 기록(대시보드 미리보기에
 *     "질문에서 일치" 등 보조 라벨 노출).
 *
 * 본 함수는 순수 — 입력만으로 출력이 결정되어 vitest 단위 테스트가 쉽다.
 */

import type {
  HelpCategoryId,
  HelpFaqItem,
  HelpSearchHit,
} from "./types";

interface SearchableEntry {
  categoryId: HelpCategoryId;
  categoryLabel: string;
  index: number;
  q: string;
  a: string;
}

interface ScoredHit extends HelpSearchHit {
  score: number;
}

// 답변 단독 (0.8) / 카테고리 단독 (0.5) 매칭도 fallback 으로 노출되도록
// 임계값을 0.5 로 낮춘다. 테스트 명세 (falls back to answer / category label)
// 와 정합. 1.0 이상은 질문 매칭 / 다중 토큰 매칭일 때만 발생.
const MIN_SCORE = 0.5;

export function buildSearchIndex(
  byCategory: Record<HelpCategoryId, HelpFaqItem[]>,
  categoryLabels: Record<HelpCategoryId, string>,
): SearchableEntry[] {
  const out: SearchableEntry[] = [];
  for (const id of Object.keys(byCategory) as HelpCategoryId[]) {
    const items = byCategory[id] ?? [];
    items.forEach((it, index) => {
      out.push({
        categoryId: id,
        categoryLabel: categoryLabels[id] ?? id,
        index,
        q: it.q,
        a: it.a,
      });
    });
  }
  return out;
}

export function searchHelp(
  index: SearchableEntry[],
  query: string,
): HelpSearchHit[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const tokens = trimmed
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);

  if (tokens.length === 0) return [];

  const hits: ScoredHit[] = [];
  for (const entry of index) {
    let score = 0;
    let bestField: HelpSearchHit["matchedField"] = "question";
    let bestFieldScore = -1;

    const qLower = entry.q.toLowerCase();
    const aLower = entry.a.toLowerCase();
    const cLower = entry.categoryLabel.toLowerCase();

    for (const tok of tokens) {
      // 질문에서의 일치 — 가장 가중치 큼
      if (qLower.includes(tok)) {
        const exact = qLower.split(/\s+/).includes(tok);
        const inc = exact ? 2 : 1;
        score += inc;
        if (inc > bestFieldScore) {
          bestField = "question";
          bestFieldScore = inc;
        }
        continue;
      }
      if (aLower.includes(tok)) {
        score += 0.8;
        if (0.8 > bestFieldScore) {
          bestField = "answer";
          bestFieldScore = 0.8;
        }
        continue;
      }
      if (cLower.includes(tok)) {
        score += 0.5;
        if (0.5 > bestFieldScore) {
          bestField = "category";
          bestFieldScore = 0.5;
        }
      }
    }

    if (score >= MIN_SCORE) {
      hits.push({
        categoryId: entry.categoryId,
        index: entry.index,
        q: entry.q,
        a: entry.a,
        matchedField: bestField,
        score,
      });
    }
  }

  hits.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.categoryId !== b.categoryId) {
      return a.categoryId.localeCompare(b.categoryId);
    }
    return a.index - b.index;
  });

  return hits.map(({ score: _score, ...rest }) => {
    void _score;
    return rest;
  });
}
