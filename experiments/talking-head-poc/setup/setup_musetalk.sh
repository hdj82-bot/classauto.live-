#!/usr/bin/env bash
# MuseTalk — 고품질 실시간 립싱크(입력 영상의 입 영역을 다시 그림).
# 공식: https://github.com/TMElyralab/MuseTalk
set -euo pipefail
REPOS="${1:-./repos}"
mkdir -p "$REPOS"
cd "$REPOS"

[ -d musetalk ] || git clone https://github.com/TMElyralab/MuseTalk.git musetalk
cd musetalk

conda create -y -n musetalk python=3.10 || true
# shellcheck disable=SC1091
source activate musetalk 2>/dev/null || conda activate musetalk
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
pip install -r requirements.txt
# mmlab 계열 의존성(레포 README 참고, VERIFY): mmcv, mmdet, mmpose 등.

# 가중치: 레포가 제공하는 다운로드 스크립트 사용(VERIFY: 경로/이름).
[ -f download_weights.sh ] && bash download_weights.sh || \
  echo "⚠️ download_weights.sh 없음 — README 의 huggingface 가중치 안내(models/) 따르세요."

echo "✅ MuseTalk 준비(코드). models/ 에 가중치가 채워졌는지 확인하세요 → $REPOS/musetalk"
