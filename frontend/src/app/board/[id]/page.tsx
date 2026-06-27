"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import LightMarketingShell from "@/components/marketing/LightMarketingShell";
import { useI18n } from "@/contexts/I18nContext";
import { useOptionalAuth } from "@/contexts/AuthContext";
import { boardApi, type BoardPostDetail } from "@/lib/api";
import { formatBoardDate } from "@/components/board/formatBoardDate";

/**
 * /board/[id] — 자유게시판 글 상세 + 댓글.
 *
 * 열람은 공개, 댓글 작성·삭제는 로그인 필요(백엔드 강제). 삭제 가능 여부(can_delete)
 * 는 서버가 열람자 기준으로 내려준다(작성자 본인 또는 운영자).
 */
export default function BoardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t, locale } = useI18n();
  const auth = useOptionalAuth();
  const isLoggedIn = !!auth?.user;

  const [post, setPost] = useState<BoardPostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [commentBody, setCommentBody] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentError, setCommentError] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(false);
    try {
      const { data } = await boardApi.get(id);
      setPost(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (commentSubmitting || !commentBody.trim() || !id) return;
    setCommentSubmitting(true);
    setCommentError("");
    try {
      await boardApi.comment(id, { body: commentBody.trim() });
      setCommentBody("");
      await load(); // 새 댓글 + 갱신된 can_delete 반영.
    } catch {
      setCommentError(t("board.newPost.error"));
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleDeletePost = async () => {
    if (!id || !window.confirm(t("board.deleteConfirm"))) return;
    try {
      await boardApi.remove(id);
      router.push("/board");
    } catch {
      window.alert(t("board.deleteError"));
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!window.confirm(t("board.deleteConfirm"))) return;
    try {
      await boardApi.removeComment(commentId);
      await load();
    } catch {
      window.alert(t("board.deleteError"));
    }
  };

  return (
    <LightMarketingShell>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <Link
          href="/board"
          className="inline-flex items-center gap-1.5 text-sm text-[rgba(10,10,10,0.55)] hover:text-[#0A0A0A] transition motion-reduce:transition-none"
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          {t("board.backToList")}
        </Link>

        {loading ? (
          <div className="py-20 text-center text-sm text-[rgba(10,10,10,0.5)]">
            {t("common.loading")}
          </div>
        ) : error || !post ? (
          <div className="py-20 text-center text-sm text-[rgba(10,10,10,0.55)]">
            {t("board.loadError")}
          </div>
        ) : (
          <>
            {/* 글 본문 */}
            <article className="mt-6">
              <div className="flex items-start gap-2">
                {post.pinned && (
                  <span
                    className="mt-1 shrink-0 text-[10px] font-bold rounded px-1.5 py-0.5"
                    style={{ background: "rgba(184,131,8,0.12)", color: "#B88308" }}
                  >
                    {t("board.pinnedBadge")}
                  </span>
                )}
                <h1
                  className="text-xl sm:text-2xl font-bold text-[#0A0A0A] break-words"
                  style={{
                    fontFamily:
                      "var(--font-display, 'Paperlogy'), 'Pretendard Variable', sans-serif",
                  }}
                >
                  {post.title}
                </h1>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-[rgba(10,10,10,0.5)]">
                <span className="font-medium text-[rgba(10,10,10,0.65)]">
                  {post.author_name}
                </span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">
                  {formatBoardDate(post.created_at, locale)}
                </span>
                {post.can_delete && (
                  <>
                    <span aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={handleDeletePost}
                      className="text-[rgba(10,10,10,0.5)] hover:text-[#d33] transition motion-reduce:transition-none"
                    >
                      {t("board.delete")}
                    </button>
                  </>
                )}
              </div>
              <div className="mt-6 text-[15px] leading-7 text-[#1a1a1a] whitespace-pre-wrap break-words">
                {post.body}
              </div>
            </article>

            {/* 댓글 */}
            <section className="mt-12">
              <h2 className="text-sm font-bold text-[#0A0A0A]">
                {t("board.commentCount", { count: post.comments.length })}
              </h2>

              <ul className="mt-4 flex flex-col divide-y divide-[rgba(10,10,10,0.08)] border-t border-[rgba(10,10,10,0.08)]">
                {post.comments.length === 0 ? (
                  <li className="py-6 text-sm text-[rgba(10,10,10,0.45)]">
                    {t("board.noComments")}
                  </li>
                ) : (
                  post.comments.map((c) => (
                    <li key={c.id} className="py-4">
                      <div className="flex items-center gap-2 text-xs text-[rgba(10,10,10,0.5)]">
                        <span className="font-medium text-[rgba(10,10,10,0.65)]">
                          {c.author_name}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">
                          {formatBoardDate(c.created_at, locale)}
                        </span>
                        {c.can_delete && (
                          <>
                            <span aria-hidden="true">·</span>
                            <button
                              type="button"
                              onClick={() => handleDeleteComment(c.id)}
                              className="text-[rgba(10,10,10,0.5)] hover:text-[#d33] transition motion-reduce:transition-none"
                            >
                              {t("board.delete")}
                            </button>
                          </>
                        )}
                      </div>
                      <p className="mt-1.5 text-sm leading-6 text-[#1a1a1a] whitespace-pre-wrap break-words">
                        {c.body}
                      </p>
                    </li>
                  ))
                )}
              </ul>

              {/* 댓글 작성 — 로그인 사용자만 */}
              {isLoggedIn ? (
                <form onSubmit={handleComment} className="mt-6 flex flex-col gap-2">
                  <textarea
                    value={commentBody}
                    rows={3}
                    maxLength={4000}
                    onChange={(e) => setCommentBody(e.target.value)}
                    placeholder={t("board.commentPlaceholder")}
                    className="w-full resize-y rounded-lg border border-[rgba(10,10,10,0.16)] bg-white px-3 py-2 text-sm leading-relaxed outline-none focus:border-[#B88308] transition motion-reduce:transition-none"
                  />
                  {commentError && (
                    <p className="text-xs text-[#d33]" role="alert">
                      {commentError}
                    </p>
                  )}
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={commentSubmitting || !commentBody.trim()}
                      className="text-sm font-semibold rounded-lg px-4 py-2 disabled:opacity-50 transition motion-reduce:transition-none"
                      style={{ backgroundColor: "#FFB627", color: "#1A1A1A" }}
                    >
                      {commentSubmitting
                        ? t("board.commentSubmitting")
                        : t("board.commentSubmit")}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="mt-6 rounded-lg border border-[rgba(10,10,10,0.1)] bg-black/[0.02] px-4 py-3 text-sm text-[rgba(10,10,10,0.55)]">
                  <Link href="/auth/login" className="font-semibold text-[#B88308] hover:underline">
                    {t("board.loginToComment")}
                  </Link>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </LightMarketingShell>
  );
}
