#!/usr/bin/env bash
# 공통 시스템 의존성 (Ubuntu/Debian GPU 인스턴스 기준 — RunPod/Vast).
# conda 권장: 모델별 파이썬/torch 버전 충돌이 잦아 환경을 분리하는 게 안전하다.
set -euo pipefail

sudo apt-get update -y
sudo apt-get install -y git git-lfs ffmpeg build-essential wget unzip
git lfs install

# (옵션) miniconda 설치 — 이미 있으면 skip.
if ! command -v conda >/dev/null 2>&1; then
  wget -q https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh -O /tmp/mc.sh
  bash /tmp/mc.sh -b -p "$HOME/miniconda3"
  echo 'export PATH="$HOME/miniconda3/bin:$PATH"' >> "$HOME/.bashrc"
  export PATH="$HOME/miniconda3/bin:$PATH"
fi

echo "공통 셋업 완료. nvidia-smi 로 GPU 확인:"
nvidia-smi || echo "⚠️ GPU 안 보임 — CUDA 인스턴스인지 확인"
