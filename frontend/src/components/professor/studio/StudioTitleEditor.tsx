"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Studio Topbar 중앙의 강의 제목 — 보기/편집 토글.
 *
 * - 보기: 제목 텍스트(클릭하면 편집) + 연필 아이콘, 그 오른쪽에 음성·자막 메타 칩.
 * - 편집: 인라인 input. Enter/blur 저장, Esc 취소. 빈 값은 저장하지 않고 되돌림.
 *
 * 음성·자막 표기는 제목에 섞지 않고 별도 메타(`meta`)로만 표시한다(사용자 결정
 * 2026-06-24). 저장 값은 순수 제목뿐 — onSave 가 PATCH /api/lectures/{id} 로
 * title 만 갱신한다.
 */
export default function StudioTitleEditor({
  title,
  meta,
  onSave,
}: {
  title: string;
  /** 음성·자막 등 부가 표기(읽기 전용 칩). 없으면 칩 미표시. */
  meta?: string | null;
  onSave: (next: string) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 편집 중이 아닐 때만 외부 제목 변경을 로컬 값에 반영(저장 직후·로드 후 동기화).
  useEffect(() => {
    if (!editing) setValue(title);
  }, [title, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = async () => {
    const next = value.trim();
    if (!next || next === title) {
      setValue(title);
      setEditing(false);
      return;
    }
    try {
      setSaving(true);
      await onSave(next);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  const cancel = () => {
    setValue(title);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        autoFocus
        disabled={saving}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        aria-label="강의 제목"
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "var(--text)",
          background: "var(--bg)",
          border: "1px solid var(--gold)",
          borderRadius: 8,
          padding: "5px 10px",
          width: "min(56vw, 460px)",
          outline: "none",
        }}
      />
    );
  }

  return (
    <div className="flex items-center gap-2 min-w-0">
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="클릭해서 강의 제목 수정"
        className="inline-flex items-center gap-1.5 rounded-lg motion-safe:transition min-w-0"
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "var(--text)",
          background: "transparent",
          border: "none",
          padding: "5px 8px",
          cursor: "pointer",
          maxWidth: "min(56vw, 460px)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--bg-hover)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
        }}
      >
        <span className="truncate">{title || "제목 없음"}</span>
        <svg
          viewBox="0 0 24 24"
          width="13"
          height="13"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ flexShrink: 0, color: "var(--text-subtle)" }}
        >
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
        </svg>
      </button>
      {meta && (
        <span
          className="inline-flex items-center rounded-full flex-shrink-0"
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: "var(--text-subtle)",
            background: "var(--bg-subtle)",
            padding: "4px 10px",
            whiteSpace: "nowrap",
          }}
        >
          {meta}
        </span>
      )}
    </div>
  );
}
