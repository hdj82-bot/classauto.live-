"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { useInboxI18n } from "./useInboxI18n";
import type { InboxItem, InboxAnswerPayload } from "./inboxTypes";

interface Props {
  item: InboxItem;
  /** 답변 제출. `mode` 가 'send' 면 학생 발송 + 확정. */
  onSubmit: (
    payload: InboxAnswerPayload,
  ) => Promise<{ ok: boolean; deferred: boolean }>;
}

/**
 * 우측 패널 하단의 교수자 답변 작성기.
 *
 * UX:
 *   - 입력란 초기값 = `item.professorAnswer` (재편집) 또는 `item.aiDraft` (RAG 초안 그대로 채택)
 *     또는 빈값 (out-of-scope).
 *   - "초안 그대로 사용" 버튼 → aiDraft 를 입력란에 주입 + 토스트.
 *   - "답변 확정 · 학생에게 전송" → mode=send 로 onSubmit, 결과 토스트.
 *   - "초안만 저장" → mode=save (학생 미전송).
 *   - 키 (item.id) 변경 시 입력 상태 리셋 — `key` prop 으로 관리하므로 useEffect 불필요.
 */
export default function AnswerComposer({ item, onSubmit }: Props) {
  const { t } = useInboxI18n();
  const { toast } = useToast();

  const [body, setBody] = useState<string>(
    item.professorAnswer ?? item.aiDraft ?? "",
  );
  const [notify, setNotify] = useState(true);
  const [submitting, setSubmitting] = useState<"send" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // item 이 바뀌면 입력 초기화. (page 측에서 key 도 사용하지만 안전망.)
  useEffect(() => {
    setBody(item.professorAnswer ?? item.aiDraft ?? "");
    setNotify(true);
    setError(null);
    setSubmitting(null);
  }, [item.id, item.professorAnswer, item.aiDraft]);

  const handleSubmit = async (mode: "send" | "save") => {
    const trimmed = body.trim();
    if (!trimmed) {
      setError(t("composer.errorEmpty"));
      return;
    }
    setSubmitting(mode);
    setError(null);
    try {
      const res = await onSubmit({ body: trimmed, notify, mode });
      if (res.ok) {
        if (res.deferred) {
          toast(t("composer.deferredToast"), "info");
        } else if (mode === "send") {
          toast(t("composer.sentToast"), "success");
        } else {
          toast(t("composer.savedToast"), "success");
        }
      } else {
        toast(t("composer.errorBackend"), "error");
      }
    } catch {
      toast(t("composer.errorBackend"), "error");
    } finally {
      setSubmitting(null);
    }
  };

  const handleUseDraft = () => {
    if (!item.aiDraft) return;
    setBody(item.aiDraft);
    toast(t("composer.draftLoaded"), "info");
  };

  return (
    <form
      data-testid="inbox-answer-composer"
      onSubmit={(e) => {
        e.preventDefault();
        void handleSubmit("send");
      }}
      className="bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 space-y-3"
      aria-label={t("composer.label")}
    >
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-gray-900">
          {t("composer.label")}
        </h4>
        {item.aiDraft && (
          <button
            type="button"
            data-testid="inbox-composer-use-draft"
            onClick={handleUseDraft}
            className="text-xs font-medium rounded-lg px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 transition motion-reduce:transition-none"
          >
            {t("composer.useDraft")}
          </button>
        )}
      </div>

      <label htmlFor="composer-body" className="sr-only">
        {t("composer.label")}
      </label>
      <textarea
        id="composer-body"
        data-testid="inbox-composer-body"
        rows={6}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t("composer.placeholder")}
        className="block w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
      />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <label
          className="inline-flex items-center gap-2 text-xs text-gray-600 cursor-pointer"
          data-testid="inbox-composer-notify"
        >
          <input
            type="checkbox"
            checked={notify}
            onChange={(e) => setNotify(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-amber-500 focus:ring-amber-500/30 accent-amber-500"
          />
          <span>{t("composer.notifyToggle")}</span>
        </label>
        <span
          className="text-[11px] text-gray-400 tabular-nums"
          data-testid="inbox-composer-charcount"
        >
          {t("composer.charCount", { count: body.length })}
        </span>
      </div>

      {error && (
        <p
          role="alert"
          data-testid="inbox-composer-error"
          className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2"
        >
          {error}
        </p>
      )}

      <div className="flex flex-col sm:flex-row gap-2 pt-1">
        <button
          type="button"
          data-testid="inbox-composer-save"
          disabled={submitting !== null}
          onClick={() => handleSubmit("save")}
          className="flex-1 inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 text-gray-700 text-sm font-medium px-4 py-2.5 transition motion-reduce:transition-none"
        >
          {submitting === "save" ? t("composer.saving") : t("composer.saveDraft")}
        </button>
        <button
          type="submit"
          data-testid="inbox-composer-send"
          disabled={submitting !== null}
          className="flex-[2] inline-flex items-center justify-center rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2.5 shadow-sm transition motion-reduce:transition-none"
        >
          {submitting === "send"
            ? t("composer.sending")
            : t("composer.confirmAndSend")}
        </button>
      </div>
    </form>
  );
}
