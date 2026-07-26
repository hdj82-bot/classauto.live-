"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useI18n } from "@/contexts/I18nContext";
import { useOptionalLecture } from "@/contexts/LectureContext";
import { feedbackApi } from "@/lib/api";

/**
 * 인앱 피드백 모달 (스펙 13 §F).
 *
 * 종전에는 이 모달이 우하단 `position: fixed` 버튼(`GlobalFeedbackButton`)에
 * 붙어 있었고, 그 버튼이 스튜디오 하단 ActionBar CTA 를 덮어 **2026-06-27 에
 * 통째로 철회**됐다(#575). 그 뒤 한 달간 제보 경로가 0건이었다.
 *
 * 겹침의 원인은 버튼의 존재가 아니라 `position: fixed` 였다. 그래서 모달만 여기로
 * 떼어 내고, 트리거는 각 화면의 **레이아웃 흐름 안**에 놓는다(`FeedbackLauncher`).
 * 이 파일에는 고정 위치가 없다 — 다시 넣지 말 것.
 *
 * 강의 맥락(`lecture_id`)은 `LectureContext` 에서 읽는다. 없으면 보내지 않는다 —
 * 맥락을 못 붙였다고 제보 자체를 막으면 베타에서 가장 필요한 신호를 잃는다(§D).
 */
const CATEGORIES = ["bug", "idea", "confusing", "other"] as const;

export default function FeedbackDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const lecture = useOptionalLecture();

  const [category, setCategory] = useState<string>("idea");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await feedbackApi.submit({
        category,
        message: message.trim(),
        page: pathname || undefined,
        lecture_id: lecture?.lectureId,
      });
      setDone(true);
      setMessage("");
    } catch {
      setError(t("feedback.error"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("feedback.title")}
      onClick={onClose}
      data-testid="feedback-dialog"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        background: "rgba(0,0,0,0.4)",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 420,
          background: "var(--bg-card)",
          borderRadius: 16,
          padding: 20,
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
            {t("feedback.title")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("feedback.close")}
            style={{
              border: "none",
              background: "none",
              fontSize: 20,
              cursor: "pointer",
              color: "var(--text-subtle)",
            }}
          >
            ×
          </button>
        </div>

        {done ? (
          <div style={{ padding: "16px 0", textAlign: "center" }}>
            <p style={{ fontSize: 14, color: "var(--success)", marginBottom: 16 }}>
              {t("feedback.thanks")}
            </p>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "8px 16px",
                borderRadius: 10,
                border: "1px solid var(--line-strong)",
                background: "var(--bg-card)",
                color: "var(--text)",
                cursor: "pointer",
                fontSize: 13,
                fontFamily: "inherit",
              }}
            >
              {t("feedback.close")}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
              {t("feedback.subtitle")}
            </p>
            {/* 어느 강의에서 냈는지 보여 준다 — 제보자가 맥락이 붙는 걸 알아야
                "무슨 강의였는지"를 본문에 또 쓰지 않는다. */}
            {lecture?.lectureTitle && (
              <p
                data-testid="feedback-dialog-lecture"
                style={{ fontSize: 12, color: "var(--text-subtle)" }}
              >
                {t("feedback.lectureContext", { title: lecture.lectureTitle })}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 999,
                    fontSize: 12,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    border:
                      category === c
                        ? "1px solid var(--gold-on-light)"
                        : "1px solid var(--line-strong)",
                    background:
                      category === c ? "var(--gold-soft)" : "var(--bg-card)",
                    color:
                      category === c ? "var(--gold-on-light)" : "var(--text-muted)",
                    fontWeight: category === c ? 600 : 400,
                  }}
                >
                  {t(`feedback.category.${c}`)}
                </button>
              ))}
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 4000))}
              placeholder={t("feedback.placeholder")}
              rows={5}
              style={{
                width: "100%",
                borderRadius: 10,
                border: "1px solid var(--line-strong)",
                background: "var(--bg-card)",
                color: "var(--text)",
                padding: "10px 12px",
                fontSize: 14,
                resize: "vertical",
                fontFamily: "inherit",
              }}
            />
            {error && (
              <p style={{ fontSize: 12, color: "var(--warning)", margin: 0 }} role="alert">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={!message.trim() || submitting}
              style={{
                padding: "10px 16px",
                borderRadius: 10,
                border: "none",
                background:
                  !message.trim() || submitting
                    ? "var(--line-strong)"
                    : "var(--gold-on-light)",
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                fontFamily: "inherit",
                cursor: !message.trim() || submitting ? "not-allowed" : "pointer",
              }}
            >
              {submitting ? t("feedback.submitting") : t("feedback.submit")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
