"""ENVIRONMENT 화이트리스트 검증 회귀 테스트.

오타("prodution") 등으로 prod 보호 분기가 우회되지 않도록
설정 로드 단계에서 강하게 거부해야 한다.

참고: app.core.config 모듈을 importlib.reload 하면 모듈 스코프의 settings
인스턴스가 새로 생성되어 다른 테스트에서 patch.object(settings, ...) 로
픽스한 값이 다른 인스턴스에 적용되는 부작용이 생긴다. 따라서 본 테스트는
Settings 클래스를 직접 인스턴스화해 validator 동작만 검증한다.
"""
import os
from contextlib import contextmanager

import pytest
from pydantic import ValidationError

from app.core.config import Settings


@contextmanager
def _env(**kwargs):
    """일시적으로 env var 를 설정하고 종료 시 원복."""
    original = {k: os.environ.get(k) for k in kwargs}
    for k, v in kwargs.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v
    try:
        yield
    finally:
        for k, prev in original.items():
            if prev is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = prev


def test_environment_typo_raises():
    """ENVIRONMENT='prodution' 같은 오타는 ValidationError 를 발생시킨다."""
    with pytest.raises(ValidationError):
        Settings(ENVIRONMENT="prodution")


def test_environment_empty_raises():
    """빈 문자열도 거부."""
    with pytest.raises(ValidationError):
        Settings(ENVIRONMENT="")


@pytest.mark.parametrize("env_val", ["development", "staging", "production", "test"])
def test_valid_environments_pass(env_val):
    """허용 목록 내의 값은 통과한다."""
    s = Settings(ENVIRONMENT=env_val)
    assert s.ENVIRONMENT == env_val


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("Production", "production"),
        ("DEVELOPMENT", "development"),
        (" Staging ", "staging"),
        ("Test", "test"),
    ],
)
def test_environment_case_and_whitespace_normalized(raw, expected):
    """대소문자/공백이 섞여도 정규화돼 받아들여진다."""
    s = Settings(ENVIRONMENT=raw)
    assert s.ENVIRONMENT == expected
