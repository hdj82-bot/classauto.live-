"""빈번 질문어 추출 — 학생 Q&A 질문의 한/중/영 키워드 빈도 (스펙 11 §G / 10번).

베타 단계 경량 휴리스틱(외부 형태소 분석기 무도입 — 배포 의존성·사전 부담 회피):
- 한글: 2자 이상 한글 토큰 → 흔한 조사/어미 접미를 한 번 벗긴다.
- 한자(CJK): 공백 분절이 없어 런 단위로 2-gram 후보를 만든다(경량 중국어 키워드
  추출의 관용 기법). 단일 한자는 기능어 비중이 높아 제외.
- 영문: 2자 이상 라틴 토큰(소문자화).
불용어·최소 길이·최소 빈도로 노이즈를 거른다. 정확한 형태소 분석(KoNLPy/jieba)은
9월 베타 데이터 확보 후 고도화 예정 — 교수자(코퍼스 언어학) 강점과 연계.
"""
from __future__ import annotations

import re
import uuid
from collections import Counter

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.qa_log import QALog

_HANGUL = re.compile(r"[가-힣]{2,}")
_CJK = re.compile(r"[一-鿿]+")
_LATIN = re.compile(r"[A-Za-z]{2,}")

# 토큰 끝에서 한 번 벗기는 한국어 조사/어미(긴 것부터 — 최장 일치). 형태소 분석이
# 아니므로 완벽하진 않으나 "수업을/수업은/수업이" → "수업" 수준의 정규화는 된다.
_KO_SUFFIXES = (
    "으로써", "으로서", "에서는", "에게서", "이라는", "이라고", "라는", "라고",
    "으로", "에서", "에게", "한테", "까지", "부터", "처럼", "보다", "이나",
    "은", "는", "이", "가", "을", "를", "에", "의", "도", "만", "로", "과", "와", "나",
)

# 질문에 흔하지만 주제어가 아닌 말(한/중/영). 정규화 후 기준으로 비교.
_STOPWORDS = {
    # 한국어
    "교수님", "안녕하세요", "질문", "궁금", "무엇", "어떻게", "어떤", "이것", "저것",
    "그것", "이거", "저거", "그거", "대해", "대한", "관해", "관한", "경우", "정도",
    "부분", "내용", "설명", "혹시", "그리고", "하지만", "그런데", "에서의", "통해",
    "어디", "언제", "누구", "얼마", "왜요", "인가요", "건가요", "습니까", "나요",
    # 중국어(2-gram 기준 흔한 기능 표현)
    "什么", "怎么", "为什", "请问", "老师", "可以", "这个", "那个", "问题", "如何",
    "因为", "所以", "知道", "明白",
    # 영어
    "the", "what", "how", "why", "and", "for", "with", "this", "that", "you",
    "can", "could", "would", "should", "about", "does", "did", "is", "are",
}

_MIN_TOKEN_LEN = 2


def _normalize_ko(token: str) -> str:
    """한글 토큰에서 최장 조사/어미 접미를 한 번 제거(남은 길이 2자 이상일 때만)."""
    for suf in _KO_SUFFIXES:
        if token.endswith(suf) and len(token) - len(suf) >= _MIN_TOKEN_LEN:
            return token[: -len(suf)]
    return token


def extract_keywords(
    questions: list[str], top_n: int = 20, min_count: int = 1
) -> list[dict]:
    """질문 문자열 목록 → 빈도 상위 키워드 [{term, count, lang}] (count 내림차순).

    순수 함수 — DB 무의존이라 단위 테스트가 쉽다(키워드 추출 로직의 단일 진실).
    """
    counter: Counter[tuple[str, str]] = Counter()  # (term, lang) → count

    for q in questions:
        if not q:
            continue
        for tok in _HANGUL.findall(q):
            term = _normalize_ko(tok)
            if len(term) >= _MIN_TOKEN_LEN and term not in _STOPWORDS:
                counter[(term, "ko")] += 1
        for run in _CJK.findall(q):
            # 한자 런을 2-gram 후보로(단일 한자 제외).
            for i in range(len(run) - 1):
                bigram = run[i : i + 2]
                if bigram not in _STOPWORDS:
                    counter[(bigram, "zh")] += 1
        for tok in _LATIN.findall(q):
            term = tok.lower()
            if len(term) >= _MIN_TOKEN_LEN and term not in _STOPWORDS:
                counter[(term, "en")] += 1

    items = [
        {"term": term, "lang": lang, "count": count}
        for (term, lang), count in counter.items()
        if count >= min_count
    ]
    # count 내림차순, 동률은 term 사전순(결정적 출력 — 테스트 안정).
    items.sort(key=lambda x: (-x["count"], x["term"]))
    return items[:top_n]


async def get_qa_keywords(
    db: AsyncSession, lecture_id: uuid.UUID, top_n: int = 20
) -> dict:
    """강의의 Q&A 질문들에서 빈번 키워드를 추출해 반환."""
    questions = list(
        (
            await db.execute(
                select(QALog.question).where(QALog.lecture_id == lecture_id)
            )
        )
        .scalars()
        .all()
    )
    return {
        "lecture_id": str(lecture_id),
        "totalQuestions": len(questions),
        "keywords": extract_keywords(questions, top_n=top_n),
    }
