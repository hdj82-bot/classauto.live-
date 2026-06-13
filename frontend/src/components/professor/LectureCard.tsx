"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { invalidateProfessorData } from "@/lib/professorData";
import { useToast } from "@/components/ui/Toast";
import Modal from "@/components/ui/Modal";
import { useI18n } from "@/contexts/I18nContext";
import { Card, hanStyle } from "@/components/professor/shell";

export interface LectureCardData {
  id: string;
  title: string;
  is_published: boolean;
  video_url?: string | null;
  pipeline_task_id?: string | null;
  /** PPT 1번 슬라이드 이미지 URL(카드 썸네일). null 이면 placeholder. */
  thumbnail_url?: string | null;
}

interface Props {
  lecture: LectureCardData;
  /** "이어서 제작" 클릭 시. 미완성/제작중이면 studio, 완성이면 분석으로 라우팅하는 로직은 호출자 책임. */
  onContinue: (id: string) => void;
  /** 성공적으로 삭제된 직후 호출 — 부모 state 에서 해당 강의 제거 + 토스트 호출자 책임 */
  onDeleted: (id: string) => void;
  /**
   * "미리보기" 클릭 시 — 완료된 강의를 학생과 동일한 플레이어로 점검
   * (/lecture/[slug]?preview=1). 슬러그는 부모가 알기에 콜백으로 위임.
   *
   * 완료(미제작중) 강의에는 현재 수정 기능이 없으므로, onPreview 가 제공되면
   * 미리보기가 1차 동작(gold primary)으로 "강의 열기"를 대체한다. 제작 중
   * 강의는 그대로 "이어서 제작"(studio) 이 1차 동작이다.
   */
  onPreview?: (id: string) => void;
  /** 공개/비공개 전환 성공 후 — 부모가 목록 state 의 is_published 를 갱신. */
  onVisibilityChanged?: (id: string, isPublished: boolean) => void;
  padding?: number;
}

/**
 * 대시보드/라이브러리 공용 강의 카드.
 *
 * 버튼 레이아웃: [이어서 제작] [삭제]. 삭제는 확인 모달을 띄운 뒤
 * ``DELETE /api/lectures/{id}`` 를 호출한다 (서비스 측에서 진행 중 HeyGen
 * 잡 best-effort 취소 → DB cascade 삭제).
 */
