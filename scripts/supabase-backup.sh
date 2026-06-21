#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# IFL Platform — 관리형 Supabase 주 1회 pg_dump 백업
#
# OPERATIONS_RUNBOOK.md §8.6 의 "반자동 옵션" 구현. Supabase Free 티어는 PITR 가
# 없고, 기존 .github/workflows/backup.yml 은 VPS 모드(vars.DEPLOY_ENABLED)에서만
# 돌아 관리형 Supabase 스택은 자동 백업이 없다. 이 스크립트가 그 갭을 메운다.
#
# .github/workflows/backup-supabase.yml(주 1회 cron)이 이 스크립트를 호출하며,
# 교수님이 손으로 1회 백업할 때도 그대로 쓸 수 있다(같은 산출물·플래그).
#
# 사용법(수동):
#   export PGURL="postgresql://postgres.<ref>:<password>@<host>:5432/postgres"
#   ./scripts/supabase-backup.sh                 # ./backups/ 로 로컬 저장
#   BACKUP_S3_BUCKET=ifl-backups ./scripts/supabase-backup.sh   # S3 업로드
#
# 환경변수:
#   PGURL                필수. Supabase Direct connection string(비밀번호 포함).
#                        (DATABASE_URL_BACKUP 로도 받음 — backup.yml 과 키 호환)
#   BACKUP_S3_BUCKET     선택. 있으면 S3 업로드, 없으면 BACKUP_OUT_DIR(기본 ./backups).
#   BACKUP_S3_PREFIX     선택. 기본 "ifl-backup/supabase".
#   BACKUP_OUT_DIR       선택. 로컬 저장 디렉터리(기본 ./backups). 30일 경과분 자동 삭제.
#
# 주의: PGURL 은 비밀번호를 포함하므로 echo/로그에 절대 출력하지 않는다.
# 복원: gunzip -c ifl-YYYYMMDD-HHMMSS.sql.gz | psql "$PGURL"
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

PGURL="${PGURL:-${DATABASE_URL_BACKUP:-}}"
if [ -z "${PGURL}" ]; then
  echo "::error::PGURL (또는 DATABASE_URL_BACKUP) 환경변수가 필요합니다." >&2
  exit 1
fi

STAMP="$(date -u +%Y%m%d)"
TIME="$(date -u +%H%M%S)"
FILE="ifl-${STAMP}-${TIME}.sql.gz"
TMPDIR_BK="$(mktemp -d)"
OUT="${TMPDIR_BK}/${FILE}"
# 어떤 종료 경로에서도 임시 파일을 남기지 않는다(비밀번호 포함 X 이지만 위생).
trap 'rm -rf "${TMPDIR_BK}"' EXIT

# --no-owner --no-privileges: 복원 시 다른 환경의 role/permission 차이로 깨지지
# 않게(= backup.yml 과 동일 플래그). pg 클라이언트는 서버와 같은 pg16 권장.
pg_dump --no-owner --no-privileges --format=plain "${PGURL}" | gzip -9 > "${OUT}"

# stat 은 GNU(-c%s)/BSD(-f%z) 둘 다 지원.
SIZE="$(stat -c%s "${OUT}" 2>/dev/null || stat -f%z "${OUT}")"
echo "backup size: ${SIZE} bytes"
if [ "${SIZE}" -lt 1024 ]; then
  echo "::error::백업 파일이 비정상적으로 작습니다(<1KB) — 덤프 실패 의심." >&2
  exit 1
fi

if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  PREFIX="${BACKUP_S3_PREFIX:-ifl-backup/supabase}"
  DEST="s3://${BACKUP_S3_BUCKET}/${PREFIX}/${STAMP}/${TIME}.sql.gz"
  aws s3 cp "${OUT}" "${DEST}" --only-show-errors --no-progress
  echo "uploaded: ${DEST}"
  echo "보관 정책(예: 30/90일)은 S3 버킷 lifecycle 로 설정하세요."
else
  DIR="${BACKUP_OUT_DIR:-./backups}"
  mkdir -p "${DIR}"
  mv "${OUT}" "${DIR}/${FILE}"
  echo "saved: ${DIR}/${FILE}"
  # 로컬 보관 30일 정리(S3 미사용 시).
  find "${DIR}" -name 'ifl-*.sql.gz' -mtime +30 -delete 2>/dev/null || true
fi
