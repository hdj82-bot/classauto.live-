"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import LightMarketingShell from "@/components/marketing/LightMarketingShell";
import { useI18n } from "@/contexts/I18nContext";
import { useOptionalAuth } from "@/contexts/AuthContext";
import { boardApi, type BoardPostSummary } from "@/lib/api";
import { formatBoardDate } from "@/components/board/formatBoardDate";
import BoardComposer from "@/components/board/BoardComposer";

/**
 * /board — 자유게시판 목록 (베타 테스터 커뮤니티).
 *
 * 권한(결정 2026-06-27): 열람은 공개(비로그인 포함), 작성은 로그인 필요. 대문
 * 상단 nav 의 "자유게시판" 진입점. 우하단 글로벌 피드백 버튼을 대체하며, 흩어진
 * 비공개 피드백 대신 테스터끼리 공개로 의견을 나눈다.
 */
export default function BoardListPage() {
  const { t, locale } = useI18n();
  const auth = useOptionalAuth();
  const isLoggedIn = !!auth?.user;

  const [posts, setPosts] = useState<BoardPostSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);

  const LIMIT = 20;

  const load = useCallback(async (pageNum: number) => {
    setLoading(true);
    setError(false);
    try {
      const { data } = await boardApi.list({ page: pageNum, limit: LIMIT });
      setTotal(data.total);
      setPage(data.page);
      setPosts((prev) =>
        pageNum === 1 ? data.posts : [...prev, ...data.posts],
      );
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(1);
  }, [load]);

  const hasMore = posts.length < total;

  return (
    <LightMarketingShell>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        {/* 헤더 */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1
              className="text-2xl sm:text-3xl font-bold text-[#0A0A0A]"
              style={{
                fontFamily:
                  "var(--font-display, 'Paperlogy'), 'Pretendard Variable', sans-serif",
              }}
            >
              {t("board.title")}
            </h1>
            <p className="mt-2 text-sm text-[rgba(10,10,10,0.6)] leading-relaxed max-w-xl">
              {t("board.subtitle")}
            </p>
          </div>
          {isLoggedIn ? (
            <button
              type="button"
              onClick={() => setComposerOpen(true)}
              className="shrink-0 inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg px-4 py-2 transition motion-reduce:transition-none"
              style={{ backgroundColor: "#FFB627", color: "#1A1A1A" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#FFC74D";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#FFB627";
              }}
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              {t("board.writeCta")}
            </button>
          ) : (
            <Link
              href="/auth/login"
              className="shrink-0 inline-flex items-center gap-1.5 text-sm font-semibold rounded-lg px-4 py-2 border border-[rgba(10,10,10,0.16)] text-[rgba(10,10,10,0.72)] hover:border-[#B88308] hover:text-[#0A0A0A] transition motion-reduce:transition-none"
            >
              {t("board.loginToWrite")}
            </Link>
          )}
        </div>

        {composerOpen && (
          <div className="mt-6">
            <BoardComposer
              onCancel={() => setComposerOpen(false)}
              onCreated={(id) => {
                // 작성 직후 상세로 이동해 방금 쓴 글을 바로 보여 준다.
                window.location.href = `/board/${id}`;
              }}
            />
          </div>
        )}

        {/* 목록 */}
        <div className="mt-8">
          {error ? (
            <div className="py-16 text-center text-sm text-[rgba(10,10,10,0.55)]">
              {t("board.loadError")}
            </div>
          ) : posts.length === 0 && !loading ? (
            <div className="py-16 text-center text-sm text-[rgba(10,10,10,0.5)]">
              {t("board.empty")}
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-[rgba(10,10,10,0.08)] border-y border-[rgba(10,10,10,0.08)]">
              {posts.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/board/${p.id}`}
                    className="flex items-center gap-3 py-4 px-1 group hover:bg-black/[0.02] transition motion-reduce:transition-none"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {p.pinned && (
                          <span
                            className="shrink-0 text-[10px] font-bold rounded px-1.5 py-0.5"
                            style={{ background: "rgba(184,131,8,0.12)", color: "#B88308" }}
                          >
                            {t("board.pinnedBadge")}
                          </span>
                        )}
                        <span className="truncate text-[15px] font-semibold text-[#0A0A0A] group-hover:text-[#B88308] transition motion-reduce:transition-none">
                          {p.title}
                        </span>
                        {p.comment_count > 0 && (
                          <span className="shrink-0 text-xs font-semibold text-[#B88308] tabular-nums">
                            [{p.comment_count}]
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-[rgba(10,10,10,0.5)]">
                        <span className="truncate">{p.author_name}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums shrink-0">
                          {formatBoardDate(p.created_at, locale)}
                        </span>
                      </div>
                    </div>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[rgba(10,10,10,0.3)]" aria-hidden="true">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {hasMore && !error && (
            <div className="mt-6 text-center">
              <button
                type="button"
                disabled={loading}
                onClick={() => void load(page + 1)}
                className="inline-flex items-center text-sm font-semibold rounded-lg px-5 py-2 border border-[rgba(10,10,10,0.16)] text-[rgba(10,10,10,0.72)] hover:border-[#B88308] hover:text-[#0A0A0A] disabled:opacity-50 transition motion-reduce:transition-none"
              >
                {loading ? t("common.loading") : t("board.more")}
              </button>
            </div>
          )}
        </div>
      </div>
    </LightMarketingShell>
  );
}
