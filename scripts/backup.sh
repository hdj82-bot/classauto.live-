#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
# IFL Platform — DB 백업/복원 스크립트 (수동/복구 시나리오용)
#
# ※ 정기 백업은 Celery beat 의 app.tasks.backup.daily_db_backup 가
#   매일 UTC 03:00 에 S3({BACKUP_S3_PREFIX}) 로 자동 수행한다.
#   본 스크립트는 호스트 측 수동 백업·복원·즉시 점검용이다.
#
# 사용법:
#   ./scripts/backup.sh backup              # DB 백업 생성 (호스트 로컬)
#   ./scripts/backup.sh restore backup.sql   # DB 복원
#   ./scripts/backup.sh list                 # 백업 목록
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

BACKUP_DIR="${PROJECT_DIR}/backups"
COMPOSE_FILE="docker-compose.prod.yml"
CONTAINER="ifl_db"

# .env에서 DB 정보 로드
if [ -f .env ]; then
    export $(grep -E '^POSTGRES_(USER|PASSWORD|DB)=' .env | xargs)
fi
DB_USER="${POSTGRES_USER:-ifl_prod}"
DB_NAME="${POSTGRES_DB:-ifl_prod}"

mkdir -p "$BACKUP_DIR"

cmd_backup() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local filename="ifl_backup_${timestamp}.sql.gz"
    local filepath="${BACKUP_DIR}/${filename}"

    echo "[BACKUP] DB 백업 시작: $DB_NAME"

    docker exec "$CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$filepath"

    local size=$(du -h "$filepath" | cut -f1)
    echo "[BACKUP] 완료: $filename ($size)"

    # 30일 이상 된 백업 자동 삭제
    find "$BACKUP_DIR" -name "ifl_backup_*.sql.gz" -mtime +30 -delete 2>/dev/null || true
    echo "[BACKUP] 30일 이상 된 백업 정리 완료"
}

cmd_restore() {
    local filepath="$1"

    if [ ! -f "$filepath" ]; then
        echo "[ERROR] 파일을 찾을 수 없습니다: $filepath"
        exit 1
    fi

    echo "[RESTORE] 주의: 현재 DB를 덮어씁니다!"
    read -p "계속하시겠습니까? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        echo "취소됨"
        exit 0
    fi

    # 복원 전 현재 상태 백업
    echo "[RESTORE] 복원 전 현재 DB 백업 중..."
    cmd_backup

    echo "[RESTORE] DB 복원 중: $filepath"
    if [[ "$filepath" == *.gz ]]; then
        gunzip -c "$filepath" | docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME"
    else
        docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" < "$filepath"
    fi

    echo "[RESTORE] 완료"
}

cmd_list() {
    echo "[BACKUP] 백업 목록:"
    echo ""
    if ls "$BACKUP_DIR"/ifl_backup_*.sql.gz 1>/dev/null 2>&1; then
        ls -lh "$BACKUP_DIR"/ifl_backup_*.sql.gz
    else
        echo "  (백업 파일 없음)"
    fi
}

case "${1:-help}" in
    backup)   cmd_backup ;;
    restore)  cmd_restore "${2:?'복원할 파일 경로를 지정하세요'}" ;;
    list)     cmd_list ;;
    help|*)
        echo "사용법: $0 {backup|restore <file>|list}"
        ;;
esac
