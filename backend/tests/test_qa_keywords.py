"""빈번 질문어 추출 순수 함수 단위 테스트 (스펙 11 §G)."""
from app.services.qa_keywords import extract_keywords


def test_korean_josa_normalized_and_counted():
    """조사가 다른 같은 어근은 하나로 합산된다."""
    questions = ["수업을 어떻게 듣나요", "수업은 재미있어요", "수업이 좋아요"]
    kws = extract_keywords(questions)
    by_term = {k["term"]: k for k in kws}
    assert "수업" in by_term
    assert by_term["수업"]["count"] == 3
    assert by_term["수업"]["lang"] == "ko"


def test_stopwords_excluded():
    """'교수님'·'어떻게' 등 불용어는 결과에서 빠진다."""
    kws = extract_keywords(["교수님 이거 어떻게 하나요", "교수님 안녕하세요"])
    terms = {k["term"] for k in kws}
    assert "교수님" not in terms
    assert "어떻게" not in terms


def test_chinese_bigrams_extracted():
    """한자 런은 2-gram 후보로 추출된다(단일 한자 제외)."""
    kws = extract_keywords(["语法和发音", "语法和发音"])
    by_term = {k["term"]: k for k in kws}
    assert "语法" in by_term
    assert by_term["语法"]["count"] == 2
    assert by_term["语法"]["lang"] == "zh"
    # 단일 한자만으로는 키워드가 되지 않는다.
    assert all(len(k["term"]) >= 2 for k in kws if k["lang"] == "zh")


def test_min_count_and_top_n_and_ordering():
    """min_count 필터·top_n 절단·count 내림차순(동률 사전순) 보장."""
    questions = ["문법 문법 문법", "발음 발음", "어휘"]
    kws = extract_keywords(questions, top_n=2, min_count=2)
    assert [k["term"] for k in kws] == ["문법", "발음"]  # 어휘(1회)는 min_count 미달
    assert kws[0]["count"] == 3
    assert kws[1]["count"] == 2


def test_empty_and_none_safe():
    assert extract_keywords([]) == []
    assert extract_keywords(["", None]) == []  # type: ignore[list-item]
