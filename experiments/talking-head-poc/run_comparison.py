"""토킹헤드 provider 일괄 비교 실행기.

같은 입력(사진 1장 + 음성)을 등록된 모든 provider 에 넣고, 생성 영상·소요시간을
results/ 에 모은 뒤 results/REPORT.md 표로 정리한다. 가중치/레포가 없는 provider 는
자동 skip 한다(어떤 걸 setup 해야 하는지 표에 표시).

사용:
  python run_comparison.py \
      --image samples/portrait.jpg \
      --audio samples/audio.wav \
      --repos ./repos \
      --only sadtalker,wav2lip          # (옵션) 일부만

판단 기준은 README 의 '채택 루브릭' 참고 — 입모양 정확도/머리·표정 자연스러움/
화질/속도(=원가)/한국어 발음 적합성.
"""
from __future__ import annotations

import argparse
import datetime as dt
from pathlib import Path

import providers
from providers.base import SynthesisResult, build_all


def _fmt(r: SynthesisResult) -> str:
    if not r.ok:
        why = r.error or "skip"
        return f"| {r.provider} | ⏭️/❌ | — | {r.seconds:.1f}s | {why} |"
    return f"| {r.provider} | ✅ | {r.output_path.name} | {r.seconds:.1f}s | |"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--image", required=True)
    ap.add_argument("--audio", required=True)
    ap.add_argument("--repos", default="./repos", help="공식 레포들을 clone 한 루트")
    ap.add_argument("--out", default="./results")
    ap.add_argument("--python", default="python", help="모델 실행에 쓸 파이썬(가상환경 분리 시)")
    ap.add_argument("--only", default="", help="콤마구분 provider 화이트리스트")
    args = ap.parse_args()

    image, audio = Path(args.image), Path(args.audio)
    repos_root, out_root = Path(args.repos), Path(args.out)
    for p in (image, audio):
        if not p.exists():
            raise SystemExit(f"입력 없음: {p}")

    only = {s.strip() for s in args.only.split(",") if s.strip()}
    provs = build_all(repos_root, python_bin=args.python)
    if only:
        provs = [p for p in provs if p.name in only]

    results: list[SynthesisResult] = []
    for prov in provs:
        out = out_root / prov.name / f"{prov.name}.mp4"
        print(f"▶ {prov.name} … (available={prov.is_available()})")
        r = prov.synthesize(image, audio, out)
        print(f"   {'OK' if r.ok else 'SKIP/FAIL'}  {r.seconds:.1f}s  {r.error}")
        if r.log:
            (out_root / prov.name).mkdir(parents=True, exist_ok=True)
            (out_root / prov.name / "log.txt").write_text(r.log, encoding="utf-8")
        results.append(r)

    out_root.mkdir(parents=True, exist_ok=True)
    report = [
        f"# 토킹헤드 비교 — {dt.datetime.now():%Y-%m-%d %H:%M}",
        "",
        f"- 입력 사진: `{image}`",
        f"- 입력 음성: `{audio}`",
        "",
        "| provider | 상태 | 출력 | 소요 | 비고 |",
        "|---|---|---|---|---|",
        *[_fmt(r) for r in results],
        "",
        "## 판단 메모 (사람이 채움)",
        "각 영상을 보고 입모양 정확도 / 머리·표정 자연스러움 / 화질 / 한국어 적합성을",
        "1~5 로 적고, 속도(소요)로 원가를 가늠해 채택 후보를 고른다. (README 루브릭)",
        "",
    ]
    (out_root / "REPORT.md").write_text("\n".join(report), encoding="utf-8")
    print(f"\n작성됨: {out_root / 'REPORT.md'}")
    print("각 provider 의 results/<name>/*.mp4 를 직접 재생해 비교하세요.")


if __name__ == "__main__":
    main()
