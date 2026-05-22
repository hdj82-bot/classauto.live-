#!/usr/bin/env bash
# LivePortrait — 사진에 머리·표정 모션 입히기(구동 영상 기반). MuseTalk 와 조합용.
# 공식: https://github.com/KwaiVGI/LivePortrait
set -euo pipefail
REPOS="${1:-./repos}"
mkdir -p "$REPOS"
cd "$REPOS"

[ -d liveportrait ] || git clone https://github.com/KwaiVGI/LivePortrait.git liveportrait
cd liveportrait

conda create -y -n liveportrait python=3.10 || true
# shellcheck disable=SC1091
source activate liveportrait 2>/dev/null || conda activate liveportrait
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
pip install -r requirements.txt

# 가중치: huggingface (KwaiVGI/LivePortrait) — 레포 README 의 안내(VERIFY).
huggingface-cli download KwaiVGI/LivePortrait --local-dir pretrained_weights --exclude "*.git*" || \
  echo "⚠️ huggingface-cli 필요(pip install huggingface_hub) — README 가중치 안내 따르세요."

echo "✅ LivePortrait 준비 → $REPOS/liveportrait"
echo "   조합 실행 시 구동영상: assets/examples/driving/*.mp4 또는 TH_DRIVING_VIDEO 로 지정."
