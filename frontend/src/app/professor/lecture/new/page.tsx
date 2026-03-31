"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function NewLecturePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [courseId, setCourseId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith(".pptx") || f.name.endsWith(".ppt"))) setFile(f);
    else setError(".pptx 파일만 업로드 가능합니다.");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    setError("");

    try {
      // 1. 강좌가 없으면 생성
      let cId = courseId;
      if (!cId) {
        const { data: course } = await api.post("/api/courses", { title: `${title} 강좌` });
        cId = course.id;
        setCourseId(cId);
      }

      // 2. 강의 생성
      const { data: lecture } = await api.post("/api/lectures", {
        course_id: cId, title, description: description || undefined,
      });

      // 3. PPT 업로드 (파이프라인 시작)
      if (file) {
        const formData = new FormData();
        formData.append("file", file);
        await api.post(`/api/v1/render/upload?lecture_id=${lecture.id}`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }

      router.push(`/professor/lecture/${lecture.id}`);
    } catch {
      setError("강의 생성에 실패했습니다. 다시 시도해주세요.");
    }
    setSubmitting(false);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">새 강의 만들기</h1>

      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-2xl p-8 space-y-6">
        {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">강의 제목</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            placeholder="예) 파이썬 프로그래밍 기초" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">설명 (선택)</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 resize-none"
            placeholder="강의에 대한 간단한 설명" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">PPT 파일 (선택)</label>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
              dragOver ? "border-indigo-500 bg-indigo-50" : "border-gray-300 hover:border-gray-400"
            }`}
          >
            {file ? (
              <div>
                <p className="text-sm font-medium text-gray-900">{file.name}</p>
                <p className="text-xs text-gray-400 mt-1">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-500">PPT 파일을 드래그하거나 클릭하여 업로드</p>
                <p className="text-xs text-gray-400 mt-1">.pptx 형식만 지원</p>
              </div>
            )}
            <input ref={fileInputRef} type="file" accept=".pptx,.ppt" className="hidden"
              onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])} />
          </div>
        </div>

        <button type="submit" disabled={submitting || !title.trim()}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl py-3 text-sm font-semibold transition">
          {submitting ? "생성 중..." : "강의 생성"}
        </button>
      </form>
    </div>
  );
}
