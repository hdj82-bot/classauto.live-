#!/usr/bin/env bash
# Wav2Lip — 립싱크만(머리 고정), 가장 가볍고 빠름·저렴.
# 공식: https://github.com/Rudrabha/Wav2Lip
# (원본 가중치 링크가 자주 깨짐 → 유지보수 포크 justinjohn0306/Wav2Lip 권장)
set -euo pipefail
REPOS="${1:-./repos}"
mkdir -p "$REPOS"
cd "$REPOS"

[ -d wav2lip ] || git clone https://github.com/justinjohn0306/Wav2Lip.git wav2lip
cd wav2lip

conda create -y -n wav2lip python=3.10 || true
# shellcheck disable=SC1091
source activate wav2lip 2>/dev/null || conda activate wav2lip
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
pip install -r requirements.txt

mkdir -p checkpoints
echo "▶ 가중치(wav2lip_gan.pth)와 얼굴검출(s3fd.pth)을 checkpoints/ 에 넣으세요."
echo "  포크 README 의 다운로드 링크 참고(VERIFY): "
echo "   - checkpoints/wav2lip_gan.pth"
echo "   - face_detection/detection/sfd/s3fd.pth"
echo "✅ Wav2Lip 코드 준비 완료 → $REPOS/wav2lip (가중치만 채우면 실행 가능)"
