"""courses.slug — Course 단위 학생 진입 `/c/[slug]` (스펙 15 2단계).

Revision ID: 0077
Revises: 0076
Create Date: 2026-07-26

배경(스펙 15 §1.1): 학생 진입이 `/v/[slug]` 로 **Lecture 단위**라 12주차 수업이면 링크도
QR 도 12개고 교수자가 매주 새로 뿌려야 한다. 매주 배포가 곧 매주의 이탈 지점이다.

Course 단위 진입(`/c/[slug]`)이 생기면 학기 초 QR 1회로 끝난다 — 이후 발행되는 강의는
등록 학생에게 자동으로 노출된다. 그 라우트를 만들려면 `courses` 에도 slug 가 필요하다
(`lectures.slug` 는 이미 unique+index 다).

변경
----
- ``courses.slug`` VARCHAR(300) — 기존 행 백필 후 NOT NULL + UNIQUE
- ``ix_courses_slug`` unique index

백필
----
`utils.slug.slugify` 와 **같은 규칙**을 SQL 로 재현하지 않고 파이썬으로 행마다 만든다.
그 함수는 UUID 8자리 접미사를 붙이므로 충돌이 사실상 없다. 제목이 비어 슬러그 본문이
공백이 되는 행은 ``course-<uuid8>`` 로 떨어뜨린다(빈 문자열 slug 는 URL 이 안 된다).

만에 하나 접미사가 겹치면 재시도한다 — UNIQUE 를 걸기 전에 파이썬에서 확인한다.

다운그레이드는 컬럼·인덱스 제거.
"""
import re
import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0077"
down_revision: Union[str, None] = "0076"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLE = "courses"
_INDEX = "ix_courses_slug"


def _has_table(table: str) -> bool:
    insp = sa.inspect(op.get_bind())
    return table in insp.get_table_names()


def _has_column(table: str, column: str) -> bool:
    insp = sa.inspect(op.get_bind())
    try:
        return any(c["name"] == column for c in insp.get_columns(table))
    except Exception:  # noqa: BLE001
        return False


def _has_index(table: str, name: str) -> bool:
    insp = sa.inspect(op.get_bind())
    try:
        return any(ix["name"] == name for ix in insp.get_indexes(table))
    except Exception:  # noqa: BLE001
        return False


def _slugify(title: str) -> str:
    """`app/utils/slug.py::slugify` 와 동일 규칙.

    마이그레이션은 앱 코드를 import 하지 않는다 — 앱이 나중에 그 함수를 바꿔도 이미
    실행된 마이그레이션의 결과가 달라지면 안 되기 때문이다. 규칙을 여기 고정한다.
    """
    slug = (title or "").strip().lower()
    slug = re.sub(r"[^\w\s\-가-힣]", "", slug, flags=re.UNICODE)
    slug = re.sub(r"[\s_\-]+", "-", slug)
    slug = slug.strip("-")
    suffix = uuid.uuid4().hex[:8]
    # 제목이 기호뿐이면 본문이 빈다 — 빈 slug 는 URL 이 되지 않는다.
    return f"{slug}-{suffix}" if slug else f"course-{suffix}"


def upgrade() -> None:
    if not _has_table(_TABLE):
        return

    if not _has_column(_TABLE, "slug"):
        # 백필 전이라 nullable 로 추가한다.
        op.add_column(_TABLE, sa.Column("slug", sa.String(300), nullable=True))

    bind = op.get_bind()
    rows = bind.execute(
        sa.text(f"SELECT id, title FROM {_TABLE} WHERE slug IS NULL")
    ).fetchall()

    used: set[str] = {
        r[0]
        for r in bind.execute(
            sa.text(f"SELECT slug FROM {_TABLE} WHERE slug IS NOT NULL")
        ).fetchall()
    }
    for row in rows:
        slug = _slugify(row[1])
        while slug in used:  # 접미사 충돌 — 사실상 없지만 UNIQUE 전에 확인한다.
            slug = _slugify(row[1])
        used.add(slug)
        bind.execute(
            sa.text(f"UPDATE {_TABLE} SET slug = :slug WHERE id = :id"),
            {"slug": slug, "id": row[0]},
        )

    op.alter_column(_TABLE, "slug", existing_type=sa.String(300), nullable=False)

    if not _has_index(_TABLE, _INDEX):
        op.create_index(_INDEX, _TABLE, ["slug"], unique=True)


def downgrade() -> None:
    if _has_index(_TABLE, _INDEX):
        op.drop_index(_INDEX, table_name=_TABLE)
    if _has_column(_TABLE, "slug"):
        op.drop_column(_TABLE, "slug")
