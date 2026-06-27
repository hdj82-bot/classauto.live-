"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useOptionalAuth } from "@/contexts/AuthContext";
import { useI18n } from "@/contexts/I18nContext";
import { feedbackApi } from "@/lib/api";

/**
 * 전역 피드백 버튼 (스펙 13 · F) — 우하단 고정. 로그인한 교수/학생 공통.
 *
 * 베타의 핵심 목적이 교수 피드백 수집이므로, 흩어진 이메일 대신 유저·페이지에
 * 묶어 운영자 콘솔(/admin/feedback)로 모은다. 비로그인 사용자에게는 노출하지
 * 않는다(백엔드가 get_current_user 로 401). 학생 학습 흐름과 무관한 부가 UI.
 */
const CATEGORIES = ["bug", "idea", "confusing", "other"] as const;

export default function GlobalFeedbackButton() {
  const auth = useOptionalAuth();
  const pathname = usePathname();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>("idea");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  // 로그인 유저에게만. 관리자 콘솔(/admin)에서는 자체 인박스가 있어 숨긴다.
  if (!auth?.user) return null;
  if (pathname?.startsWith("/admin")) return null;

  const reset = () => {
    setMessage("");
    setCategory("idea");
    setError("");
    setDone(false);
  };

  const close = () => {
    setOpen(false);
    reset();
  };

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
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("feedback.buttonLabel")}
        style={{
          position: "fixed",
          right: 20,
          bottom: 20,
          zIndex: 60,
          padding: "10px 16px",
          borderRadius: 999,
          border: "1px solid rgba(10,10,10,0.12)",
          background: "#0A0A0A",
          color: "#FFB627",
          fontSize: 13,
          fontWeight: 600,
          boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
          cursor: "pointer",
        }}
      >
        {t("feedback.buttonLabel")}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("feedback.title")}
          onClick={close}
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
              background: "#fff",
              borderRadius: 16,
              padding: 20,
              boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#0A0A0A" }}>
                {t("feedback.title")}
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label={t("feedback.close")}
                style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer", color: "#888" }}
              >
                ×
              </button>
            </div>

            {done ? (
              <div style={{ padding: "16px 0", textAlign: "center" }}>
                <p style={{ fontSize: 14, color: "#1a7f37", marginBottom: 16 }}>
                  {t("feedback.thanks")}
                </p>
                <button
                  type="button"
                  onClick={close}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 10,
                    border: "1px solid rgba(10,10,10,0.12)",
                    background: "#fff",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  {t("feedback.close")}
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <p style={{ fontSize: 12, color: "rgba(10,10,10,0.55)", lineHeight: 1.5 }}>
                  {t("feedback.subtitle")}
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
                        border: category === c ? "1px solid #B88308" : "1px solid rgba(10,10,10,0.15)",
                        background: category === c ? "rgba(184,131,8,0.1)" : "#fff",
                        color: category === c ? "#B88308" : "rgba(10,10,10,0.6)",
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
                    border: "1px solid rgba(10,10,10,0.15)",
                    padding: "10px 12px",
                    fontSize: 14,
                    resize: "vertical",
                    fontFamily: "inherit",
                  }}
                />
                {error && (
                  <p style={{ fontSize: 12, color: "#d33", margin: 0 }} role="alert">
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
                    background: !message.trim() || submitting ? "rgba(10,10,10,0.2)" : "#0A0A0A",
                    color: "#FFB627",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: !message.trim() || submitting ? "not-allowed" : "pointer",
                  }}
                >
                  {submitting ? t("feedback.submitting") : t("feedback.submit")}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
