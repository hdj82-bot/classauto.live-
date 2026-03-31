"use client";

import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";

export default function Header() {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">IFL</span>
          <span className="text-sm font-semibold text-gray-900 hidden sm:inline">Interactive Flipped Learning</span>
        </Link>

        {user && (
          <nav className="flex items-center gap-4">
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
        )}
      </div>
    </header>
  );
}
