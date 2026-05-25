"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { tabularStyle, hanStyle, displayStyle } from "@/components/professor/shell";

/**
 * Studio v2 — 중앙 work area.
 *
 * docs/prototypes/05-studio-flow.extracted.html `.work` + `.preview-card`
 * + `.script-card` 구조 그대로.
 *
 * - preview-card: 슬라이드 미리보기 (격자 배경 + slide-mock)
 * - script-card: AI 아바타 발화 내용 + actions (수동 편집 / 다시 생성)
 *
 * 본 컴포넌트는 시각만 책임지고 데이터는 props 로 받는다.
 *
 * 변경 이력:
 * - 2026-05-21: "원본 PPT 노트" 블록 제거 — PPT 노트가 비어있는 경우가 많아
 *   존재 자체가 혼란을 줌. "AI 다듬은 스크립트" → "AI 아바타 발화 내용" 라벨
 *   변경. 채택·거부 버튼 제거하고 "수동 편집" / "다시 생성" 만 남김. 수동
 *   편집은 인라인 textarea 로 동작.
 */

export interface WorkAreaProps {
  /** 현재 슬라이드 정보 — 미리보기 헤더용. */
  slideNumber: number;
  totalSlides: number;
  slideTitle: string;
  /** 슬라이드 mock 콘텐츠 (badge + h1 + sub + 칼럼 카드 등). 없으면 placeholder. */
  slideMock?: ReactNode;
  /**
   * PPTX 를 페이지별로 렌더한 슬라이드 PNG 의 https URL. 주어지면 미리보기
   * 영역을 ``<img>`` 한 장으로 교체한다. 비어 있으면 ``slideMock`` 또는 그것도
   * 없으면 ``DefaultSlideMock`` fallback. next/image 가 아닌 단순 ``<img>`` 를
   * 쓰므로 S3 도메인을 next.config 에 등록할 필요 없음.
   */
  slideImageUrl?: string | null;
  /** AI 아바타 발화 내용 텍스트. */
  aiText: string;
  /** 예상 길이·글자수 등 메타. */
  meta?: string;
  /**
   * 활성 슬라이드가 백엔드에서 "pending" (스크립트 생성 전) 인지 여부.
   * true 면 originalText·aiText 자리를 skeleton 으로 갈음하고 "AI 생성 중…"
   * 인디케이터를 노출. 슬라이드 카드 (좌측) 는 SlidePanel 이 spinner 로 표시.
   */
  activeSlidePending?: boolean;
  /**
   * 강의 전체 분석/스크립트 생성 진입 단계. true 면 슬라이드 카운트조차
   * 아직 알려지지 않았거나 PPT 노트를 추출 중인 상태. preview-card 본문은
   * 격자 배경 위 spinner + "스크립트 생성 중…" 으로, script-card 본문은
   * placeholder 텍스트로 통일되고 액션 버튼은 모두 disabled.
   */
  isLoading?: boolean;
  /** 수동 편집 저장 — 새 본문을 받아 부모가 PATCH 호출. */
  onEditSave?: (nextText: string) => Promise<void> | void;
  /** 다시 생성 — 부모가 Claude 재생성 엔드포인트로 요청. */
  onRegenerate?: () => Promise<void> | void;
  /**
   * 'AI 아바타 발화 내용' 미리듣기 — 현재 발화 내용을 선택한 보이스·속도로
   * 실제 합성한 mp3 ``Blob`` 을 반환한다(보이스 고정 샘플이 아님). 실패 시 null.
   * 제공되지 않으면 미리듣기 버튼은 비활성.
   */
  onRequestVoicePreview?: () => Promise<Blob | null>;
  /**
   * 선택한 보이스의 샘플 오디오 URL(preview_url). 제공되면 미리듣기는 이 샘플을
   * 즉시 재생한다(ElevenLabs 합성을 거치지 않아 빠르고 안정적). 합성 경로는
   * 운영에서 5~6분 타임아웃 후 실패하는 문제가 있어, 샘플을 우선한다.
   */
  previewSampleUrl?: string | null;
  /**
   * 미리듣기 캐시 키 — 보이스·속도·슬라이드가 바뀌면 값이 달라져 재합성을
   * 트리거한다. 같은 키면 직전 합성 결과를 그대로 재생(비용 절약).
   */
  voicePreviewKey?: string;
  /** 선택한 보이스 표시명 — 재생버튼 title 용. */
  voiceName?: string;
  /** 다시 생성·저장 진행 표시. */
  regenerating?: boolean;
  saving?: boolean;
  // ── AI 영상 자막 ─────────────────────────────────────────────────────────────
  /** 자막이 음성과 동일 언어인지. true 면 자막 카드는 "동일" 안내만 표시. */
  subtitleSame?: boolean;
  /** 자막 언어 라벨 (예: "영어"). 카드 헤더에 노출. */
  subtitleLangLabel?: string;
  /**
   * 활성 슬라이드의 자막 텍스트. null = 아직 번역 안 함(번역 생성 버튼 노출),
   * 문자열(빈 문자열 포함) = 번역됨(편집 가능). subtitleSame=true 면 무시.
   */
  subtitleText?: string | null;
  /** 자막 수동 편집 저장 — 부모가 PATCH /subtitle 호출. */
  onSubtitleEditSave?: (nextText: string) => Promise<void> | void;
  /** 번역 생성/다시 번역 — 부모가 POST /subtitle/translate 호출 (전체 슬라이드). */
  onTranslateSubtitle?: () => Promise<void> | void;
  /** 번역 진행 표시. */
  translatingSubtitle?: boolean;
  /** 자막 저장 진행 표시. */
  savingSubtitle?: boolean;
}

const workStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  background: "var(--bg)",
  overflow: "hidden",
};

const workScrollStyle: CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "20px 28px 24px",
};

const cardOuterStyle: CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--line)",
  borderRadius: 14,
  overflow: "hidden",
  boxShadow: "var(--shadow-sm)",
};

const previewHeadStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 16px",
  borderBottom: "1px solid var(--line)",
};

const previewBodyStyle: CSSProperties = {
  height: "clamp(220px, 38vh, 360px)",
  flexShrink: 0,
  background: "linear-gradient(180deg, #FFFFFF 0%, #FAFAF7 100%)",
  display: "grid",
  placeItems: "center",
  position: "relative",
  overflow: "hidden",
};

const previewGridOverlay: CSSProperties = {
  content: '""',
  position: "absolute",
  inset: 0,
  backgroundImage:
    "linear-gradient(rgba(10,10,10,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(10,10,10,0.025) 1px, transparent 1px)",
  backgroundSize: "32px 32px",
};

const slideMockStyle: CSSProperties = {
  position: "relative",
  width: "88%",
  height: "86%",
  background: "var(--bg-card)",
  border: "1px solid var(--line)",
  borderRadius: 8,
  padding: "18px 22px",
  boxShadow: "var(--shadow-sm)",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  overflow: "hidden",
};

const scriptCardStyle: CSSProperties = {
  ...cardOuterStyle,
  marginTop: 16,
};

const blockStyle: CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: 10,
  background: "var(--bg-card)",
  overflow: "hidden",
};

const blockHeadBase: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 12px",
  background: "var(--bg)",
  borderBottom: "1px solid var(--line)",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

const blockTextStyle: CSSProperties = {
  padding: "12px 14px",
  fontSize: 13.5,
  lineHeight: 1.65,
  whiteSpace: "pre-wrap",
};

const pillBtnStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "7px 12px",
  borderRadius: 8,
  border: "1px solid var(--line-strong)",
  background: "var(--bg-card)",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
  color: "var(--text)",
  transition: "all 140ms var(--ease-out)",
  fontFamily: "inherit",
};

