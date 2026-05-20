"use client";

import { useState } from "react";
import { api } from "@/lib/api";
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
}

interface Props {
  lecture: LectureCardData;
  /** "이어서 제작" 클릭 시. 미완성/제작중이면 studio, 완성이면 분석으로 라우팅하는 로직은 호출자 책임. */
  onContinue: (id: string) => void;
  /** 성공적으로 삭제된 직후 호출 — 부모 state 에서 해당 강의 제거 + 토스트 호출자 책임 */
  onDeleted: (id: string) => void;
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
  padding = 20,
}: Props) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isProduction =
    !lecture.is_published &&
    (lecture.pipeline_task_id || !lecture.video_url);

  const continueLabel = isProduction
    ? t("lectureCard.continueCreating")
    : t("lectureCard.openLecture");

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/api/lectures/${lecture.id}`);
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
          <button
            type="button"
            onClick={() => onContinue(lecture.id)}
            className="flex-1 rounded-lg motion-safe:transition"
            style={{
              padding: "8px 12px",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--gold)",
              background: "var(--gold-soft)",
              border: "1px solid var(--gold-medium)",
              cursor: "pointer",
            }}
          >
            {continueLabel}
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
      className="truncate"
      style={{
        margin: 0,
        fontSize: 15,
        fontWeight: 700,
        color: "var(--text)",
        letterSpacing: "-0.01em",
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
