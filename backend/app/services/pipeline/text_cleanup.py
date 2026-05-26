"""발화 스크립트·자막용 텍스트 정리 — 한자 뒤 병음(로마자) 괄호 표기 제거.

스크립트에 ``한자(병음)`` 형태가 섞이면 ElevenLabs(eleven_multilingual_v2)가
괄호 안 로마자를 그대로 읽어 중국어 발음이 깨진다. 한자만 남기면 멀티링구얼
모델이 한자를 중국어로 정확히 발음한다. 생성 단계(script_generator)·합성 단계
(tts.synthesize)·자막 번역(video.translate_subtitles) 에서 공통으로 이 함수를
거쳐 병음 주석을 제거한다.
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
