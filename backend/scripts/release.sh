#!/usr/bin/env bash
#
# 배포 릴리스 단계 — DB 스키마를 최신으로 올린다.
#
# Railway 의 **web(backend) 서비스 Pre-Deploy Command** 로만 설정한다:
#     bash backend/scripts/release.sh
# (서비스 root 가 backend/ 면: bash scripts/release.sh)
#
# worker/beat 서비스에는 설정하지 말 것 — 동시에 alembic 을 돌리면 마이그레이션
# 락 경합이 난다. 마이그레이션은 web 서비스 한 곳에서만 수행한다.
#
# Railway 가 새 컨테이너를 띄우되 트래픽 전환 전에 이 명령을 실행하므로,
# 코드가 새 컬럼을 참조하기 전에 스키마가 먼저 올라간다(스키마 드리프트 방지).
#
# DB URL: alembic/env.py 가 DATABASE_URL_SYNC(Supabase Pooler·psycopg2) 를 우선
# 사용하고, 없으면 DATABASE_URL 에서 +asyncpg 를 제거해 동기 URL 로 변환한다.
set -euo pipefail

# alembic.ini 가 있는 backend/ 로 이동 (이 스크립트는 backend/scripts/ 에 있다).
cd "$(dirname "$0")/.."

echo "[release] alembic upgrade head ..."
alembic upgrade head
echo "[release] migrations complete."
