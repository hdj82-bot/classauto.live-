"""daily_db_backup 단위 테스트 — pg_dump / s3 호출을 mock 으로 검증."""
from __future__ import annotations

import gzip
import subprocess
from unittest.mock import MagicMock

import pytest

from app.tasks import backup as backup_mod


@pytest.fixture
def fake_settings(monkeypatch):
    """DATABASE_URL_SYNC 와 BACKUP_S3_PREFIX 만 상황에 맞게 주입."""
    monkeypatch.setattr(
        backup_mod.settings,
        "DATABASE_URL_SYNC",
        "postgresql://ifl_prod:s3cr3t@db:5432/ifl_prod",
        raising=False,
    )
    monkeypatch.setattr(backup_mod.settings, "BACKUP_S3_PREFIX", "backups/", raising=False)


def test_parse_sync_dsn_extracts_components():
    parsed = backup_mod._parse_sync_dsn("postgresql://u:p@h:6543/d")
    assert parsed == {"host": "h", "port": "6543", "user": "u", "password": "p", "db": "d"}


def test_parse_sync_dsn_default_port():
    parsed = backup_mod._parse_sync_dsn("postgresql://u:p@h/d")
    assert parsed["port"] == "5432"


def test_parse_sync_dsn_missing_host_raises():
    with pytest.raises(ValueError):
        backup_mod._parse_sync_dsn("postgresql:///d")


def test_daily_db_backup_runs_pg_dump_and_uploads_to_s3(monkeypatch, fake_settings):
    captured: dict = {}
    dump_payload = b"PGDMP\x00\x01\x02\x03binary-dump-bytes"

    def fake_run(cmd, env=None, capture_output=False, timeout=None, check=False):
        captured["cmd"] = cmd
        captured["env"] = env
        captured["timeout"] = timeout
        result = MagicMock(spec=subprocess.CompletedProcess)
        result.returncode = 0
        result.stdout = dump_payload
        result.stderr = b""
        return result

    def fake_upload(data, key, content_type="application/octet-stream"):
        captured["upload_data"] = data
        captured["upload_key"] = key
        captured["content_type"] = content_type
        return f"https://s3.example.com/{key}"

    monkeypatch.setattr(backup_mod.subprocess, "run", fake_run)
    monkeypatch.setattr(backup_mod.s3_svc, "upload_file", fake_upload)

    result = backup_mod.daily_db_backup.run()

    assert result["status"] == "ok"
    assert result["raw_bytes"] == len(dump_payload)
    assert result["compressed_bytes"] == len(captured["upload_data"])

    # pg_dump 가 올바른 인자/PGPASSWORD 로 호출됐는지
    assert captured["cmd"][0] == "pg_dump"
    assert captured["cmd"] == [
        "pg_dump", "-h", "db", "-p", "5432", "-U", "ifl_prod",
        "-d", "ifl_prod", "-Fc",
    ]
    assert captured["env"] == {"PGPASSWORD": "s3cr3t"}

    # S3 키가 prefix + 타임스탬프 + 확장자 패턴
    assert captured["upload_key"].startswith("backups/ifl_backup_")
    assert captured["upload_key"].endswith(".dump.gz")
    assert captured["content_type"] == "application/gzip"

    # 업로드된 바이트가 gzip 으로 풀면 원본과 일치
    assert gzip.decompress(captured["upload_data"]) == dump_payload


def test_daily_db_backup_pg_dump_failure_retries(monkeypatch, fake_settings):
    def fake_run(*a, **kw):
        result = MagicMock()
        result.returncode = 1
        result.stdout = b""
        result.stderr = b"FATAL: connection refused"
        return result

    monkeypatch.setattr(backup_mod.subprocess, "run", fake_run)

    upload_called = MagicMock()
    monkeypatch.setattr(backup_mod.s3_svc, "upload_file", upload_called)

    # bind=True 태스크의 self.retry 는 Retry 예외를 던진다 — 어떤 형태로든
    # 정상 종료되지 않고 예외가 발생해야 하며, 업로드는 일어나지 않아야 한다.
    with pytest.raises(BaseException):
        backup_mod.daily_db_backup.run()

    upload_called.assert_not_called()


def test_daily_db_backup_invalid_dsn_returns_error(monkeypatch):
    monkeypatch.setattr(
        backup_mod.settings, "DATABASE_URL_SYNC", "postgresql:///d", raising=False
    )
    monkeypatch.setattr(backup_mod.settings, "BACKUP_S3_PREFIX", "backups/", raising=False)

    upload_called = MagicMock()
    monkeypatch.setattr(backup_mod.s3_svc, "upload_file", upload_called)

    result = backup_mod.daily_db_backup.run()
    assert result["status"] == "error"
    upload_called.assert_not_called()
