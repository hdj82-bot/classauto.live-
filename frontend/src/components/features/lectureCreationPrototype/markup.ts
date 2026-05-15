/**
 * Static markup string for the Lecture Creation prototype body.
 *
 * Ported verbatim from docs/prototypes/05-lecture-creation.extracted.html
 * (the <body> .app block + galleries + dev-panel + overlays). It is injected
 * once via dangerouslySetInnerHTML and then driven imperatively by the
 * ported vanilla-JS logic in LectureCreationPrototype.tsx, exactly as the
 * original standalone prototype did (the original is innerHTML-driven too).
 *
 * `body.X` state classes from the original are applied to the `.lc-root`
 * wrapper instead (see lectureCreation.css namespacing). React owns mount /
 * unmount and the wrapper class set; everything inside is the prototype's
 * own DOM + handlers wired in an effect.
 */
export const PROTOTYPE_HTML = String.raw`
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs>
    <linearGradient id="grad-electric" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FFB627"></stop><stop offset="100%" stop-color="#F59E0B"></stop>
    </linearGradient>
    <linearGradient id="grad-violet" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#A78BFA"></stop><stop offset="100%" stop-color="#6366F1"></stop>
    </linearGradient>
    <linearGradient id="grad-cyan" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#22D3EE"></stop><stop offset="100%" stop-color="#0EA5E9"></stop>
    </linearGradient>
    <linearGradient id="grad-pink" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#F472B6"></stop><stop offset="100%" stop-color="#EC4899"></stop>
    </linearGradient>
    <linearGradient id="grad-success" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#34D399"></stop><stop offset="100%" stop-color="#059669"></stop>
    </linearGradient>
    <linearGradient id="grad-coin" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FFC74D"></stop><stop offset="55%" stop-color="#FFB627"></stop><stop offset="100%" stop-color="#B88308"></stop>
    </linearGradient>
  </defs>
</svg>

<div class="app">

  <header class="topbar">
    <div class="topbar-left">
      <a class="brand" href="#" aria-label="ClassAuto" onclick="return false"><span class="brand-dot"></span>ClassAuto</a>
      <a class="crumb-back" href="#" aria-label="대시보드로 돌아가기" onclick="return false">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"></path><path d="M12 19l-7-7 7-7"></path></svg>
        대시보드
      </a>
    </div>
    <div class="topbar-center">
      <input class="title-input placeholder-mode" type="text" value="" placeholder="제목 없음 (편집 가능)" aria-label="강의 제목">
      <span class="saved"><span class="saved-dot"></span>임시 저장됨 · 방금 전</span>
    </div>
    <div class="topbar-right">
      <button class="avatar-pill" type="button">
        <span class="av">하</span>
        <span class="name">하두진</span>
      </button>
    </div>
  </header>

  <div class="stage">

    <section class="screen active" data-screen="1" data-screen-label="01 업로드 모달">
      <div class="ws-bg">
        <div class="modal-backdrop">
          <div class="upload-modal" role="dialog" aria-labelledby="upload-title">
            <div class="upload-head">
              <h2 id="upload-title">새 강의 영상 만들기</h2>
              <p class="sub">PPT만 올리시면 ClassAuto가 자동으로 분석해 스크립트 초안을 만들어드려요.</p>
            </div>

            <div class="upload-body">
              <div class="dropzone" id="dropzone" tabindex="0" role="button" aria-label="파일 업로드 영역">
                <div class="icon-wrap" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M12 16V4M12 4l-4 4M12 4l4 4" stroke="url(#grad-electric)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path>
                    <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="url(#grad-electric)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path>
                  </svg>
                </div>
                <div class="primary">PPT 파일을 끌어다 놓으세요</div>
                <div class="secondary">또는 <span class="pick" data-act="start-upload">파일 선택</span></div>
                <div class="formats">
                  <span class="chip">.pptx</span>
                  <span class="chip">.pdf</span>
                  <span class="chip">최대 50MB</span>
                </div>
              </div>

              <div class="upload-progress" id="upload-progress">
                <div class="file-pill">
                  <div class="file-icon">PPT</div>
                  <div class="file-info">
                    <div class="file-name">中国语文法의이해_3주차_把자문입문.pptx</div>
                    <div class="file-meta"><span id="up-size">0.0</span> / 12.4 MB · 8 슬라이드</div>
                  </div>
                  <div class="file-pct" id="up-pct">0%</div>
                </div>
                <div class="pbar"><div class="pbar-fill" id="pbar"></div></div>

                <div class="steps" style="margin-top:18px">
                  <div class="step" id="step-1">
                    <span class="ind"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg></span>
                    <span class="label">슬라이드 추출</span>
                    <span class="detail" id="step-1-detail">8장</span>
                  </div>
                  <div class="step" id="step-2">
                    <span class="ind"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg></span>
                    <span class="label">발표자 노트 추출</span>
                    <span class="detail" id="step-2-detail">7/8 슬라이드</span>
                  </div>
                  <div class="step" id="step-3">
                    <span class="ind"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg></span>
                    <span class="label">AI 스크립트 생성</span>
                    <span class="detail" id="step-3-detail">예상 12초</span>
                  </div>
                  <div class="step" id="step-4">
                    <span class="ind"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg></span>
                    <span class="label">강의 분석 완료</span>
                    <span class="detail" id="step-4-detail">난이도 · 분량 · 핵심 개념</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="upload-foot">
              <button class="btn ghost" type="button" data-act="reset-upload">취소</button>
              <button class="btn primary" id="wizard-start-btn" disabled data-act="goto-2">
                마법사 시작하기
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="screen" data-screen="2" data-screen-label="02 강의 컨셉 인터뷰">
      <div class="iv-page">
        <div class="iv-top">
          <button class="iv-back" type="button" data-act="goto-1-fromupload" aria-label="업로드로 돌아가기">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"></path><path d="M12 19l-7-7 7-7"></path></svg>
            업로드로 돌아가기
          </button>
          <div class="iv-progress" id="iv-progress">
            <span class="ip-label">인터뷰 진행 중</span>
            <span class="ip-dots">
              <span class="ip-dot" data-d="topic" title="주제"></span>
              <span class="ip-dot" data-d="audience" title="대상"></span>
              <span class="ip-dot" data-d="tone" title="톤"></span>
              <span class="ip-dot" data-d="avatar" title="아바타"></span>
              <span class="ip-dot" data-d="voice" title="음성"></span>
            </span>
          </div>
        </div>

        <div class="iv-welcome">
          <h1>강의 컨셉을 함께 정해볼까요?</h1>
          <p class="iw-sub">PPT를 받았어요. 어떤 영상을 만들고 싶은지 알려주세요. 이미 정해진 부분이 있다면 한 번에 다 말씀해주셔도 좋아요.</p>
        </div>

        <div class="chat-thread" id="chat-thread" aria-live="polite"></div>

        <div class="iv-composer" id="iv-composer">
          <textarea id="iv-composer-input" placeholder="자유롭게 입력해주세요 — 한 번에 다 말씀하셔도 좋아요" rows="1"></textarea>
          <div class="iv-composer-bar">
            <div class="left">
              <button class="composer-pill" type="button" aria-label="음성 입력">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"></rect><path d="M5 11a7 7 0 0 0 14 0"></path><path d="M12 18v3"></path></svg>
                음성
              </button>
              <button class="composer-pill accent" type="button" data-act="iv-quick">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h8l-1 8 10-12h-8l1-8z"></path></svg>
                빠르게 만들기
              </button>
            </div>
            <button class="send-btn" id="iv-send-btn" disabled type="button">
              보내기
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"></path><path d="M22 2l-7 20-4-9-9-4 20-7z"></path></svg>
            </button>
          </div>
        </div>
      </div>
    </section>

    <section class="screen" data-screen="3" data-screen-label="03 마법사 메인">
      <div class="wizard">

        <aside class="slide-panel" aria-label="슬라이드 목록">
          <div class="slide-panel-head">
            <h3>슬라이드</h3>
            <span class="count">8장</span>
          </div>
          <div class="slide-list" id="slide-list"></div>
          <button class="slide-add" type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"></path></svg>
            슬라이드 추가
          </button>
        </aside>

        <main class="work">
          <div class="work-scroll">

            <div class="preview-card">
              <div class="preview-head">
                <div class="meta">
                  <button class="slide-toggle" type="button" data-act="toggle-slides" aria-label="슬라이드 목록">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                    슬라이드
                  </button>
                  <span class="crumb">슬라이드 <span id="cur-slide-num">3</span> / 8</span>
                  <span class="title" id="cur-slide-title">어순 비교 — SVO vs 把자문</span>
                </div>
                <div class="right">
                  <button class="listen-btn" type="button">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.55.83l11-7.5a1 1 0 0 0 0-1.66l-11-7.5A1 1 0 0 0 7 4.5z"></path></svg>
                    미리듣기
                  </button>
                </div>
              </div>
              <div class="preview-body">
                <div class="slide-mock" id="slide-mock"></div>
              </div>
            </div>

            <div class="script-card">
              <div class="script-head">
                <h3>스크립트 검토</h3>
                <span class="meta">예상 1분 24초 · 312자</span>
              </div>
              <div class="script-body">

                <div class="script-block original">
                  <div class="b-head">
                    원본 PPT 노트
                    <span class="src">발표자 노트에서 추출</span>
                  </div>
                  <div class="b-text" id="orig-text"></div>
                </div>

                <div class="script-block ai">
                  <div class="b-head">
                    AI 다듬은 스크립트
                    <span class="src">하두진 교수 톤 학습 모델</span>
                  </div>
                  <div class="b-text" id="ai-text"></div>
                </div>

                <div class="script-actions">
                  <button class="pill-btn accept" type="button" data-script-action="accept">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>
                    채택
                  </button>
                  <button class="pill-btn reject" type="button" data-script-action="reject">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    거부
                  </button>
                  <button class="pill-btn" type="button" data-script-action="edit">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    수동 편집
                  </button>
                  <span style="flex:1"></span>
                  <button class="pill-btn" type="button" data-script-action="regenerate" style="color: var(--text-muted)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15A9 9 0 1 0 6 5.3L1 10"></path></svg>
                    다시 생성
                  </button>
                </div>

              </div>
            </div>

          </div>

          <div class="action-bar">
            <div class="left">
              <button class="btn" type="button" data-act="nav-prev">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"></path><path d="M12 19l-7-7 7-7"></path></svg>
                이전 슬라이드
              </button>
            </div>
            <div class="center">슬라이드 <b id="bar-cur">3</b> / 8 · <b id="bar-adopted">2</b>개 채택</div>
            <div class="right">
              <button class="btn" type="button" data-act="nav-next">
                다음
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path></svg>
              </button>
              <button class="btn primary" type="button" data-act="open-gen">
                전체 생성 시작
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              </button>
            </div>
          </div>
        </main>

        <aside class="settings" aria-label="강의 설정">
          <div class="settings-scroll">

            <details class="accordion" open>
              <summary>
                <svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                <span class="h4-icon">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="url(#grad-violet)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                </span>
                <h4>아바타</h4>
                <span class="summary-val">김교수</span>
              </summary>
              <div class="a-body">
                <button class="picker-card" type="button" id="avatar-picker-card" data-act="open-avatar-gallery" aria-label="아바타 선택 갤러리 열기">
                  <div class="picker-card-preview" id="avatar-card-preview"></div>
                  <div class="picker-card-meta">
                    <div class="picker-card-name" id="avatar-card-name">김교수 페르소나</div>
                    <div class="picker-card-sub" id="avatar-card-sub">비즈니스 캐주얼 · 한국어 발화 최적</div>
                  </div>
                  <div class="picker-card-cta">
                    아바타 변경하기
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path></svg>
                  </div>
                </button>
              </div>
            </details>

            <details class="accordion" open>
              <summary>
                <svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                <span class="h4-icon">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="url(#grad-electric)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"></path><path d="M21 19a2 2 0 0 1-2 2h-1v-7h3z"></path><path d="M3 19a2 2 0 0 0 2 2h1v-7H3z"></path></svg>
                </span>
                <h4>음성 (이중 TTS)</h4>
                <span class="summary-val">한 · 中</span>
              </summary>
              <div class="a-body">
                <button class="picker-card voice" type="button" id="voice-picker-card" data-act="open-voice-gallery" aria-label="음성 선택 갤러리 열기">
                  <div class="voice-card-row" id="voice-card-primary">
                    <div class="voice-card-tag">주 음성<span class="voice-card-pct"><span id="voice-pct-primary">70</span>%</span></div>
                    <div class="voice-card-line">
                      <span class="voice-card-glyph" id="voice-glyph-primary">♀</span>
                      <div class="voice-card-meta">
                        <div class="voice-card-name" id="voice-name-primary">Yuna</div>
                        <div class="voice-card-sub" id="voice-sub-primary">자연스러운 여성 음성 · 한국어</div>
                      </div>
                      <span class="voice-card-play" data-voice-play="primary" data-act="play-primary" role="button" aria-label="주 음성 미리듣기">
                        <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
                      </span>
                    </div>
                  </div>
                  <div class="voice-card-row" id="voice-card-secondary">
                    <div class="voice-card-tag">부 음성<span class="voice-card-pct"><span id="voice-pct-secondary">30</span>%</span></div>
                    <div class="voice-card-line">
                      <span class="voice-card-glyph" id="voice-glyph-secondary">♂</span>
                      <div class="voice-card-meta">
                        <div class="voice-card-name" id="voice-name-secondary">Xiaoming</div>
                        <div class="voice-card-sub" id="voice-sub-secondary">표준 보통화 남성 · 中文</div>
                      </div>
                      <span class="voice-card-play" data-voice-play="secondary" data-act="play-secondary" role="button" aria-label="부 음성 미리듣기">
                        <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>
                      </span>
                    </div>
                  </div>
                  <div class="picker-card-cta">
                    음성 변경하기
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path></svg>
                  </div>
                </button>
              </div>
            </details>

            <details class="accordion">
              <summary>
                <svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                <span class="h4-icon">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="url(#grad-cyan)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"></path></svg>
                </span>
                <h4>강의 설정</h4>
                <span class="summary-val">30일 · 중</span>
              </summary>
              <div class="a-body">
                <div class="toggle-row">
                  <span class="l">링크 만료</span>
                  <div class="seg">
                    <button class="seg-opt" type="button" data-act="seg">7일</button>
                    <button class="seg-opt on" type="button" data-act="seg">30일</button>
                    <button class="seg-opt" type="button" data-act="seg">학기말</button>
                  </div>
                </div>
                <div class="toggle-row">
                  <span class="l">집중 경고</span>
                  <button class="switch on" type="button" aria-label="집중 경고" aria-pressed="true" data-act="switch"></button>
                </div>
                <div class="toggle-row">
                  <span class="l">퀴즈 난이도</span>
                  <div class="radio-row">
                    <label data-act="radio"><input type="radio" name="qd">하</label>
                    <label class="on" data-act="radio"><input type="radio" name="qd" checked>중</label>
                    <label data-act="radio"><input type="radio" name="qd">상</label>
                  </div>
                </div>
              </div>
            </details>

            <details class="accordion">
              <summary>
                <svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                <span class="h4-icon">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="url(#grad-pink)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                </span>
                <h4>Q&amp;A 범위</h4>
                <span class="summary-val">업로드 자료만</span>
              </summary>
              <div class="a-body">
                <div class="toggle-row">
                  <span class="l">업로드 자료만</span>
                  <button class="switch on" type="button" data-act="switch"></button>
                </div>
                <div class="toggle-row">
                  <span class="l">외부 검색 차단</span>
                  <button class="switch on" type="button" data-act="switch"></button>
                </div>
                <div style="font-size:11.5px; color: var(--text-subtle); line-height:1.5; padding-top:4px;">
                  학생 질문은 이 강의의 PPT·노트·스크립트 범위 안에서만 답변됩니다.
                </div>
              </div>
            </details>

          </div>
        </aside>

      </div>
    </section>

  </div>

  <button class="mobile-fab" type="button" data-act="toggle-settings">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"></path></svg>
    설정
  </button>
  <div class="drawer-backdrop" data-act="close-drawers"></div>

  <div class="gen-overlay" role="dialog" aria-modal="true" aria-labelledby="gen-h1">
    <div class="gen-modal">
      <div class="gen-dev" aria-label="개발용 시뮬레이션 컨트롤">
        <button type="button" data-act="dev-gen-add">DEV: +10%</button>
        <button type="button" data-act="dev-gen-complete">DEV: 즉시 완료</button>
        <button type="button" data-act="dev-gen-bg">DEV: 백그라운드</button>
      </div>

      <div class="gen-confetti" aria-hidden="true"></div>

      <div class="gen-scroll">
        <div class="gen-head">
          <h2 class="gen-h1" id="gen-h1">강의 영상 만드는 중…</h2>
          <div class="gen-sub">把자문(把字句) 입문 · 슬라이드 8장</div>
        </div>

        <div class="gen-progress-wrap">
          <svg class="gen-success-icon" viewBox="0 0 80 80" aria-hidden="true">
            <defs>
              <linearGradient id="success-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#10B981"></stop>
                <stop offset="1" stop-color="#059669"></stop>
              </linearGradient>
            </defs>
            <circle cx="40" cy="40" r="36" fill="url(#success-grad)"></circle>
            <path d="M24 41 L36 53 L57 30" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>

          <div class="gen-ring" id="gen-ring">
            <svg viewBox="0 0 160 160" aria-hidden="true">
              <defs>
                <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stop-color="#FFB627"></stop>
                  <stop offset="1" stop-color="#E89E0E"></stop>
                </linearGradient>
                <linearGradient id="ring-success" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stop-color="#10B981"></stop>
                  <stop offset="1" stop-color="#059669"></stop>
                </linearGradient>
              </defs>
              <circle class="ring-track" cx="80" cy="80" r="70"></circle>
              <circle class="ring-fill" id="ring-fill" cx="80" cy="80" r="70"></circle>
            </svg>
            <div class="ring-num">
              <div class="ring-pct"><span id="gen-pct">47</span>%</div>
              <div class="ring-lbl">진행률</div>
            </div>
          </div>

          <div class="gen-eta">예상 남은 시간 <b id="gen-eta">2분 18초</b></div>
        </div>

        <div class="gen-stages" id="gen-stages">
          <div class="gen-stage" data-state="done" data-stage="1">
            <span class="step-num"><span>1</span></span>
            <div class="stage-body">
              <div class="stage-title">스크립트 검토 완료</div>
              <div class="stage-detail">8 / 8 슬라이드 채택됨</div>
            </div>
            <div class="stage-time">0초</div>
          </div>
          <div class="gen-stage" data-state="active" data-stage="2">
            <span class="step-num"><span>2</span></span>
            <div class="stage-body">
              <div class="stage-title">TTS 음성 생성 중…</div>
              <div class="stage-detail"><span id="tts-cur">12</span> / 24 슬라이드 (<span id="tts-pct">50</span>%)</div>
              <div class="stage-progressbar"><span id="tts-bar" style="width:50%"></span></div>
              <div class="stage-live">현재: 슬라이드 5 — '把자문 예시' 음성 생성</div>
            </div>
            <div class="stage-time" id="tts-eta">2분 18초</div>
          </div>
          <div class="gen-stage" data-state="pending" data-stage="3">
            <span class="step-num"><span>3</span></span>
            <div class="stage-body">
              <div class="stage-title">AI 아바타 영상 합성</div>
              <div class="stage-detail">대기 중 — 예상 시작: 2분 후</div>
            </div>
            <div class="stage-time">—</div>
          </div>
          <div class="gen-stage" data-state="pending" data-stage="4">
            <span class="step-num"><span>4</span></span>
            <div class="stage-body">
              <div class="stage-title">최종 인코딩</div>
              <div class="stage-detail">대기 중 — 예상 시작: 6분 후</div>
            </div>
            <div class="stage-time">—</div>
          </div>
        </div>

        <div class="gen-final-stats">
          <div class="stat"><div class="lbl">총 소요</div><div class="val">7분 32초</div></div>
          <div class="stat"><div class="lbl">최종 비용</div><div class="val">$7.18</div></div>
          <div class="stat"><div class="lbl">영상 길이</div><div class="val">5분 12초</div></div>
        </div>

        <div class="gen-bgopt">
          <div class="bg-head"><div class="bg-title">백그라운드 실행</div></div>
          <div class="bg-desc">다른 작업하시면서 기다리실 수 있어요.</div>
          <div class="gen-notif">
            <label><input type="checkbox" checked>완료 시 이메일 알림</label>
            <label><input type="checkbox">완료 시 카카오톡 알림</label>
          </div>
          <button class="gen-bg-btn" type="button" data-act="minimize-gen">
            백그라운드로 실행
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path></svg>
          </button>
        </div>

        <div class="gen-cost">
          <div class="gen-cost-head">
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none"><defs><linearGradient id="chart-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8B5CF6"></stop><stop offset="1" stop-color="#6D28D9"></stop></linearGradient></defs><rect x="4" y="4" width="16" height="16" rx="3" fill="url(#chart-grad)"></rect><path d="M8 15 L11 11 L14 13 L17 8" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"></path></svg>
            <span class="lbl">진행 상황</span>
          </div>
          <div class="gen-cost-row">
            <span>슬라이드</span>
            <span><span class="v" id="prog-slides">5</span> / 8 (<span id="prog-slides-pct">62</span>%)</span>
          </div>
          <div class="gen-cost-row">
            <span>예상 영상 길이</span>
            <span class="v">5분 12초</span>
          </div>
          <div class="gen-cost-row month">
            <span>사용 가능</span>
            <span>Pro 플랜 · 월 <span class="v">18 / 20편</span></span>
          </div>
        </div>
      </div>

      <div class="gen-foot">
        <div class="gen-help">
          문제가 생기면? <a data-act="open-support">지원 채널</a>
        </div>
        <div class="gen-actions" id="gen-actions-running">
          <span class="saved"><span class="saved-dot"></span>자동 저장 중</span>
        </div>
        <div class="gen-actions" id="gen-actions-done" style="display:none">
          <button class="btn" type="button" data-act="gen-share-panel">공유 패널 열기</button>
          <button class="btn primary" type="button" data-act="gen-confirm">영상 확인하기 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path></svg></button>
        </div>
      </div>
    </div>
  </div>

  <div class="gen-widget" data-act="expand-gen" role="button" tabindex="0" aria-label="생성 진행 모달 펼치기">
    <span class="w-pulse"></span>
    <div class="w-body">
      <div class="w-title">영상 생성 중</div>
      <div class="w-pct"><span id="gen-widget-pct">47</span>%</div>
    </div>
    <span class="w-expand"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg></span>
  </div>

  <div class="gen-support" data-act="close-support">
    <div class="gen-support-card" data-stop="1">
      <h3>안전한 생성 보장</h3>
      <p>생성 중 문제가 발생하면 자동으로 진행이 멈추고 알림을 보내드립니다. 영상은 안전하게 보존되며, 비용은 완료된 단계까지만 청구됩니다.</p>
      <button class="btn primary" type="button" data-act="close-support">확인</button>
    </div>
  </div>

  <section class="screen" data-screen="5" data-screen-label="04 완성·공유">
    <div class="done-page">

      <header class="done-header">
        <svg class="done-success" viewBox="0 0 80 80" aria-hidden="true">
          <defs>
            <linearGradient id="done-success-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#10B981"></stop>
              <stop offset="1" stop-color="#059669"></stop>
            </linearGradient>
          </defs>
          <circle cx="40" cy="40" r="36" fill="url(#done-success-grad)"></circle>
          <path d="M24 41 L36 53 L57 30" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
        <h1 class="done-h1">강의 영상이 완성되었어요!</h1>
        <p class="done-sub"><span class="han">把</span>자문(<span class="han">把</span>字句) 입문 · 2026년 5월 12일 생성</p>
      </header>

      <div class="done-stats">
        <div class="done-stat">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none"><defs><linearGradient id="stat-grad-1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8B5CF6"></stop><stop offset="1" stop-color="#6D28D9"></stop></linearGradient></defs><circle cx="12" cy="12" r="9" fill="url(#stat-grad-1)"></circle><polyline points="12 7 12 12 15 14" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"></polyline></svg>
          <div class="l">소요 시간</div>
          <div class="v" id="stat-elapsed">7분 32초</div>
        </div>
        <div class="done-stat">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none"><defs><linearGradient id="stat-grad-2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFB627"></stop><stop offset="1" stop-color="#E89E0E"></stop></linearGradient></defs><rect x="3" y="6" width="15" height="12" rx="2" fill="url(#stat-grad-2)"></rect><polygon points="18 10 22 7 22 17 18 14" fill="url(#stat-grad-2)"></polygon></svg>
          <div class="l">영상 길이</div>
          <div class="v" id="stat-duration">5분 12초</div>
        </div>
        <div class="done-stat">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none"><defs><linearGradient id="stat-grad-3" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#06B6D4"></stop><stop offset="1" stop-color="#0891B2"></stop></linearGradient></defs><rect x="3" y="4" width="18" height="13" rx="2" fill="url(#stat-grad-3)"></rect><rect x="5" y="6" width="14" height="9" rx="1" fill="#FFFFFF" opacity="0.85"></rect><line x1="9" y1="20" x2="15" y2="20" stroke="url(#stat-grad-3)" stroke-width="2" stroke-linecap="round"></line></svg>
          <div class="l">슬라이드</div>
          <div class="v" id="stat-slides">8장</div>
        </div>
      </div>

      <button type="button" class="video-card" aria-label="영상 재생">
        <span class="play-btn-wrap" aria-hidden="true"></span>
      </button>
      <div class="video-card-overlays">
        <div class="vc-title-overlay">
          <h3><span class="han">把</span>자문(<span class="han">把</span>字句) 입문</h3>
          <p>경기대학교 · 중국어문법의 이해 · 3주차</p>
        </div>
        <div class="vc-info">5:12 · HD</div>
        <div class="vc-progress"><span></span></div>
      </div>

      <div class="video-meta">
        <div class="meta-left">
          <div class="meta-row"><span>강의:</span> <b>경기대학교 · 중국어문법의 이해 · 3주차</b></div>
          <div class="meta-row"><span>생성일:</span> <b>2026년 5월 12일</b></div>
          <button class="url-row" type="button" data-act="copy-url">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
            <code id="share-url">classauto.live/v/abc123XYZ</code>
          </button>
        </div>
        <div class="learn-code">
          <div class="l">학습 코드</div>
          <div class="v">ABCD-1234</div>
        </div>
      </div>

      <section class="share-panel">
        <h2>학생들에게 공유하세요</h2>
        <p class="sp-sub">한 번의 공유로 등록된 학생들이 영상을 시청할 수 있어요</p>
        <div class="share-grid">
          <button type="button" class="share-card" data-act="composer-email">
            <svg viewBox="0 0 32 32" aria-hidden="true" fill="none"><defs><linearGradient id="ch-email" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3B82F6"></stop><stop offset="1" stop-color="#1D4ED8"></stop></linearGradient></defs><rect x="4" y="7" width="24" height="18" rx="3" fill="url(#ch-email)"></rect><path d="M5 9 L16 18 L27 9" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"></path></svg>
            <span class="lbl">이메일</span>
          </button>
          <button type="button" class="share-card" data-act="composer-kakao">
            <svg viewBox="0 0 32 32" aria-hidden="true" fill="none"><defs><linearGradient id="ch-kakao" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FEE500"></stop><stop offset="1" stop-color="#F4D200"></stop></linearGradient></defs><ellipse cx="16" cy="14" rx="12" ry="9" fill="url(#ch-kakao)"></ellipse><polygon points="11 21 13 26 17 22" fill="url(#ch-kakao)"></polygon><circle cx="12" cy="14" r="1.5" fill="#3C1E1E"></circle><circle cx="16" cy="14" r="1.5" fill="#3C1E1E"></circle><circle cx="20" cy="14" r="1.5" fill="#3C1E1E"></circle></svg>
            <span class="lbl">카톡</span>
          </button>
          <button type="button" class="share-card" data-act="composer-x">
            <svg viewBox="0 0 32 32" aria-hidden="true" fill="none"><rect width="32" height="32" rx="7" fill="#0A0A0A"></rect><path d="M9 9 L23 23 M9 23 L23 9" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round"></path></svg>
            <span class="lbl">X</span>
          </button>
          <button type="button" class="share-card" data-act="copy-url">
            <svg viewBox="0 0 32 32" aria-hidden="true" fill="none"><defs><linearGradient id="ch-url" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#10B981"></stop><stop offset="1" stop-color="#059669"></stop></linearGradient></defs><rect width="32" height="32" rx="7" fill="url(#ch-url)"></rect><path d="M13 19 a4 4 0 0 0 5.66 0 l3-3 a4 4 0 0 0 -5.66 -5.66 l-2 2" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"></path><path d="M19 13 a4 4 0 0 0 -5.66 0 l-3 3 a4 4 0 0 0 5.66 5.66 l2 -2" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"></path></svg>
            <span class="lbl">URL 복사</span>
          </button>
          <button type="button" class="share-card" data-act="composer-sms">
            <svg viewBox="0 0 32 32" aria-hidden="true" fill="none"><defs><linearGradient id="ch-sms" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#06B6D4"></stop><stop offset="1" stop-color="#0891B2"></stop></linearGradient></defs><rect x="9" y="4" width="14" height="24" rx="3" fill="url(#ch-sms)"></rect><rect x="11" y="7" width="10" height="15" rx="1" fill="#FFFFFF"></rect><circle cx="16" cy="25" r="1" fill="#FFFFFF"></circle></svg>
            <span class="lbl">문자</span>
          </button>
          <button type="button" class="share-card qr" data-act="open-qr">
            <span class="badge">추천</span>
            <svg viewBox="0 0 32 32" aria-hidden="true" fill="none"><rect width="32" height="32" rx="7" fill="#FFFFFF" stroke="#0A0A0A" stroke-width="1.5"></rect><rect x="5" y="5" width="7" height="7" fill="#0A0A0A"></rect><rect x="7" y="7" width="3" height="3" fill="#FFFFFF"></rect><rect x="20" y="5" width="7" height="7" fill="#0A0A0A"></rect><rect x="22" y="7" width="3" height="3" fill="#FFFFFF"></rect><rect x="5" y="20" width="7" height="7" fill="#0A0A0A"></rect><rect x="7" y="22" width="3" height="3" fill="#FFFFFF"></rect><rect x="14" y="5" width="2" height="2" fill="#0A0A0A"></rect><rect x="14" y="9" width="2" height="2" fill="#0A0A0A"></rect><rect x="18" y="14" width="2" height="2" fill="#0A0A0A"></rect><rect x="22" y="18" width="2" height="2" fill="#0A0A0A"></rect><rect x="14" y="22" width="2" height="2" fill="#0A0A0A"></rect><rect x="18" y="20" width="2" height="2" fill="#0A0A0A"></rect><rect x="14" y="18" width="2" height="2" fill="#0A0A0A"></rect><rect x="22" y="22" width="2" height="2" fill="#0A0A0A"></rect><rect x="18" y="26" width="2" height="2" fill="#0A0A0A"></rect><rect x="26" y="14" width="2" height="2" fill="#0A0A0A"></rect></svg>
            <span class="lbl">QR 코드</span>
          </button>
        </div>
      </section>

      <details class="share-settings">
        <summary>공유 설정</summary>
        <div class="ss-body">
          <div class="ss-row">
            <input type="checkbox" id="ss-pw">
            <label for="ss-pw"><b>비밀번호 보호</b><div class="desc">시청 시 비밀번호 입력 요구</div></label>
          </div>
          <div class="ss-row">
            <input type="checkbox" id="ss-ackr" checked>
            <label for="ss-ackr"><b>학교 이메일만 시청 가능</b><div class="desc">.ac.kr 도메인 학생만 접속 허용 (기본 활성)</div></label>
          </div>
          <div class="ss-row">
            <input type="checkbox" id="ss-expire">
            <label for="ss-expire"><b>시청 기간 제한</b><div class="desc">종료 날짜 이후 영상 비공개</div></label>
          </div>
          <div class="ss-row">
            <input type="checkbox" id="ss-dl">
            <label for="ss-dl"><b>다운로드 허용</b><div class="desc">학생이 mp4 파일로 저장 가능</div></label>
          </div>
          <div class="ss-row" style="border-top: 1px solid var(--line); padding-top: 14px; flex-direction: column; gap: 8px;">
            <div class="clab" style="font-size: 11px; font-weight: 600; color: var(--text-muted); letter-spacing: 0.04em; text-transform: uppercase;">시청 권한</div>
            <div class="ss-radios">
              <div class="ss-row"><input type="radio" name="view-perm" id="vp-reg"><label for="vp-reg">등록된 학생만</label></div>
              <div class="ss-row"><input type="radio" name="view-perm" id="vp-ac" checked><label for="vp-ac">학교 도메인 인증된 모든 학생</label></div>
              <div class="ss-row"><input type="radio" name="view-perm" id="vp-pub"><label for="vp-pub">누구나 (공개)</label></div>
            </div>
          </div>
        </div>
      </details>

      <div class="next-actions">
        <button type="button" class="next-card" data-act="goto-1-fromupload">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none"><defs><linearGradient id="next-1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFB627"></stop><stop offset="1" stop-color="#E89E0E"></stop></linearGradient></defs><rect x="3" y="6" width="15" height="12" rx="2" fill="url(#next-1)"></rect><polygon points="18 10 22 7 22 17 18 14" fill="url(#next-1)"></polygon><circle cx="20" cy="5" r="4" fill="#FFFFFF"></circle><path d="M20 3 L20 7 M18 5 L22 5" stroke="#E89E0E" stroke-width="1.6" stroke-linecap="round"></path></svg>
          <div class="nc-title">새 강의 만들기</div>
          <div class="nc-desc">슬라이드를 업로드하고 새로운 영상을 만들어보세요</div>
        </button>
        <button type="button" class="next-card" data-act="toast-analytics">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none"><defs><linearGradient id="next-2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8B5CF6"></stop><stop offset="1" stop-color="#6D28D9"></stop></linearGradient></defs><rect x="3" y="3" width="18" height="18" rx="3" fill="url(#next-2)"></rect><rect x="6" y="13" width="2.5" height="5" fill="#FFFFFF" rx="0.5"></rect><rect x="10.5" y="9" width="2.5" height="9" fill="#FFFFFF" rx="0.5"></rect><rect x="15" y="6" width="2.5" height="12" fill="#FFFFFF" rx="0.5"></rect></svg>
          <div class="nc-title">학습 분석 보러 가기</div>
          <div class="nc-desc">학생들의 시청·이해도 데이터를 확인하세요</div>
        </button>
        <button type="button" class="next-card" data-act="goto-2">
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none"><defs><linearGradient id="next-3" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#10B981"></stop><stop offset="1" stop-color="#059669"></stop></linearGradient></defs><circle cx="12" cy="12" r="9" fill="url(#next-3)"></circle><path d="M9 12 a3 3 0 1 1 5.2 2.1" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" fill="none"></path><polyline points="14 11 14 14 11 14" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"></polyline></svg>
          <div class="nc-title">이 강의 편집하기</div>
          <div class="nc-desc">스크립트 수정 후 재생성할 수 있어요</div>
        </button>
      </div>

    </div>
  </section>

  <div class="qr-overlay" data-act="close-qr">
    <div class="qr-card" data-stop="1" role="dialog" aria-modal="true" aria-labelledby="qr-h">
      <button class="close-x" type="button" data-act="close-qr" aria-label="닫기">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"></line><line x1="6" y1="18" x2="18" y2="6"></line></svg>
      </button>
      <h3 id="qr-h">강의실에 QR 코드를 띄우세요</h3>
      <p class="qr-sub">PPT 마지막 페이지에 띄워두면<br>학생들이 스캔으로 즉시 접속할 수 있어요</p>
      <div class="qr-toggle">
        <button type="button" class="active" data-qr-theme="light" data-act="qr-light">라이트</button>
        <button type="button" data-qr-theme="dark" data-act="qr-dark">다크</button>
      </div>
      <div class="qr-box" id="qr-box">
        <img id="qr-img" alt="강의 영상 QR 코드 — https://classauto.live/v/abc123XYZ" width="320" height="320" loading="lazy" decoding="async">
        <div class="qr-logo" aria-hidden="true">CA</div>
      </div>
      <div class="qr-info">
        https://classauto.live/v/abc123XYZ<br>
        <b>학습 코드: ABCD-1234</b>
      </div>
      <div class="qr-downloads">
        <button class="qr-dl-btn" type="button" data-act="toast-qrpng">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          PNG 다운로드
          <span class="dl-meta">1024×1024 · 56KB</span>
        </button>
        <button class="qr-dl-btn" type="button" data-act="toast-qrppt">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
          PPT 슬라이드 템플릿 (.pptx)
          <span class="dl-meta">16:9 · QR 박힘</span>
        </button>
        <button class="qr-dl-btn" type="button" data-act="toast-qrpdf">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="1"></rect><line x1="9" y1="8" x2="15" y2="8"></line><line x1="9" y1="12" x2="15" y2="12"></line></svg>
          인쇄용 A4 PDF
          <span class="dl-meta">포스터·게시판용</span>
        </button>
      </div>
      <div class="qr-scenarios">
        <div class="qr-scenario">
          <svg viewBox="0 0 24 24" fill="none"><defs><linearGradient id="sc-1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFB627"></stop><stop offset="1" stop-color="#E89E0E"></stop></linearGradient></defs><rect x="3" y="5" width="18" height="13" rx="2" fill="url(#sc-1)"></rect><rect x="5" y="7" width="14" height="9" rx="1" fill="#FFFFFF"></rect><rect x="10.5" y="20" width="3" height="2" fill="url(#sc-1)"></rect></svg>
          <div class="t">강의실 슬라이드</div>
          <div class="d">마지막 페이지에 QR 띄우기</div>
        </div>
        <div class="qr-scenario">
          <svg viewBox="0 0 24 24" fill="none"><defs><linearGradient id="sc-2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#06B6D4"></stop><stop offset="1" stop-color="#0891B2"></stop></linearGradient></defs><rect x="5" y="3" width="14" height="18" rx="2" fill="url(#sc-2)"></rect><line x1="8" y1="8" x2="16" y2="8" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round"></line><line x1="8" y1="12" x2="16" y2="12" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round"></line><line x1="8" y1="16" x2="13" y2="16" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round"></line></svg>
          <div class="t">시험·과제 안내</div>
          <div class="d">인쇄물에 삽입</div>
        </div>
        <div class="qr-scenario">
          <svg viewBox="0 0 24 24" fill="none"><defs><linearGradient id="sc-3" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8B5CF6"></stop><stop offset="1" stop-color="#6D28D9"></stop></linearGradient></defs><rect x="4" y="5" width="16" height="14" rx="1.5" fill="url(#sc-3)"></rect><circle cx="8" cy="9" r="1" fill="#FFFFFF"></circle><rect x="11" y="8" width="6" height="1.5" fill="#FFFFFF" rx="0.5"></rect><rect x="7" y="12" width="10" height="1.2" fill="#FFFFFF" rx="0.5"></rect><rect x="7" y="15" width="7" height="1.2" fill="#FFFFFF" rx="0.5"></rect></svg>
          <div class="t">게시판·복도</div>
          <div class="d">포스터 부착</div>
        </div>
      </div>
    </div>
  </div>

  <div class="composer-overlay" data-act="close-composer">
    <div class="composer-card" data-stop="1" role="dialog" aria-modal="true">
      <button class="close-x" type="button" data-act="close-composer" aria-label="닫기">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"></line><line x1="6" y1="18" x2="18" y2="6"></line></svg>
      </button>
      <div id="composer-body"></div>
    </div>
  </div>

  <div class="share-toast" id="share-toast" role="status" aria-live="polite">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
    <span id="toast-msg">URL이 복사되었어요</span>
  </div>

  <div id="gallery-mount-point"></div>

  <nav class="demo-nav" aria-label="Demo navigation">
    <div class="demo-nav-head">Demo</div>
    <button class="demo-nav-btn active" data-go="1" data-act="goto-1-fromupload"><span class="num">01</span>업로드 모달</button>
    <button class="demo-nav-btn" data-go="2" data-act="goto-2"><span class="num">02</span>컨셉 인터뷰</button>
    <button class="demo-nav-btn" data-go="3" data-act="goto-3"><span class="num">03</span>마법사 메인</button>
    <button class="demo-nav-btn" data-go="4" data-act="open-gen"><span class="num">04</span>생성 진행</button>
    <button class="demo-nav-btn" data-go="5" data-act="goto-done"><span class="num">05</span>완성·공유</button>
  </nav>

  <aside class="dev-panel" aria-label="시연용 DEV 컨트롤">
    <div class="dp-head">DEV 시나리오</div>
    <label><input type="radio" name="iv-sc" value="A"> A · 把자문 + 풍부 입력 (3턴)</label>
    <label><input type="radio" name="iv-sc" value="B" checked> B · 被자문 + 학술적 (3턴)</label>
    <label><input type="radio" name="iv-sc" value="C"> C · 빈약 입력 + 친절 (5턴)</label>
    <hr>
    <button type="button" data-act="iv-dev-advance">다음 대화 →</button>
    <button type="button" class="primary" data-act="iv-dev-complete">인터뷰 완료 →</button>
    <button type="button" data-act="iv-dev-reset">초기화</button>
    <div class="dp-meta" id="dp-step">현재 턴 0 / 3</div>
  </aside>

  <div class="iv-gen-overlay" id="iv-gen-overlay" role="dialog" aria-modal="true">
    <div class="iv-gen-card">
      <div class="ivg-orb">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z"></path><path d="M19 14l.7 1.8L21.5 16.5l-1.8.7L19 19l-.7-1.8L16.5 16.5l1.8-.7z"></path></svg>
      </div>
      <h2>교수님과 함께 잡은 컨셉으로<br>AI 스크립트를 생성하고 있어요</h2>
      <p class="ivg-sub">슬라이드 8장에 컨셉을 매핑하고 각 장의 발화 스크립트를 작성합니다. 약 8초가 소요돼요.</p>
      <div class="iv-gen-steps">
        <div class="iv-gen-step">
          <span class="ivs-ind"><svg viewBox="0 0 24 24" fill="none"><path d="M20 6 9 17l-5-5" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path></svg></span>
          <span class="ivg-label">컨셉 분석</span>
        </div>
        <div class="iv-gen-step">
          <span class="ivs-ind"><svg viewBox="0 0 24 24" fill="none"><path d="M20 6 9 17l-5-5" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path></svg></span>
          <span class="ivg-label">슬라이드 8장 매핑</span>
        </div>
        <div class="iv-gen-step">
          <span class="ivs-ind"><svg viewBox="0 0 24 24" fill="none"><path d="M20 6 9 17l-5-5" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path></svg></span>
          <span class="ivg-label">슬라이드 1/8 스크립트 작성 중…</span>
        </div>
      </div>
    </div>
  </div>

  <div class="quick-overlay" id="quick-overlay" role="dialog" aria-modal="true">
    <div class="quick-card">
      <h3>⚡ 빠르게 만들기</h3>
      <p>PPT 분석 결과로 자동 진행할게요. 마법사 화면에서 언제든 조정하실 수 있습니다.</p>
      <div class="q-list">
        <div class="q-row"><span class="k">주제</span><span class="v">把자문 입문 (PPT 자동 추정)</span></div>
        <div class="q-row"><span class="k">톤</span><span class="v">친근한 강의체 (기본값)</span></div>
        <div class="q-row"><span class="k">아바타</span><span class="v">이지혜 강사 (추천)</span></div>
        <div class="q-row"><span class="k">음성</span><span class="v">한국어 70% + 中文 30%</span></div>
      </div>
      <div class="q-actions">
        <button type="button" data-act="iv-quick-close">취소</button>
        <button type="button" class="primary" data-act="iv-quick-proceed">그대로 진행</button>
      </div>
    </div>
  </div>
</div>
`;
