# 토킹헤드 자체 호스팅 PoC (별도 실험 공간)

목표: **사진 1장 + 음성 → 말하는 얼굴 영상**을 오픈소스 모델로 자체 생성해, HeyGen
대비 **원가를 1/50 수준**으로 낮출 수 있는지 검증한다. 품질이 강의용으로 "나쁘지
않으면" 채택 → 기존 `backend/app/services/pipeline/heygen.py` 자리에 provider 로 끼운다.

> 이 디렉토리는 **프로덕션 코드가 아니라 실험(spike)** 이다. 같은 입력을 여러 모델에
> 동일 인터페이스로 넣어 품질·속도·비용을 한 자리에서 비교하기 위한 하니스다.

## ⚠️ 실행 환경 (중요)
이 PC에는 **NVIDIA GPU가 없어 여기서 모델을 돌릴 수 없다**(`nvidia-smi` 부재). 모든
모델은 **CUDA GPU(Linux)** 가 필요하다. 권장: **RunPod / Vast.ai 에서 시간당 빌리는
GPU**(아래 비용 참고). 코드·스크립트·하니스는 그 환경에서 바로 돌아가도록 작성했다.

## 비교 대상 (4종)
| provider | 방식 | 머리/표정 | 입모양 | 속도/원가 | 비고 |
|---|---|---|---|---|---|
| **wav2lip** | 정지 얼굴에 립싱크만 | ✕(고정) | 높음 | 가장 빠름/쌈 | 가볍지만 "정적" |
| **sadtalker** | 사진→토킹헤드(머리 모션) | ○ | 보통 | 보통 | 단일 사진 PoC 최적 |
| **musetalk** | 영상 입영역 재생성(실시간급) | 입력영상 의존 | 매우 높음 | 빠름 | 사진은 still-video 로 변환 입력 |
| **musetalk_liveportrait** | LivePortrait(모션)+MuseTalk(립싱크) | ◎ | 매우 높음 | 가장 무거움 | 가장 자연스럽지만 셋업 복잡 |

## GPU 비용 감 (2026년, 대략)
- Vast.ai/RunPod 소비자급(RTX 3090/4090, 24GB) ≈ **시간당 $0.2~0.5**.
- 모델이 거의 실시간이면 1분 영상 ≈ 1분 GPU → **약 $0.005~0.01/분**. (HeyGen $0.5~1/분)
- 대량 배치면 인스턴스를 켠 시간만큼만 과금 → 강의 몰아서 렌더하면 더 저렴.

## 실행 절차 (RunPod/Vast GPU에서)
```bash
# 0) GPU 인스턴스(Ubuntu + CUDA 12.x) 띄우고 이 폴더 업로드 후
cd experiments/talking-head-poc
bash setup/common.sh                 # ffmpeg, conda 등

# 1) 테스트할 모델만 셋업(레포 clone + 가중치). repos/ 에 받힌다.
bash setup/setup_sadtalker.sh ./repos
bash setup/setup_wav2lip.sh   ./repos
bash setup/setup_musetalk.sh  ./repos
bash setup/setup_liveportrait.sh ./repos     # 조합 쓸 때만

# 2) 입력 준비: 얼굴 사진 1장 + 음성
#    - 사진: samples/portrait.jpg (정면 상반신, 흰 배경 권장)
#    - 음성: 한국어 강의 한 토막을 TTS 로 생성(무료):
pip install edge-tts
python tts.py --text "안녕하세요. 오늘은 把자문 구조를 다룹니다." --out samples/audio.wav

# 3) 일괄 비교 실행 (가중치 없는 모델은 자동 skip)
python run_comparison.py --image samples/portrait.jpg --audio samples/audio.wav --repos ./repos
#  └ 모델별 conda 환경이 다르면 --python /path/to/envs/<name>/bin/python 로 따로 돌리거나
#    --only sadtalker 처럼 하나씩 실행

# 4) 결과 보기
#    results/<provider>/<provider>.mp4  ← 직접 재생해 눈으로 비교
#    results/REPORT.md                  ← 상태·소요시간 표(판단 메모 칸 포함)
```

## 채택 루브릭 (영상 보고 1~5점)
1. **입모양 정확도** — 한국어 발음과 입이 맞는가
2. **머리·표정 자연스러움** — 정지 인형 같지 않은가
3. **화질/안정성** — 떨림·아티팩트
4. **한국어 적합성** — 한국어 음성에서도 어색하지 않은가
5. **속도(=원가)** — 1분 영상당 GPU 시간 → $/분 환산

대략의 예상: 빠른 검증은 **SadTalker**(단일 사진·머리 모션), 입모양 최상은
**MuseTalk**, 가장 자연스러움은 **LivePortrait+MuseTalk 조합**(대신 셋업·비용↑).
강의 톤(차분한 상반신 발화)이면 SadTalker / MuseTalk 단독으로도 충분할 가능성이 높다.

## 채택 시 통합 경로
`providers/base.TalkingHeadProvider` 인터페이스가 곧 프로덕션 추상화의 원형이다.
승자 모델을 백엔드 **render 워커**(GPU)로 옮기고, `heygen.py` 와 동일한
`create_video(...)` 시그니처를 갖는 provider 로 감싸 환경변수로 교체 가능하게 한다.
(원하면 그 provider 추상화 설계를 별도로 진행)

## 정직한 한계 / VERIFY
- 본 PC에 GPU가 없어 **저자가 직접 실행·검증하지 못했다**. 어댑터의 일부 CLI 인자는
  각 레포 버전에 따라 다를 수 있어 코드에 `VERIFY:` 로 표시했다 — PoC 첫 실행 때
  공식 README 와 대조해 1회 고정하면 된다.
- MuseTalk 은 '영상' 입력이라 단일 사진은 still-video 로 변환해 넣는다(머리 고정).
  머리 모션까지 원하면 LivePortrait 조합을 쓴다.
- 가중치 다운로드 링크/방법은 각 레포가 자주 바꾼다 — setup 스크립트는 공식 레포의
  다운로드 절차를 호출하되, 막히면 README 안내를 따르도록 했다.
