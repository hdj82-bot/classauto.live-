"""발화 스크립트·자막용 텍스트 정리 + 언어 구간 분리(TTS 발음 정확화).

책임:

1. ``strip_pinyin_annotations`` — ``한자(병음)`` 형태의 로마자 괄호 표기 제거.
   괄호 안 로마자를 ElevenLabs 가 그대로 읽어 발음이 깨지는 것을 막는다.
2. ``strip_cross_lang_gloss`` — ``한국어(중국어)``·``중국어(한국어)`` 병기 괄호 제거
   (교수자 요청 2026-06-16: 같은 뜻을 두 언어로 병기하지 않는다). 앞 단어만 남긴다.
3. ``split_by_language`` — 한국어 설명에 박힌 중국어(한자) 구간을 분리.

   ElevenLabs(eleven_multilingual_v2) 는 합성 요청마다 언어를 하나로 자동
   판별하므로, 한국어가 대부분인 문장에 한자 몇 글자가 섞이면 전체가 한국어로
   판정돼 한자가 한국어 한자음(我→'아')으로 발음된다. 병음을 지워 한자만
   남겨도 이 문제는 그대로다(혼합문에서는 한자를 중국어로 안 읽음). 그래서
   한자 구간을 떼어 따로 합성해야(격리된 한자 텍스트는 모델이 중국어로 판별)
   만다린이 정확히 나온다. 실제 구간별 합성·병합은 ``tts.synthesize`` 가 한다.

생성 단계(script_generator)·합성 단계(tts.synthesize)·자막 번역
(video.translate_subtitles) 에서 공통으로 ``strip_pinyin_annotations`` 를 거친다.
"""
from __future__ import annotations

import re

# 한자(CJK 통합 한자 + 확장 A) 범위.
_HANZI = r"㐀-鿿"

# ``한자(병음)`` 패턴만 골라 제거한다. 한글이 든 설명 괄호나 한자 앞이 아닌
# 괄호는 건드리지 않는다(오탐 방지):
#   - (?<=한자) : 여는 괄호 바로 앞이 한자여야 함
#   - (?=...로마자) : 괄호 안에 ASCII 로마자가 1개 이상 있어야 함(병음 신호)
#   - 괄호 안에 한글·한자·닫는 괄호가 없어야 함(성조 부호·공백·쉼표 등은 허용)
#   - ASCII 와 전각 괄호( （ ） ) 모두 대응
_RE_PINYIN_PAREN = re.compile(
    r"(?<=[" + _HANZI + r"])\s*"
    r"[（(]"
    r"(?=[^)）]*[A-Za-z])"
    r"[^)）가-힣" + _HANZI + r"]*"
    r"[)）]"
)


def strip_pinyin_annotations(text: str) -> str:
    """``한자(병음)`` 형태의 병음 괄호 표기를 제거해 한자만 남긴다.

    - ``他(tā)喜欢(xǐhuān)猫(māo)``      → ``他喜欢猫``
    - ``我(wǒ)去(qù)公园(gōngyuán)에``   → ``我去公园에`` (한글 조사 보존)
    - 한글이 든 설명 괄호·한자 앞이 아닌 괄호는 그대로 둔다.
    """
    if not text:
        return text
    return _RE_PINYIN_PAREN.sub("", text)


# ── 한·중 병기 괄호 제거 ('한국어(중국어)' / '중국어(한국어)' 금지) ──────────────
# 교수자 요청(2026-06-16): 같은 뜻을 두 언어로 괄호 병기하지 않는다. 중국어를 말할
# 거면 중국어 단어만 쓰고, '주어(主语)'·'大学生(대학생)' 같은 병기는 절대 쓰지 않는다.
# 생성(답변·스크립트)·자막·합성 모두에서 앞 단어만 남기고 괄호 글로스를 제거한다.
# 병음 괄호(``한자(로마자)``)는 strip_pinyin_annotations 가 따로 처리한다.
# 명시적 코드포인트로 고정한다. 글자로 직접 적으면 호환 한자 시작점 U+F900(豈)을
# 일반 한자 U+8C48(豈)로 잘못 입력하기 쉬운데, 그러면 범위가 한글 음절 블록
# (U+AC00–U+D7A3)까지 삼켜 '한자(한글)' 병기 제거가 한글을 한자로 오인해 깨진다.
_HAN_RANGE = "㐀-䶿一-鿿豈-﫿"  # CJK 확장 A + 통합 + 호환 한자(U+F900~)

# '한글단어(한자…)' → 한글만 남김. 괄호 안에 한자가 있고 한글은 없을 때만(같은 언어
# 설명 '주어(문장의 주체)' 는 보존). 예: '주어(主语)' → '주어'.
_RE_HANGUL_THEN_HAN_PAREN = re.compile(
    r"(?<=[가-힣])\s*"
    r"[（(]"
    r"(?=[^)）]*[" + _HAN_RANGE + r"])"   # 괄호 안에 한자 1자 이상
    r"[^)）가-힣]*"                          # 괄호 안에 한글 없음(=다른 언어 글로스)
    r"[)）]"
)

