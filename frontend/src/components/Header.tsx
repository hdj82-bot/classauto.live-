"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

export default function Header() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">IFL</span>
          <span className="text-sm font-semibold text-gray-900 hidden sm:inline">Interactive Flipped Learning</span>
        </Link>

        {user && (
          <>
            {/* 데스크탑 네비게이션 */}
            <nav className="hidden md:flex items-center gap-4">
              {user.role === "professor" ? (
                <>
                  <Link href="/professor/dashboard" className="text-sm text-gray-600 hover:text-gray-900">강의 관리</Link>
                  <Link href="/professor/lecture/new" className="text-sm text-gray-600 hover:text-gray-900">새 강의</Link>
                  <Link href="/professor/subscription" className="text-sm text-gray-600 hover:text-gray-900">구독</Link>
                </>
              ) : (
                <Link href="/dashboard" className="text-sm text-gray-600 hover:text-gray-900">내 강의</Link>
              )}
              <div className="flex items-center gap-2 ml-2">
                <span className="text-xs text-gray-400">{user.role === "professor" ? "교수자" : "학습자"}</span>
                <button onClick={logout} className="text-xs text-gray-500 hover:text-red-600 border border-gray-200 rounded-lg px-2 py-1">
                  로그아웃
                </button>
              </div>
            </nav>

            {/* 모바일 햄버거 */}
            <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden p-2 text-gray-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {menuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </>
        )}
      </div>

      {/* 모바일 드롭다운 메뉴 */}
      {user && menuOpen && (
        <div className="md:hidden border-t border-gray-200 bg-white px-4 py-3 space-y-2">
          {user.role === "professor" ? (
            <>
              <Link href="/professor/dashboard" onClick={() => setMenuOpen(false)} className="block text-sm text-gray-700 py-1.5">강의 관리</Link>
              <Link href="/professor/lecture/new" onClick={() => setMenuOpen(false)} className="block text-sm text-gray-700 py-1.5">새 강의</Link>
              <Link href="/professor/subscription" onClick={() => setMenuOpen(false)} className="block text-sm text-gray-700 py-1.5">구독</Link>
            </>
          ) : (
            <Link href="/dashboard" onClick={() => setMenuOpen(false)} className="block text-sm text-gray-700 py-1.5">내 강의</Link>
          )}
          <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-400">{user.role === "professor" ? "교수자" : "학습자"}</span>
            <button onClick={logout} className="text-xs text-red-500 hover:text-red-700">로그아웃</button>
          </div>
        </div>
      )}
    </header>
  );
}
