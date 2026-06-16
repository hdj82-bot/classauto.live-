"""text_cleanup 단위 테스트 — 병음 제거 + 언어 구간 분리."""
import pytest

from app.services.pipeline.text_cleanup import (
    split_by_language,
    strip_cross_lang_gloss,
    strip_pinyin_annotations,
)


@pytest.mark.parametrize(
    "raw, expected",
    [
        # 연속된 한자(병음) → 한자만
        ("他(tā)喜欢(xǐhuān)猫(māo)", "他喜欢猫"),
        # 문장 안에 섞인 경우 + 한글 조사 보존
        (
            '첫 번째 문장은 "我(wǒ)去(qù)公园(gōngyuán)에 간다"입니다.',
            '첫 번째 문장은 "我去公园에 간다"입니다.',
        ),
        # 전각 괄호도 제거
        ("他（tā）喜欢（xǐhuān）", "他喜欢"),
        # 한자와 괄호 사이 공백도 함께 정리
        ("猫 (māo) 입니다", "猫 입니다"),
        # 병음이 전혀 없는 한자 문장은 그대로
        ('동사 "喜欢" 의 위치', '동사 "喜欢" 의 위치'),
        # 순수 한국어는 그대로
        ("안녕하세요. 오늘은 어순을 배웁니다.", "안녕하세요. 오늘은 어순을 배웁니다."),
    ],
)
def test_strips_pinyin_parentheses(raw: str, expected: str) -> None:
    assert strip_pinyin_annotations(raw) == expected


def test_preserves_korean_and_hanja_glosses_in_parens() -> None:
    # 한자 뒤라도 괄호 안에 로마자가 없고 한글/한자면 설명 괄호로 보고 보존.
    assert strip_pinyin_annotations("中国(중국)은 크다") == "中国(중국)은 크다"
    assert strip_pinyin_annotations("主語(주어)") == "主語(주어)"
    # 한자 앞이 아닌 괄호(한국어 약어 풀이 등)는 건드리지 않는다.
    assert strip_pinyin_annotations("GDP(국내총생산)") == "GDP(국내총생산)"


def test_empty_and_none_safe() -> None:
    assert strip_pinyin_annotations("") == ""
    assert strip_pinyin_annotations(None) is None  # type: ignore[arg-type]


# ── strip_cross_lang_gloss: '한국어(중국어)' / '중국어(한국어)' 병기 제거 ────────


@pytest.mark.parametrize(
    "raw, expected",
    [
        # 한글단어(한자) → 한글만 (교수자 보고 사례: 주어(主语) 등)
        ("주어(主语), 서술어(谓语), 목적어(宾语)", "주어, 서술어, 목적어"),
        ("부사어(状语), 관형어(定语), 보어(补语)", "부사어, 관형어, 보어"),
        ("학습(學習)은 중요하다", "학습은 중요하다"),
        # 한자단어(한글) → 한자만
        ("大学生(대학생)", "大学生"),
        ("我吃饭(나는 밥을 먹는다)", "我吃饭"),
        # 전각 괄호도 제거
        ("주어（主语）", "주어"),
    ],
)
def test_strips_cross_lang_gloss(raw: str, expected: str) -> None:
    assert strip_cross_lang_gloss(raw) == expected


def test_cross_lang_preserves_same_language_and_other_globs() -> None:
    # 같은 언어 설명 괄호(괄호 안 한글)는 한글단어 뒤에서 보존 — 한자가 없으므로.
    assert strip_cross_lang_gloss("주어(문장의 주체)") == "주어(문장의 주체)"
    # 영어 약어 풀이 등 한자가 없는 괄호는 보존.
    assert strip_cross_lang_gloss("GDP(국내총생산)") == "GDP(국내총생산)"
    # 괄호 안에 한·중이 섞이면(애매) 건드리지 않는다.
    assert strip_cross_lang_gloss("주어(主语 등 핵심)") == "주어(主语 등 핵심)"
    # 순수 한국어/순수 중국어 문장은 그대로.
    assert strip_cross_lang_gloss("안녕하세요. 어순을 배웁니다.") == "안녕하세요. 어순을 배웁니다."


def test_cross_lang_empty_and_none_safe() -> None:
    assert strip_cross_lang_gloss("") == ""
    assert strip_cross_lang_gloss(None) is None  # type: ignore[arg-type]


# ── split_by_language ────────────────────────────────────────────────────────


def test_split_pure_korean_is_single_other_segment() -> None:
    assert split_by_language("안녕하세요. 어순을 배웁니다.") == [
        ("other", "안녕하세요. 어순을 배웁니다."),
    ]


def test_split_pure_chinese_is_single_zh_segment() -> None:
    assert split_by_language("我吃饭。我们去公园。") == [
        ("zh", "我吃饭。我们去公园。"),
    ]


def test_split_isolates_hanzi_run_from_korean() -> None:
    segs = split_by_language('첫 문장은 "我吃饭"입니다.')
    # 한자 구간이 한국어와 분리돼 별도 "zh" 로 나온다.
    assert ("zh", '"我吃饭') in segs or any(
        lang == "zh" and "我吃饭" in chunk for lang, chunk in segs
    )
    langs = [lang for lang, _ in segs]
    assert "zh" in langs and "other" in langs


def test_split_each_explained_character_is_chinese() -> None:
    segs = split_by_language('"我"는 "나는", "吃"는 "먹다"를 뜻합니다.')
    zh_chunks = [chunk for lang, chunk in segs if lang == "zh"]
    # 설명용으로 떼어 쓴 개별 한자가 각각 중국어 구간으로 잡힌다.
    assert "我" in "".join(zh_chunks)
    assert "吃" in "".join(zh_chunks)


def test_split_punctuation_between_hanzi_stays_chinese() -> None:
    # 한자 사이에 낀 부호·공백은 중국어 구간에 붙는다(별도 부호 구간 생성 안 함).
    assert split_by_language("我、你") == [("zh", "我、你")]


@pytest.mark.parametrize(
    "text",
    [
        "",
        "안녕하세요",
        "我吃饭",
        '첫 문장은 "我吃饭"입니다. 두 번째는 "我们去公园"이죠.',
        '"我"는 나는, "吃"는 먹다.',
        "GDP는 国内总产值(국내총생산)을 뜻합니다.",
        "123 ... !!!",
    ],
)
def test_split_is_lossless(text: str) -> None:
    # 모든 구간을 순서대로 이으면 원문과 정확히 같아야 한다(오디오 병합 시 원문 복원).
    assert "".join(chunk for _, chunk in split_by_language(text)) == text


def test_split_no_empty_or_punctuation_only_segment() -> None:
    # 순수 문장부호만으로 이뤄진 구간이 따로 생기지 않아야 한다(빈 합성 호출 방지).
    for text in ['"我"입니다', '我吃饭! 다음.', '...我...']:
        for _, chunk in split_by_language(text):
            assert chunk.strip() != ""