export default function WorkArea({
  slideNumber,
  totalSlides,
  slideTitle,
  slideMock,
  slideImageUrl,
  aiText,
  meta,
  activeSlidePending = false,
  isLoading = false,
  onEditSave,
  onRegenerate,
  onRequestVoicePreview,
  previewSampleUrl,
  voicePreviewKey,
  voiceName,
  regenerating = false,
  saving = false,
  subtitleSame = true,
  subtitleLangLabel,
  subtitleText = null,
  onSubtitleEditSave,
  onTranslateSubtitle,
  translatingSubtitle = false,
  savingSubtitle = false,
}: WorkAreaProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(aiText);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [editingSub, setEditingSub] = useState(false);
  const [subDraft, setSubDraft] = useState(subtitleText ?? "");
  const subTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // 'AI 발화 내용' 미리듣기 — 실제 발화 내용을 선택 보이스·속도로 합성해 재생.
  // 같은 voicePreviewKey 면 직전 합성 결과(blob URL)를 재사용해 재합성 비용을 아낀다.
  const [voicePreviewPlaying, setVoicePreviewPlaying] = useState(false);
  const [voicePreviewLoading, setVoicePreviewLoading] = useState(false);
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewCacheRef = useRef<{ key: string; url: string } | null>(null);

  const stopVoicePreview = () => {
    if (voiceAudioRef.current) {
      voiceAudioRef.current.pause();
      voiceAudioRef.current = null;
    }
    setVoicePreviewPlaying(false);
  };

  const playPreviewUrl = (url: string) => {
    try {
      const audio = new Audio(url);
      audio.onended = () => setVoicePreviewPlaying(false);
      voiceAudioRef.current = audio;
      setVoicePreviewPlaying(true);
      void audio.play().catch(() => stopVoicePreview());
    } catch {
      stopVoicePreview();
    }
  };

  const toggleVoicePreview = async () => {
    if (typeof window === "undefined") return;
    if (voicePreviewPlaying) {
      stopVoicePreview();
      return;
    }
    // 보이스 샘플(preview_url)을 즉시 재생 — 합성(ElevenLabs) 경로는 운영에서
    // 5~6분 타임아웃 후 실패하므로, 샘플이 있으면 그걸 우선 재생한다(빠르고 안정).
    if (previewSampleUrl) {
      playPreviewUrl(previewSampleUrl);
      return;
    }
    if (!onRequestVoicePreview) return;
    const key = voicePreviewKey ?? "";
    const cached = previewCacheRef.current;
    if (cached && cached.key === key) {
      playPreviewUrl(cached.url);
      return;
    }
    setVoicePreviewLoading(true);
    try {
      const blob = await onRequestVoicePreview();
      if (!blob) return;
      if (previewCacheRef.current) URL.revokeObjectURL(previewCacheRef.current.url);
      const url = URL.createObjectURL(blob);
      previewCacheRef.current = { key, url };
      playPreviewUrl(url);
    } finally {
      setVoicePreviewLoading(false);
    }
  };

  // 캐시 키(보이스·속도·슬라이드)가 바뀌면 재생 정지 + 합성 캐시 무효화.
  useEffect(() => {
    if (voiceAudioRef.current) {
      voiceAudioRef.current.pause();
      voiceAudioRef.current = null;
    }
    setVoicePreviewPlaying(false);
    if (previewCacheRef.current) {
      URL.revokeObjectURL(previewCacheRef.current.url);
      previewCacheRef.current = null;
    }
  }, [voicePreviewKey]);
  useEffect(() => {
    return () => {
      if (voiceAudioRef.current) voiceAudioRef.current.pause();
      if (previewCacheRef.current) URL.revokeObjectURL(previewCacheRef.current.url);
    };
  }, []);

  // slideImageUrl 이 빈 문자열이거나 onError 로 로드 실패한 경우 broken <img>
  // placeholder 가 노출되지 않도록 트래킹. URL 이 바뀌면 상태를 리셋해서
  // 다음 슬라이드의 이미지는 다시 시도한다.
  const [imageBroken, setImageBroken] = useState(false);
  useEffect(() => {
    setImageBroken(false);
  }, [slideImageUrl]);

  const trimmedImageUrl = slideImageUrl?.trim() ?? "";
  const showSlideImage =
    !isLoading && !imageBroken && trimmedImageUrl.length > 0;
  const slideCountUnknown = isLoading && totalSlides === 0;
  const actionsDisabled = isLoading || regenerating;

  // 슬라이드가 바뀌면 편집 모드를 해제하고 draft 도 새 본문으로 동기화한다.
  // react-hooks/set-state-in-effect: prop 변화에 따른 로컬 편집 상태 리셋이라
  // 의도적 패턴. 정공법(`key` reset 또는 derived state)은 별도 리팩토링 PR 에서.
  useEffect(() => {
    setEditing(false);
    setDraft(aiText);
  }, [aiText, slideNumber]);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      const v = textareaRef.current.value;
      textareaRef.current.setSelectionRange(v.length, v.length);
    }
  }, [editing]);

  // 슬라이드 변경·자막 갱신 시 자막 편집 상태 리셋.
  useEffect(() => {
    setEditingSub(false);
    setSubDraft(subtitleText ?? "");
  }, [subtitleText, slideNumber]);

  useEffect(() => {
    if (editingSub && subTextareaRef.current) {
      subTextareaRef.current.focus();
      const v = subTextareaRef.current.value;
      subTextareaRef.current.setSelectionRange(v.length, v.length);
    }
  }, [editingSub]);

  const handleEditClick = () => {
    setDraft(aiText);
    setEditing(true);
  };

  const handleCancel = () => {
    setDraft(aiText);
    setEditing(false);
  };

  const handleSave = async () => {
    if (!onEditSave) {
      setEditing(false);
      return;
    }
    if (draft.trim() === aiText.trim()) {
      setEditing(false);
      return;
    }
    try {
      await onEditSave(draft);
      setEditing(false);
    } catch {
      /* 저장 실패는 부모에서 토스트로 알린다 — 편집 모드는 유지 */
    }
  };

  const handleSubEditClick = () => {
    setSubDraft(subtitleText ?? "");
    setEditingSub(true);
  };

  const handleSubCancel = () => {
    setSubDraft(subtitleText ?? "");
    setEditingSub(false);
  };

  const handleSubSave = async () => {
    if (!onSubtitleEditSave) {
      setEditingSub(false);
      return;
    }
    if (subDraft.trim() === (subtitleText ?? "").trim()) {
      setEditingSub(false);
      return;
    }
    try {
      await onSubtitleEditSave(subDraft);
      setEditingSub(false);
    } catch {
      /* 저장 실패는 부모 토스트 — 편집 모드 유지 */
    }
  };

  return (
    <div style={workStyle}>
      <div style={workScrollStyle}>
        {/* PREVIEW CARD */}
        <div style={cardOuterStyle}>
          <div style={previewHeadStyle}>
            <div className="flex items-center gap-2.5 min-w-0">
              {slideCountUnknown ? (
                <span
                  data-testid="workarea-header-analyzing"
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    color: "var(--gold)",
                    textTransform: "uppercase",
                  }}
                >
                  슬라이드 분석 중
                </span>
              ) : (
                <>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      color: "var(--gold)",
                      textTransform: "uppercase",
                    }}
                  >
                    슬라이드 <span style={tabularStyle}>{slideNumber}</span> / {totalSlides}
                  </span>
                  <span
                    className="truncate"
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: "var(--text)",
                      maxWidth: "40vw",
                    }}
                  >
                    {slideTitle}
                  </span>
                </>
              )}
            </div>
          </div>
          <div style={previewBodyStyle}>
            <div style={previewGridOverlay} aria-hidden="true" />
            {isLoading ? (
              <LoadingPreviewMock />
            ) : showSlideImage ? (
              // 실제 PPT 슬라이드 이미지 — next/image 대신 단순 <img> 로 S3
              // 외부 도메인 등록을 회피한다. 로드 실패 시 broken-image 아이콘
              // 노출을 막기 위해 onError 로 fallback mock 으로 전환한다.
              //
              // 크기: max-width/max-height 100% + width/height auto + min 0.
              // grid item 은 기본 min-height:auto 인데, 이미지(replaced element)
              // 에서는 이게 "원본 높이(intrinsic height)" 로 해석되고 min-height
              // 는 max-height 를 항상 이긴다. 따라서 max-height:100% 만으로는
              // 부족 — 원본 825px 가 그대로 적용돼 박스를 넘치고 overflow:hidden
              // 으로 하단이 잘렸다 (#214 가 min:0 을 누락해 잘림이 재발).
              // min-width/min-height:0 으로 자동 최소 크기를 끄면 비로소
              // max-height:100% 가 먹어 박스 안에 비율 유지로 들어간다.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={trimmedImageUrl}
                alt={`슬라이드 ${slideNumber} 미리보기`}
                onError={() => setImageBroken(true)}
                style={{
                  display: "block",
                  maxWidth: "100%",
                  maxHeight: "100%",
                  width: "auto",
                  height: "auto",
                  minWidth: 0,
                  minHeight: 0,
                  objectFit: "contain",
                  borderRadius: 8,
                }}
              />
            ) : (
              <div style={slideMockStyle}>
                {slideMock ?? (
                  <DefaultSlideMock title={slideTitle} number={slideNumber} />
                )}
              </div>
            )}
            {!isLoading && activeSlidePending && (
              <PendingPreviewOverlay slideNumber={slideNumber} />
            )}
          </div>
        </div>

        {/* SCRIPT CARD */}
        <div style={scriptCardStyle}>
          <div
            style={{
              padding: "14px 18px",
              borderBottom: "1px solid var(--line)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <h3
              style={{
                ...displayStyle,
                margin: 0,
                fontSize: 16,
                fontWeight: 700,
              }}
            >
              스크립트 검토
            </h3>
            {meta && (
              <span
                style={{
                  ...tabularStyle,
                  fontSize: 11,
                  color: "var(--text-subtle)",
                }}
              >
                {meta}
              </span>
            )}
          </div>
          <div style={{ padding: "16px 18px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={blockStyle}>
              <div
                style={{
                  ...blockHeadBase,
                  color: "var(--gold)",
                  background: "rgba(255, 182, 39, 0.06)",
                }}
              >
                AI 아바타 발화 내용
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: 10,
                    letterSpacing: "0.04em",
                    textTransform: "none",
                    fontWeight: 500,
                    color: "var(--text-faint)",
                  }}
                >
                  하두진 교수 톤 학습 모델
                </span>
                <VoicePreviewButton
                  enabled={
                    !!previewSampleUrl ||
                    (!!onRequestVoicePreview && aiText.trim().length > 0)
                  }
                  voiceName={voiceName}
                  playing={voicePreviewPlaying}
                  loading={voicePreviewLoading}
                  onToggle={toggleVoicePreview}
                />
              </div>
              {isLoading ? (
                <div
                  data-testid="workarea-script-loading"
                  style={{
                    ...blockTextStyle,
                    color: "var(--text-muted)",
                    fontStyle: "italic",
                  }}
                >
                  AI 가 PPT 노트를 추출하고 있어요…
                </div>
              ) : editing ? (
                <div style={{ padding: 14 }}>
                  <textarea
                    ref={textareaRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={Math.min(14, Math.max(5, draft.split("\n").length + 1))}
                    aria-label="AI 아바타 발화 내용 편집"
                    disabled={saving}
                    style={{
                      width: "100%",
                      fontFamily: "inherit",
                      fontSize: 13.5,
                      lineHeight: 1.65,
                      padding: 10,
                      border: "1px solid var(--line-strong)",
                      borderRadius: 8,
                      background: "var(--bg)",
                      color: "var(--text)",
                      resize: "vertical",
                      outline: "none",
                    }}
                  />
                  <div
                    className="flex justify-end gap-2"
                    style={{ marginTop: 10 }}
                  >
                    <button
                      type="button"
                      onClick={handleCancel}
                      disabled={saving}
                      style={pillBtnStyle}
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving}
                      style={{
                        ...pillBtnStyle,
                        background: "var(--gold-soft)",
                        borderColor: "var(--gold)",
                        color: "var(--gold-on-light, #B88308)",
                      }}
                    >
                      {saving ? "저장 중…" : "저장"}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ ...blockTextStyle, color: "var(--text)" }}>
                  {aiText}
                </div>
              )}
            </div>
            {!editing && (
              <div className="flex flex-wrap gap-2" style={{ marginTop: 4 }}>
                <button
                  type="button"
                  onClick={handleEditClick}
                  style={{
                    ...pillBtnStyle,
                    opacity: actionsDisabled ? 0.55 : 1,
                    cursor: actionsDisabled ? "not-allowed" : "pointer",
                  }}
                  disabled={actionsDisabled}
                >
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  수동 편집
                </button>
                <span style={{ flex: 1 }} />
                <button
                  type="button"
                  onClick={onRegenerate}
                  disabled={actionsDisabled}
                  style={{
                    ...pillBtnStyle,
                    color: "var(--text-muted)",
                    opacity: actionsDisabled ? 0.55 : 1,
                    cursor: actionsDisabled ? (isLoading ? "not-allowed" : "wait") : "pointer",
                  }}
                >
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="1 4 1 10 7 10" />
                    <path d="M3.51 15A9 9 0 1 0 6 5.3L1 10" />
                  </svg>
                  {regenerating ? "다시 생성 중…" : "다시 생성"}
                </button>
              </div>
            )}

            {/* ── AI 영상 자막 ── */}
            {!isLoading && (
              <div style={blockStyle}>
                <div
                  style={{
                    ...blockHeadBase,
                    color: "#7c3aed",
                    background: "rgba(167, 139, 250, 0.07)",
                  }}
                >
                  AI 영상 자막
                  {!subtitleSame && subtitleLangLabel && (
                    <span
                      style={{
                        marginLeft: "auto",
                        fontSize: 10,
                        letterSpacing: "0.04em",
                        textTransform: "none",
                        fontWeight: 600,
                        color: "#7c3aed",
                      }}
                    >
                      {subtitleLangLabel}
                    </span>
                  )}
                </div>

                {subtitleSame ? (
                  <div
                    data-testid="workarea-subtitle-same"
                    style={{
                      ...blockTextStyle,
                      color: "var(--text-muted)",
                      fontStyle: "italic",
                    }}
                  >
                    자막은 위 발화 내용과 동일합니다.
                  </div>
                ) : subtitleText === null ? (
                  <div
                    style={{
                      padding: 14,
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      alignItems: "flex-start",
                    }}
                  >
                    <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>
                      음성과 자막 언어가 다릅니다. 발화 내용을{" "}
                      {subtitleLangLabel ?? "자막 언어"}(으)로 번역해 자막을 만들 수 있어요.
                    </p>
                    <button
                      type="button"
                      onClick={onTranslateSubtitle}
                      disabled={translatingSubtitle}
                      style={{
                        ...pillBtnStyle,
                        background: "var(--gold-soft)",
                        borderColor: "var(--gold)",
                        color: "var(--gold-on-light, #B88308)",
                        opacity: translatingSubtitle ? 0.6 : 1,
                        cursor: translatingSubtitle ? "wait" : "pointer",
                      }}
                    >
                      {translatingSubtitle ? "번역 생성 중…" : "번역 생성"}
                    </button>
                  </div>
                ) : editingSub ? (
                  <div style={{ padding: 14 }}>
                    <textarea
                      ref={subTextareaRef}
                      value={subDraft}
                      onChange={(e) => setSubDraft(e.target.value)}
                      rows={Math.min(14, Math.max(4, subDraft.split("\n").length + 1))}
                      aria-label="AI 영상 자막 편집"
                      disabled={savingSubtitle}
                      style={{
                        width: "100%",
                        fontFamily: "inherit",
                        fontSize: 13.5,
                        lineHeight: 1.65,
                        padding: 10,
                        border: "1px solid var(--line-strong)",
                        borderRadius: 8,
                        background: "var(--bg)",
                        color: "var(--text)",
                        resize: "vertical",
                        outline: "none",
                      }}
                    />
                    <div className="flex justify-end gap-2" style={{ marginTop: 10 }}>
                      <button
                        type="button"
                        onClick={handleSubCancel}
                        disabled={savingSubtitle}
                        style={pillBtnStyle}
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        onClick={handleSubSave}
                        disabled={savingSubtitle}
                        style={{
                          ...pillBtnStyle,
                          background: "var(--gold-soft)",
                          borderColor: "var(--gold)",
                          color: "var(--gold-on-light, #B88308)",
                        }}
                      >
                        {savingSubtitle ? "저장 중…" : "저장"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ ...blockTextStyle, color: "var(--text)" }}>
                      {subtitleText || "(자막이 비어 있습니다)"}
                    </div>
                    <div className="flex flex-wrap gap-2" style={{ padding: "0 14px 12px" }}>
                      <button type="button" onClick={handleSubEditClick} style={pillBtnStyle}>
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        수동 편집
                      </button>
                      <span style={{ flex: 1 }} />
                      <button
                        type="button"
                        onClick={onTranslateSubtitle}
                        disabled={translatingSubtitle}
                        style={{
                          ...pillBtnStyle,
                          color: "var(--text-muted)",
                          opacity: translatingSubtitle ? 0.6 : 1,
                          cursor: translatingSubtitle ? "wait" : "pointer",
                        }}
                      >
                        {translatingSubtitle ? "다시 번역 중…" : "전체 다시 번역"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 'AI 아바타 발화 내용' 카드 우측 상단의 미리듣기 버튼.
 * 클릭하면 현재 발화 내용을 선택한 보이스·속도로 합성해 재생한다(고정 샘플 아님).
 * ``loading`` 동안엔 '생성 중…', 재생 중엔 '정지'. ``enabled=false`` 면 비활성.
 */
function VoicePreviewButton({
  enabled,
  voiceName,
  playing,
  loading,
  onToggle,
}: {
  enabled: boolean;
  voiceName?: string;
  playing: boolean;
  loading: boolean;
  onToggle: () => void;
}) {
  const title = enabled
    ? voiceName
      ? `${voiceName} 보이스·속도로 발화 내용 미리듣기`
      : "선택한 보이스·속도로 발화 내용 미리듣기"
    : "미리들을 발화 내용이 없습니다";
  const interactive = enabled && !loading;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      disabled={!interactive}
      aria-label={playing ? "미리듣기 정지" : "발화 내용 미리듣기"}
      aria-busy={loading}
      title={title}
      style={{
        marginLeft: 8,
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 9px 3px 7px",
        borderRadius: 999,
        border: "1px solid",
        borderColor: enabled ? "var(--gold)" : "var(--line-strong)",
        background: playing ? "var(--gold-soft)" : "var(--bg-card)",
        color: enabled ? "var(--gold-on-light, #B88308)" : "var(--text-faint)",
        cursor: interactive ? "pointer" : loading ? "wait" : "not-allowed",
        opacity: enabled ? 1 : 0.5,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: 0,
        textTransform: "none",
        fontFamily: "inherit",
      }}
    >
      {loading ? (
        <svg viewBox="0 0 32 32" width="11" height="11" className="studio-slide-spinner" aria-hidden="true">
          <circle cx="16" cy="16" r="12" fill="none" stroke="rgba(184,131,8,0.25)" strokeWidth="4" />
          <path d="M 16 4 A 12 12 0 0 1 28 16" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        </svg>
      ) : playing ? (
        <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" aria-hidden="true">
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" aria-hidden="true">
          <path d="M7 4.5v15a1 1 0 0 0 1.55.83l11-7.5a1 1 0 0 0 0-1.66l-11-7.5A1 1 0 0 0 7 4.5z" />
        </svg>
      )}
      {loading ? "생성 중…" : playing ? "정지" : "미리듣기"}
    </button>
  );
}

/**
 * 활성 슬라이드가 pending 상태일 때 preview body 위에 띄우는 반투명 오버레이.
 * AI 스크립트 생성 중임을 알리는 spinner + 라벨로 구성. 슬라이드 미리보기
 * 자체(slideMock) 는 그대로 보이되 위에 layer 가 깔린다 — 어떤 슬라이드인지
 * 식별은 가능하면서도 "아직 작업 중" 임이 분명히 전달된다.
 */
function PendingPreviewOverlay({ slideNumber }: { slideNumber: number }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        placeItems: "center",
        background: "rgba(250, 250, 247, 0.78)",
        backdropFilter: "blur(2px)",
        zIndex: 2,
        gap: 8,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
        <svg
          viewBox="0 0 32 32"
          width="28"
          height="28"
          className="studio-slide-spinner"
          aria-hidden="true"
        >
          <circle
            cx="16"
            cy="16"
            r="12"
            fill="none"
            stroke="rgba(255, 182, 39, 0.20)"
            strokeWidth="3"
          />
          <path
            d="M 16 4 A 12 12 0 0 1 28 16"
            fill="none"
            stroke="var(--gold-on-light, var(--gold))"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
        <div
          style={{
            ...tabularStyle,
            fontSize: 12,
            fontWeight: 600,
            color: "var(--gold-on-light, var(--gold))",
            letterSpacing: "0.04em",
          }}
        >
          슬라이드 {slideNumber} · AI 생성 중…
        </div>
      </div>
    </div>
  );
}

/**
 * 강의 진입 시 isLoading=true 동안 preview body 가운데에 띄우는 mock.
 * 격자 배경은 부모의 previewGridOverlay 가 이미 제공하므로 여기서는
 * spinner + 문구만 렌더한다.
 */
function LoadingPreviewMock() {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="workarea-preview-loading"
      style={{
        position: "relative",
        zIndex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
      }}
    >
      <svg
        viewBox="0 0 32 32"
        width="26"
        height="26"
        className="studio-slide-spinner"
        aria-hidden="true"
      >
        <circle
          cx="16"
          cy="16"
          r="12"
          fill="none"
          stroke="rgba(255, 182, 39, 0.20)"
          strokeWidth="3"
        />
        <path
          d="M 16 4 A 12 12 0 0 1 28 16"
          fill="none"
          stroke="var(--gold-on-light, var(--gold))"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      <div
        style={{
          ...tabularStyle,
          fontSize: 12.5,
          fontWeight: 600,
          color: "var(--gold-on-light, var(--gold))",
          letterSpacing: "0.04em",
        }}
      >
        스크립트 생성 중…
      </div>
    </div>
  );
}

/**
 * slideTitle 에 한자가 포함되어 있으면 그 한자 1자를 큰 글자로 보여주는 fallback
 * mock. prototype 의 把자문 슬라이드 디자인을 일반화.
 */
function DefaultSlideMock({ title, number }: { title: string; number: number }) {
  const hanMatch = title.match(/[㐀-䶿一-鿿]/);
  const hanChar = hanMatch?.[0];

  return (
    <>
      <span
        style={{
          display: "inline-flex",
          alignSelf: "flex-start",
          padding: "2px 9px",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.10em",
          color: "var(--gold)",
          background: "var(--gold-soft)",
          borderRadius: 999,
          textTransform: "uppercase",
        }}
      >
        Slide {number}
      </span>
      <h1
        style={{
          ...displayStyle,
          margin: 0,
          fontSize: "clamp(18px, 2vw, 22px)",
          fontWeight: 700,
          letterSpacing: "-0.015em",
          lineHeight: 1.25,
          color: "var(--text)",
        }}
      >
        {hanChar ? <span style={hanStyle}>{hanChar}</span> : null}
        {title.replace(/[㐀-䶿一-鿿]/, "")}
      </h1>
      <p
        style={{
          margin: 0,
          color: "var(--text-muted)",
          fontSize: 13,
          lineHeight: 1.55,
        }}
      >
        AI 가 분석한 슬라이드 미리보기입니다. 실제 PPT 디자인은 영상 생성 후
        확인하실 수 있어요.
      </p>
    </>
  );
}
