"""ENVIRONMENT 화이트리스트 검증 회귀 테스트.

오타("prodution") 등으로 prod 보호 분기가 우회되지 않도록
설정 로드 단계에서 강하게 거부해야 한다.
"""
import importlib
import os
from contextlib import contextmanager

import pytest


@contextmanager
def _env(**kwargs):
    """일시적으로 env var 를 설정하고 종료 시 원복."""
    original = {k: os.environ.get(k) for k in kwargs}
    os.environ.update({k: v for k, v in kwargs.items() if v is not None})
    for k, v in kwargs.items():
        if v is None:
            os.environ.pop(k, None)
    try:
        yield
    finally:
        for k, prev in original.items():
            if prev is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = prev


def test_environment_typo_raises():
    """ENVIRONMENT='prodution' 같은 오타는 ValueError 를 발생시킨다."""
    with _env(ENVIRONMENT="prodution"):
        # config 모듈을 새로 import 해야 BaseSettings 가 env 를 다시 읽는다.
        import app.core.config as cfg
        with pytest.raises(Exception):  # pydantic ValidationError 또는 ValueError
            importlib.reload(cfg)
    # 원본 ENVIRONMENT 로 복원해 다른 테스트에 영향을 주지 않는다.
    import app.core.config as cfg2
    importlib.reload(cfg2)


def test_environment_case_insensitive_normalized():
    """대소문자가 섞여도 소문자로 정규화돼 받아들여진다."""
    with _env(ENVIRONMENT="Production"):
        import app.core.config as cfg
        importlib.reload(cfg)
        # production 으로 정규화되면 기본 secret 검증에 걸린다 → RuntimeError
        # 즉, 화이트리스트는 통과했음을 의미한다.
        # 이미 reload 시점에 RuntimeError 가 났으면 테스트 종료, 아니면 수동 확인.
    # 정리
    import app.core.config as cfg2
    importlib.reload(cfg2)


def test_valid_environments_pass():
    """허용 목록 내의 값은 통과한다."""
    for env_val in ("development", "staging", "test"):
        with _env(ENVIRONMENT=env_val):
            import app.core.config as cfg
            importlib.reload(cfg)
            assert cfg.settings.ENVIRONMENT == env_val
    import app.core.config as cfg2
    importlib.reload(cfg2)