# '한자단어(한글…)' → 한자만 남김. 괄호 안에 한글이 있고 한자는 없을 때만.
# 예: '大学生(대학생)' → '大学生'.
_RE_HAN_THEN_HANGUL_PAREN = re.compile(
    r"(?<=[" + _HAN_RANGE + r"])\s*"
    r"[（(]"
    r"(?=[^)）]*[가-힣])"                    # 괄호 안에 한글 1자 이상
    r"[^)）" + _HAN_RANGE + r"]*"           # 괄호 안에 한자 없음
    r"[)）]"
)


def strip_cross_lang_gloss(text: str) -> str:
    """'한국어(중국어)'·'중국어(한국어)' 병기 괄호를 제거하고 앞 단어만 남긴다.

    - ``주어(主语)`` → ``주어``,  ``서술어(谓语)`` → ``서술어``
    - ``大学生(대학생)`` → ``大学生``
    보존(제거하지 않음):
    - 같은 언어 설명 괄호: ``주어(문장의 주체)`` (괄호 안에 한글뿐 → 한글단어 뒤가 아니라
      한자단어 뒤일 때만 제거하므로 안전), ``学习(공부)`` 류만 대상.
    - 병음 괄호 ``他(tā)`` → strip_pinyin_annotations 담당.
    - 괄호 안에 한·중이 섞인 경우(예: ``주어(主语 등)``)는 건드리지 않는다.
    """
    if not text:
        return text
    text = _RE_HANGUL_THEN_HAN_PAREN.sub("", text)
    text = _RE_HAN_THEN_HANGUL_PAREN.sub("", text)
    return text


# ── 언어 구간 분리 (중국어 발음 정확화) ───────────────────────────────────────
# 한자(CJK 통합 한자 + 확장 A + 호환 한자)와 한글 음절 판별. strip 의 _HANZI
# 와 별개로, 합성기에 보낼 구간을 나누기 위한 글자 단위 매처.
_HANZI_CHAR = re.compile(r"[㐀-䶿一-鿿豈-﫿]")
_HANGUL_CHAR = re.compile(r"[가-힣]")


def _has_speech_letter(s: str) -> bool:
    """한글 또는 한자가 1자 이상 있으면 True (순수 문장부호/공백 구간 판별용)."""
    return bool(_HANZI_CHAR.search(s) or _HANGUL_CHAR.search(s))


def contains_chinese(text: str) -> bool:
    """텍스트에 한자(중국어 글자)가 하나라도 있으면 True.

    tts.synthesize 가 중국어 포함 스크립트를 eleven_v3(코드스위칭) 경로로 보낼지
    판단하는 데 쓴다.
    """
    return bool(text) and _HANZI_CHAR.search(text) is not None


def split_by_language(text: str) -> list[tuple[str, str]]:
    """발화 텍스트를 중국어(한자) 구간과 그 외(한국어 등) 구간으로 분리한다.

    반환: ``[(lang, chunk), ...]`` (lang ∈ ``{"zh", "other"}``). 모든 chunk 를
    순서대로 이으면 원문과 정확히 같다(문자 손실 없음 — 호출부가 오디오를
    이어붙이면 원문 발화가 복원된다).

    규칙:
    - 한자 사이에 낀 문장부호·공백(예 ``我、你``)은 중국어 구간에 붙인다.
    - 그 밖의 문장부호·공백·로마자·숫자는 인접 구간에 붙여, 순수 문장부호만으로
      이뤄진 구간이 따로 생기지 않게 한다(빈 합성 호출 방지).
    - 순수 한국어/순수 중국어 텍스트는 구간이 1개 → 호출부가 분리 없이 한 번에
      합성하면 된다(기존 동작과 동일).
    """
    if not text:
        return []

    # 1) 글자별 1차 분류: H(한자) / K(한글) / N(중립: 공백·부호·로마자·숫자)
    cls: list[str] = []
    for ch in text:
        if _HANZI_CHAR.match(ch):
            cls.append("H")
        elif _HANGUL_CHAR.match(ch):
            cls.append("K")
        else:
            cls.append("N")

    n = len(text)
    eff = cls[:]
    i = 0
    while i < n:
        if cls[i] != "N":
            i += 1
            continue
        j = i
        while j < n and cls[j] == "N":
            j += 1
        left = cls[i - 1] if i > 0 else None
        right = cls[j] if j < n else None
        # 한자와 한자 사이에 낀 중립 문자만 중국어로, 나머지는 한국어로 귀속.
        run = "H" if (left == "H" and right == "H") else "K"
        for k in range(i, j):
            eff[k] = run
        i = j

    # 2) 같은 분류가 연속된 구간으로 병합
    raw: list[tuple[str, str]] = []
    start = 0
    for idx in range(1, n + 1):
        if idx == n or eff[idx] != eff[start]:
            lang = "zh" if eff[start] == "H" else "other"
            raw.append((lang, text[start:idx]))
            start = idx

    # 3) 순수 문장부호 구간을 인접 구간에 흡수 (선행 따옴표 등 → 빈 합성 호출 방지)
    merged: list[list[str]] = []
    for lang, chunk in raw:
        if not _has_speech_letter(chunk) and merged:
            merged[-1][1] += chunk
        elif merged and not _has_speech_letter(merged[-1][1]):
            # 직전이 순수 부호 구간(선행 따옴표 등)이면 이번 구간 언어를 채택
            merged[-1][1] += chunk
            merged[-1][0] = lang
        else:
            merged.append([lang, chunk])
    return [(lang, chunk) for lang, chunk in merged]
