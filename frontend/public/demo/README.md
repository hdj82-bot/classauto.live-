# /public/demo — 데모 영상 placeholder

이 디렉토리는 `/demo` 페이지에서 노출되는 데모 영상의 정적 자산을 둡니다.
W3 단계에서는 영상 파일이 아직 없으므로 SVG 포스터만 제공하며, 실제 영상이
준비되면 같은 slug 로 mp4 파일을 추가하면 즉시 활성화됩니다.

## 파일 명명 규약

| slug | 분야 | 영상 파일 | 포스터 |
|---|---|---|---|
| `social-science` | 사회과학 (현대중국사회의 이해) | `social-science.mp4` | `social-science.poster.svg` |
| `natural-science` | 자연과학·공학 (특수상대성이론 입문) | `natural-science.mp4` | `natural-science.poster.svg` |

## 추가 절차

1. `<slug>.mp4` 를 이 디렉토리에 배치 (5분 이내, 1280x720 / 720p 권장)
2. 자막은 WebVTT (`<slug>.vtt`) — 한국어 기본, 영문은 후속 작업
3. 데모 페이지(`DemoVideo.tsx`)는 `HEAD` 요청으로 영상 존재 여부를 감지하고
   placeholder ↔ 실제 영상 사이에서 자동 분기합니다.

## TODO

- [ ] `social-science.mp4` 추가 (어흥 교수님 5분 클립 · AI 아바타 음성 재합성)
- [ ] `natural-science.mp4` 추가 (특수상대성이론 5분 클립)
- [ ] 자막 파일 (`*.vtt`)
- [ ] 1분 타임랩스 영상 (`timelapse-12min-build.mp4`) — Section 14
