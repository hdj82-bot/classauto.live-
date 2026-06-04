"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import Step5Share from "@/components/professor/studio/Step5Share";
import type { Lecture } from "@/components/professor/studio/studioTypes";

/**
 * /professor/lecture/[id]/share — 강의 공유·게시 페이지.
 *
 * 생성 완료 후 교수자가 ① 게시(publish) 토글, ② 학생 링크(/v/[slug]) 복사,
 * ③ QR 코드 다운로드·공유, ④ 학생 화면 미리보기를 하는 화면. 게시(is_published)를
 * 켜야 학생이 /v/[slug] 로 입장할 수 있다(백엔드 is_published 검사).
 */
export default function LectureSharePage() {
  const { id } = useParams<{ id: string }>();
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        // 단일 강의 GET 엔드포인트가 없어 본인 강의 목록에서 id 로 찾는다(studio 와 동일).
        const { data } = await api.get<Lecture[]>("/api/me/lectures");
        if (cancelled) return;
        const found = data.find((l) => l.id === id) ?? null;
        if (found) setLecture(found);
        else setNotFound(true);
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const onPublishToggle = useCallback(
    async (publish: boolean) => {
      if (!id) return;
      setPublishing(true);
      try {
        const { data } = await api.patch<Lecture>(`/api/lectures/${id}`, {
          is_published: publish,
        });
        setLecture(data);
      } finally {
        setPublishing(false);
      }
    },
    [id],
  );

  if (loading) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-16 text-center text-sm text-gray-500">
        <p role="status">강의 정보를 불러오는 중…</p>
      </main>
    );
  }

  if (notFound || !lecture) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
        <p className="text-base font-semibold text-gray-900">강의를 찾을 수 없습니다.</p>
        <Link
          href="/professor/dashboard"
          className="inline-block text-sm bg-gray-900 text-white rounded-xl px-4 py-2.5"
        >
          대시보드로 돌아가기
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-4">
        <Link
          href={`/professor/lecture/${id}`}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← 스크립트 편집으로
        </Link>
      </div>
      <Step5Share
        lecture={lecture}
        durationSeconds={0}
        origin={origin}
        onPublishToggle={onPublishToggle}
        publishing={publishing}
        classCode={null}
      />
    </main>
  );
}