export default function LectureCard({
  lecture,
  onContinue,
  onDeleted,
  onPreview,
  onVisibilityChanged,
  padding = 20,
}: Props) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  // 썸네일 로드 실패(만료·권한 등) 시 깨진 이미지(x) 대신 placeholder 로 폴백.
  const [thumbFailed, setThumbFailed] = useState(false);

  const isProduction =
    !lecture.is_published &&
    (lecture.pipeline_task_id || !lecture.video_url);

  // 완료 강의는 수정 경로가 없어 미리보기를 1차 동작으로 노출(onPreview 제공 시).
  const previewIsPrimary = !isProduction && Boolean(onPreview);

  // 완료 강의(미리보기 1차)는 그대로 두면 영상 제작/편집 화면 진입 경로가 없다.
  // 발행 여부와 무관하게 "스튜디오"(영상 생성·편집) 보조 버튼을 노출한다
  // (onContinue → /professor/studio/{id}). 교수자 요청: 기존 강의의 영상 생성
  // 페이지 진입 경로를 카드마다 둔다.
  const showStudioButton = previewIsPrimary;

  // gold primary 버튼 — 제작 중이면 "이어서 제작", 완료+미리보기면 "미리보기",
  // 그 외(미리보기 미제공 완료)면 기존 "강의 열기".
  const primaryButtonStyle = {
    padding: "8px 12px",
    fontSize: 12,
    fontWeight: 600 as const,
    color: "var(--gold)",
    background: "var(--gold-soft)",
    border: "1px solid var(--gold-medium)",
    cursor: "pointer",
  };

  // 썸네일 클릭 시 동작 — 미리보기 가능하면 학생 플레이어(새 탭), 아니면 스튜디오.
  // (미발행이어도 소유 교수자는 owner-bypass 로 미리보기 가능 — 무한 루프 해소.)
  const handleThumbnailClick = () => {
    if (onPreview) onPreview(lecture.id);
    else onContinue(lecture.id);
  };

  // 공개/비공개 전환 — PATCH is_published. 기본은 비공개(학생 데이터 보호 정책),
  // 교수자가 직접 공개를 선택할 수 있게 한다. 성공 시 부모 목록 state 갱신.
  const handleToggleVisibility = async () => {
    if (publishing) return;
    const next = !lecture.is_published;
    setPublishing(true);
    try {
      await api.patch(`/api/lectures/${lecture.id}`, { is_published: next });
      invalidateProfessorData();
      onVisibilityChanged?.(lecture.id, next);
      toast(next ? "공개로 전환했습니다." : "비공개로 전환했습니다.", "success");
    } catch {
      toast("공개 설정 변경에 실패했습니다.", "error");
    } finally {
      setPublishing(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/api/lectures/${lecture.id}`);
      // 공유 캐시 무효화 — 다른 페이지 재진입 시 삭제가 반영되도록.
      invalidateProfessorData();
      toast(t("lectureCard.deleteSuccess"), "success");
      setConfirmOpen(false);
      onDeleted(lecture.id);
    } catch {
      toast(t("lectureCard.deleteError"), "error");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Card padding={padding} radius={14} interactive role="article">
        {/* 썸네일 — PPT 1번 슬라이드. 클릭 시 미리보기(또는 스튜디오). 16:9. */}
        <button
          type="button"
          onClick={handleThumbnailClick}
          aria-label={t("lectureCard.preview")}
          style={{
            display: "block",
            width: "100%",
            aspectRatio: "16 / 9",
            marginBottom: 12,
            border: "1px solid var(--line)",
            borderRadius: 10,
            overflow: "hidden",
            padding: 0,
            cursor: "pointer",
            background: "var(--bg-subtle)",
            position: "relative",
          }}
        >
          {lecture.thumbnail_url && !thumbFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={lecture.thumbnail_url}
              alt=""
              onError={() => setThumbFailed(true)}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          ) : (
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                display: "grid",
                placeItems: "center",
                color: "var(--text-faint)",
              }}
            >
              <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                <polygon points="9 7 17 12 9 17 9 7" fill="currentColor" stroke="none" />
                <rect x="3" y="3" width="18" height="18" rx="3" />
              </svg>
            </span>
          )}
        </button>
        <LectureTitle title={lecture.title} />
        <span
          className="inline-flex items-center gap-1.5 rounded-full"
          style={{
            marginTop: 8,
            padding: "3px 9px",
            fontSize: 11,
            fontWeight: 600,
            color: lecture.is_published
              ? "var(--success)"
              : isProduction
                ? "var(--gold)"
                : "var(--text-subtle)",
            background: lecture.is_published
              ? "rgba(16, 185, 129, 0.10)"
              : isProduction
                ? "var(--gold-soft)"
                : "var(--bg-subtle)",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: lecture.is_published
                ? "var(--success)"
                : isProduction
                  ? "var(--gold)"
                  : "var(--text-faint)",
            }}
          />
          {lecture.is_published
            ? t("common.published")
            : isProduction
              ? t("lectureCard.inProduction")
              : t("common.unpublished")}
        </span>
        <div className="mt-4 flex gap-2">
          {previewIsPrimary ? (
            <button
              type="button"
              onClick={() => onPreview!(lecture.id)}
              className="flex-1 rounded-lg motion-safe:transition"
              style={primaryButtonStyle}
            >
              {t("lectureCard.preview")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onContinue(lecture.id)}
              className="flex-1 rounded-lg motion-safe:transition"
              style={primaryButtonStyle}
            >
              {isProduction
                ? t("lectureCard.continueCreating")
                : t("lectureCard.openLecture")}
            </button>
          )}
          {showStudioButton && (
            <button
              type="button"
              onClick={() => onContinue(lecture.id)}
              className="rounded-lg motion-safe:transition"
              style={{
                padding: "8px 12px",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text)",
                background: "var(--bg-card)",
                border: "1px solid var(--line-strong)",
                cursor: "pointer",
              }}
            >
              {t("lectureCard.openStudio")}
            </button>
          )}
          <button
            type="button"
            onClick={handleToggleVisibility}
            disabled={publishing}
            className="rounded-lg motion-safe:transition"
            aria-label={lecture.is_published ? "비공개로 전환" : "공개로 전환"}
            style={{
              padding: "8px 12px",
              fontSize: 12,
              fontWeight: 600,
              color: lecture.is_published ? "var(--text-muted)" : "var(--success)",
              background: lecture.is_published ? "var(--bg-card)" : "rgba(16, 185, 129, 0.10)",
              border: lecture.is_published
                ? "1px solid var(--line-strong)"
                : "1px solid var(--success)",
              cursor: publishing ? "not-allowed" : "pointer",
              opacity: publishing ? 0.6 : 1,
              whiteSpace: "nowrap",
            }}
          >
            {publishing ? "…" : lecture.is_published ? "비공개로" : "공개"}
          </button>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            className="rounded-lg motion-safe:transition"
            aria-label={t("lectureCard.deleteAria", { title: lecture.title })}
            style={{
              padding: "8px 12px",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--danger, #b91c1c)",
              background: "transparent",
              border: "1px solid var(--line)",
              cursor: "pointer",
            }}
          >
            {t("lectureCard.delete")}
          </button>
        </div>
      </Card>

      <Modal
        open={confirmOpen}
        onClose={deleting ? undefined : () => setConfirmOpen(false)}
        closable={!deleting}
        title={t("lectureCard.deleteConfirmTitle")}
      >
        <p style={{ color: "var(--text-muted)", marginBottom: 18 }}>
          {t("lectureCard.deleteConfirmBody", { title: lecture.title })}
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={deleting}
            onClick={() => setConfirmOpen(false)}
            className="rounded-lg"
            style={{
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 500,
              color: "var(--text-muted)",
              background: "transparent",
              border: "1px solid var(--line)",
              cursor: deleting ? "not-allowed" : "pointer",
            }}
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={handleDelete}
            className="rounded-lg"
            style={{
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              background: "var(--danger, #b91c1c)",
              border: "1px solid var(--danger, #b91c1c)",
              cursor: deleting ? "not-allowed" : "pointer",
              opacity: deleting ? 0.6 : 1,
            }}
          >
            {deleting ? t("common.processing") : t("lectureCard.deleteConfirm")}
          </button>
        </div>
      </Modal>
    </>
  );
}

function LectureTitle({ title }: { title: string }) {
  const han = /[㐀-䶿一-鿿]/;
  const parts: { text: string; han: boolean }[] = [];
  let buf = "";
  let isHan = false;
  for (const ch of title) {
    const ch_is_han = han.test(ch);
    if (ch_is_han !== isHan && buf) {
      parts.push({ text: buf, han: isHan });
      buf = "";
    }
    isHan = ch_is_han;
    buf += ch;
  }
  if (buf) parts.push({ text: buf, han: isHan });

  return (
    <h3
      style={{
        margin: 0,
        // 우상단 "이동" 버튼과 겹치지 않게 우측 여백 + 최대 2줄로 표기(잘림 방지).
        paddingRight: 56,
        fontSize: 15,
        fontWeight: 700,
        color: "var(--text)",
        letterSpacing: "-0.01em",
        display: "-webkit-box",
        WebkitBoxOrient: "vertical",
        WebkitLineClamp: 2,
        overflow: "hidden",
        wordBreak: "break-word",
      }}
    >
      {parts.map((p, i) =>
        p.han ? (
          <span key={i} style={hanStyle}>
            {p.text}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </h3>
  );
}
