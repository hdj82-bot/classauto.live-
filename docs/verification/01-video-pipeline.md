# 검증 보고서 — 강의 영상 생성 파이프라인 (창 1)

> 대상: PPT 업로드 → 스크립트 생성 → TTS → 렌더 → Video done → 학생 슬라이드쇼 재생
> 작성: 2026-06-05 · 브랜치 `verify/video-pipeline`
> 방식: 코드 정독 + 자동 테스트(기존 + 신규) + 프로덕션 수동 스모크 절차 정의
> 환경 한계: 이 작업 환경은 docker 데몬·node_modules 부재. 백엔드 테스트는 `uv`로 실행 가능,
> **프론트 빌드·실 프로덕션 파이프라인(HeyGen/Claude 실호출)은 교수자 수동 스모크에서만 최종 확인**.

---

## 0. 결론 (한 줄)

파이프라인은 **성숙하고 회귀 테스트가 촘촘하다.** 최근 핵심 픽스(#268·#270·#272·#343)는 모두
코드에 살아 있고 테스트로 고정돼 있다. 자동 증명이 비어 있던 **slideshow 완료→Video done 전환
"호출" 가드**만 본 창에서 보강했다. **남은 단일 미검증은 프로덕션 실호출 end-to-end(§5 수동 스모크)** 이며,
이는 코드가 아니라 교수자가 실제 PPT로 1회 돌려야 닫힌다.

---

## 1. 실제 아키텍처 (코드 기준)

```
[업로드]  POST /api/v1/render/upload (api/v1/render.py)
          → S3 업로드 → start_pipeline(task_id, s3_key, instructor, lecture)

[생성 체인] app/tasks/pipeline.py  (Celery chain, 5단계)
   step1_parse            PPT 다운로드 → PPTX 파싱 + 슬라이드 PNG 렌더·업로드(graceful)
   step2_embed            OpenAI 임베딩 → pgvector 저장
   step3_generate_scripts Claude 슬라이드별 스크립트
   step4_mark_pending_review  Video+VideoScript 영속화 → PENDING_REVIEW  ※ #186 이전엔 DB 무작업이었음
   step5_notify           교수자 알림
   (실패 시 PipelineTask.on_failure → pending_review Video 를 draft 로 롤백)

[승인=렌더]  POST /api/videos/{id}/approve (api/v1/videos.py → services/video.py:approve_video)
   pending_review → rendering 전환 + 세그먼트별 VideoRender 생성 + render_slide.delay  ※ #268 (과거엔 상태만 바꾸고 렌더 미시작)

[슬라이드 렌더]  app/tasks/render.py:render_slide
   Critical 7  caller_user_id ≠ instructor_id → 즉시 종료
   Critical 8  audio/heygen 산출물 존재 시 단계별 idempotent skip
   예산 게이트  slideshow 모드는 HeyGen 미사용 → assert_heygen_budget 건너뜀
   TTS → S3 업로드(비용은 record_once_committed 로 별도 트랜잭션 즉시 commit)
   ├─ slideshow 모드(기본): HeyGen 미호출, status=ready, finalize_video_if_all_ready → Video done   ※ #343
   └─ heygen 모드(레거시): presigned 오디오 URL 로 create_video 제출 → 폴링                       ※ #270

[완료 폴링]  app/tasks/polling.py:poll_pending_renders (beat 10분)
   HeyGen 완료 → S3 업로드 → ready → 강의 전체 ready 면 finalize → Video done

[학생 재생]  GET /api/lectures/{slug}/slideshow
   → frontend useSlideshowPlayback.ts: 슬라이드 이미지 + 구간 음성 + 타임라인을
     단일 <audio>로 이어 재생, video 동등 API 노출(PlayerV2). 음성 미생성 슬라이드는
     세그먼트 추정치만큼 무음 폴백, `ready` 플래그로 "준비 중" 처리.

[mp4 내려받기]  app/tasks/export.py:compose_lecture_mp4 (on-demand)
   슬라이드 이미지 + 구간 음성 → ffmpeg per-slide 클립 → concat → S3 업로드.
   멱등(mp4_status=ready skip)·소유권 검증·ffmpeg 부재 graceful·에러 사유 분류.
```

비용 설계 핵심: 본문은 **slideshow 가 프로덕션 기본**(`LECTURE_BODY_PROVIDER=slideshow`)이라
슬라이드별 HeyGen 클립을 굽지 않는다. HeyGen 은 Q&A 아바타 답변(창 2) 전용으로 분리.

---

## 2. 자동으로 증명된 것 (테스트로 고정)

`uv run --with-requirements requirements.txt --with-requirements requirements-test.txt --with python-pptx pytest <파일>` 로 재현.

| 영역 | 테스트 | 상태 |
|---|---|---|
| 업로드 API → S3 + 파이프라인 트리거 (파일명 강제·매직바이트) | test_e2e_pipeline.py | ✅ |
| step1~5 각 단계 + `_estimate_segments` 타이밍 | test_e2e_pipeline.py | ✅ |
| step4 DB 영속화(#186) + lecture_id 누락 시 실패 | test_e2e_pipeline.py | ✅ |
| render_slide TTS→S3→HeyGen(heygen 모드) + 인자 전달 | test_e2e_pipeline.py | ✅ |
| **render_slide slideshow 모드 → HeyGen 미호출·ready** | test_pipeline_render_idempotency.py | ✅ |
| Critical 7 소유권 거부 / Critical 8 단계별 idempotent skip | test_pipeline_render_idempotency.py | ✅ |
| 중복 렌더 차단 가드(#272) | test_pipeline_render_idempotency.py | ✅ |
| 비용 즉시 commit(TTS·HeyGen) — 후속 rollback 무관(#H) | test_pipeline_cost_committed.py | ✅ |
| 예산 서킷 브레이커 일/월 한도 + mock 면제 | test_budget.py | ✅ |
| finalize_video_if_all_ready 전환/보류/멱등 | test_video_status.py | ✅ |
| approve → rendering + render_slide enqueue(#268) / 재승인 409 / 빈 스크립트 거부 | test_videos.py | ✅ |
| polling 완료 → S3 + ready + 알림 | test_e2e_pipeline.py | ✅ |
| mp4 on-demand 합성 / 멱등 / 소유권 / ffmpeg 부재 | test_lecture_download.py | ✅ |
| **[신규] slideshow 완료 시 done 전환 "호출" 가드(#343) + finalize 실패해도 렌더 성공** | **test_render_done_transition.py** | ✅ |

신규 추가: `backend/tests/test_render_done_transition.py` (2건). 합산 실행 결과 **green**
(예: test_e2e + video_status + budget + idempotency + cost_committed = 42 passed;
download + done_transition + e2e + videos = 34 passed).

### 비용·관측 점검 결과
- **테스트는 외부 실호출을 하지 않는다.** TTS/HeyGen/Claude/OpenAI/S3 는 전부 mock/patch.
- **예산 서킷 브레이커**(budget.py)는 `HEYGEN_MOCK` 시 면제, 한도 0 시 비활성, 일/월 윈도 합산. 기본 한도 $3/일·$15/월.
- **presigned 오디오 URL**(#270): HeyGen 이 익명 GET 으로 오디오를 받으므로 영구 URL(403) 대신 24h presigned 전달. DB엔 영구 URL 유지(멱등 영향 없음).
- **계측은 이미 와이어링됨**(이전 "死코드" 메모는 #165에서 해소): `CELERY_TASK_COUNT`는 celery 시그널로 전 태스크 자동 집계, 외부 API(HeyGen·ElevenLabs·OpenAI·Claude·번역)는 `@track_external_api` 데코레이터로 `EXTERNAL_API_CALLS/DURATION` 계측. → **추가 계측 불필요**.

---

## 3. 최근 픽스 회귀 상태

| PR | 내용 | 현재 코드 | 회귀 가드 |
|---|---|---|---|
| #186 | step4 가 스크립트를 DB 영속화 | pipeline.py:304 살아 있음 | test_e2e_pipeline (영속화·누락 실패) |
| #268 | 승인 시 실제 렌더 시작 연결 | video.py:356–404 (VideoRender+delay) | test_videos.py:test_approve_video |
| #270 | HeyGen 오디오를 presigned 로 | render.py:231 | (코드 정독 — heygen 모드 테스트가 경로 통과) |
| #272 | 슬라이드 중복 렌더 차단 | render.py:_DEDUP_BLOCKING_STATUSES | test_pipeline_render_idempotency |
| #343 | 본문 렌더 완료 시 Video done | render.py:196 + video_status.py | **test_render_done_transition (신규)** + test_video_status |

---

## 4. 발견 / 플래그 (수정 없음 — 위험 낮음, 타 창/후속)

1. **slide_number 좌표계 혼재(경미)**: 승인 경로(video.py)는 `VideoRender.slide_number = seg["slide_index"]`(0-based)로,
   create_render_request(render.py)는 scripts의 `slide_number`(1-based)로 채운다. 각 경로는 내부적으로 일관되고
   썸네일 트리거가 `slide_number in (0,1)`로 양쪽을 포괄하므로 **현재 버그 아님**. 다만 두 경로가 같은 강의에
   섞이면 dedup 키가 어긋날 수 있어 장기적으로 한 좌표계로 통일 권장. (스키마 변경 불필요 → 본 창 범위 내 수정도
   가능하나, 행위 변화 위험이 있어 단독 PR 권장.)
2. **create_render_request 와 approve_video 의 이원화**: 둘 다 VideoRender 생성+enqueue 를 하지만 dedup 가드는
   create_render_request 에만 있다. approve 는 `status != pending_review → 409` 로 중복을 막으므로 실사용상 안전.
   studio 표준 경로가 approve 이면 create_render_request 는 정리 대상 후보.
3. **프론트 player 자동 테스트 부재**: `frontend/src/components/player/**` 에 유닛 테스트가 없다. node_modules
   부재로 본 창에서 추가·실행하지 못함. 코드 정독상 견고(음성 미생성 무음 폴백·`ready` 게이트). → 후속 또는
   프론트 환경에서 `useSlideshowPlayback` 회귀 테스트 신설 권장.

---

## 5. 프로덕션 수동 스모크 절차 (교수자 — 코드로 못 닫는 유일한 블로커)

> 사전: `https://api.classauto.live/health/deep` 가 db/redis/s3/celery 전부 `ok`. `celery=no_workers` 면 즉시 중단(워커 사망).

1. **업로드**: `/professor` 에서 강의 생성 → 작은 PPT(5~10장, 5MB↓) 업로드.
   - 확인: DevTools Network `POST /api/v1/render/upload` 200, 응답에 `task_id`·`celery_task_id`.
   - Railway celery-worker 로그: `Step1 완료 … N 슬라이드` → `Step4 완료 … PENDING_REVIEW`.
2. **스크립트 검토**: 스튜디오에 슬라이드별 스크립트가 뜨는지(빈 把자문 데모 폴백이면 #186 회귀). 한 슬라이드 편집·저장 후 새로고침 유지.
3. **승인=생성 시작**: 승인 → 상태가 `rendering` → 잠시 후 `done`.
   - 확인: 워커 로그 `render_slide 슬라이드쇼 완료(HeyGen 생략)` × 슬라이드 수 → `Video done 전환`.
   - **HeyGen 크레딧이 줄지 않아야 정상**(본문은 slideshow). 줄었다면 `LECTURE_BODY_PROVIDER` 가 heygen 으로 잘못 설정된 것.
4. **학생 재생**: 학생 진입 URL(`/v/{slug}` 또는 공유 링크) → 시크릿 창 → 슬라이드+구간음성 재생, 진행바·자막 동작. 렌더 전이면 "준비 중".
5. **(선택) mp4 내려받기**: 다운로드 버튼 → `mp4_status` building→ready → 재생 가능한 mp4.

### 막힘 신호 진단 2줄
- Railway celery-worker 로그 마지막 50줄
- 브라우저 DevTools Console + Network 의 빨간 줄

### 흔한 실패
- `boto3 … S3UploadFailedError` → S3 키/버킷 권한
- `anthropic.APIError` → Claude 키 만료·한도 (step3)
- 학생 화면 영상 썸네일 공백 → Vercel `NEXT_PUBLIC_*` 이미지 호스트 3종 누락(docs/RAILWAY_DEPLOY.md §3)

---

## 6. 다른 창에 넘기는 메모
- **창 2(Q&A)**: 본 창은 `pipeline/qa.py·retriever.py·embedding.py·qa_avatar.py` 와 budget.py 의 `assert_qa_render_budget`/`QAAnswerCache` 경로를 **건드리지 않았다**(read-only). Q&A 렌더 한도(월 6)·캐시는 창 2 검증 범위.
- **창 4(문서)**: DEPLOYMENT_PROGRESS 의 "metrics 死코드" 메모는 폐기 대상(이미 #165로 와이어링됨). 본 보고서 §2 참조.
