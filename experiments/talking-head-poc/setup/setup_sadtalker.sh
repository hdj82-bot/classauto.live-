#!/usr/bin/env bash
# SadTalker — 사진+오디오→토킹헤드(머리 움직임 포함). 가장 테스트하기 쉬움.
# 공식: https://github.com/OpenTalker/SadTalker  (가중치 다운로드 스크립트 포함)
set -euo pipefail
REPOS="${1:-./repos}"
mkdir -p "$REPOS"
cd "$REPOS"

[ -d sadtalker ] || git clone https://github.com/OpenTalker/SadTalker.git sadtalker
cd sadtalker

conda create -y -n sadtalker python=3.10 || true
# shellcheck disable=SC1091
source activate sadtalker 2>/dev/null || conda activate sadtalker
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
pip install -r requirements.txt

# 가중치: 레포가 제공하는 다운로드 스크립트 사용(VERIFY: 파일명 bash 인지 확인).
bash scripts/download_models.sh

echo "✅ SadTalker 준비 완료 → $REPOS/sadtalker"
echo "   conda 환경 'sadtalker' 의 python 경로를 run_comparison.py --python 에 넘기면 됩니다."
