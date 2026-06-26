"use client";

import { useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { boardApi } from "@/lib/api";

/**
 * 자유게시판 새 글 작성 폼. 로그인 사용자만 노출되며(상위에서 게이팅), 등록 성공 시
 * 새 글 id 를 onCreated 로 넘긴다. 백엔드가 작성자(로그인)를 강제하므로 익명 작성은
 * 불가하다.
 */
export default function BoardComposer({
  onCreated,
  onCancel,
}: {
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!title.trim() || !body.trim()) {
      setError(t("board.newPost.validation"));
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const { data } = await boardApi.create({
        title: title.trim(),
        body: body.trim(),
      });
      onCreated(data.id);
    } catch {
      setError(t("board.newPost.error"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-[rgba(10,10,10,0.1)] bg-white/70 p-5 flex flex-col gap-4"
    >
      <h2 className="text-base font-bold text-[#0A0A0A]">
        {t("board.newPost.title")}
      </h2>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="board-title" className="text-xs font-semibold text-[rgba(10,10,10,0.6)]">
          {t("board.newPost.titleLabel")}
        </label>
        <input
          id="board-title"
          type="text"
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("board.newPost.titlePlaceholder")}
          className="w-full rounded-lg border border-[rgba(10,10,10,0.16)] bg-white px-3 py-2 text-sm outline-none focus:border-[#B88308] transition motion-reduce:transition-none"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="board-body" className="text-xs font-semibold text-[rgba(10,10,10,0.6)]">
          {t("board.newPost.bodyLabel")}
        </label>
        <textarea
          id="board-body"
          value={body}
          rows={8}
          maxLength={10000}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("board.newPost.bodyPlaceholder")}
          className="w-full resize-y rounded-lg border border-[rgba(10,10,10,0.16)] bg-white px-3 py-2 text-sm leading-relaxed outline-none focus:border-[#B88308] transition motion-reduce:transition-none"
        />
      </div>
      {error && (
        <p className="text-xs text-[#d33]" role="alert">
          {error}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="text-sm font-semibold rounded-lg px-4 py-2 border border-[rgba(10,10,10,0.16)] text-[rgba(10,10,10,0.66)] hover:text-[#0A0A0A] transition motion-reduce:transition-none"
        >
          {t("board.newPost.cancel")}
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="text-sm font-semibold rounded-lg px-5 py-2 disabled:opacity-50 transition motion-reduce:transition-none"
          style={{ backgroundColor: "#FFB627", color: "#1A1A1A" }}
        >
          {submitting ? t("board.newPost.submitting") : t("board.newPost.submit")}
        </button>
      </div>
    </form>
  );
}
