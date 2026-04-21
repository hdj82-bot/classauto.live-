"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { useI18n } from "@/contexts/I18nContext";

export default function NewLecturePage() {
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useI18n();
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
    else setError(t("professor.pptError"));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    setError("");

    try {
      let cId = courseId;
      if (!cId) {
        const { data: course } = await api.post("/api/courses", { title: `${title} 강좌` });
        cId = course.id;
        setCourseId(cId);
      }

      const { data: lecture } = await api.post("/api/lectures", {
        course_id: cId, title, description: description || undefined,
      });

      if (file) {
        const formData = new FormData();
        formData.append("file", file);
        await api.post(`/api/v1/render/upload?lecture_id=${lecture.id}`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }

      toast(t("professor.createSuccess"), "success");
      router.push(`/professor/lecture/${lecture.id}`);
    } catch {
      setError(t("professor.createError"));
      toast(t("professor.createError"), "error");
    }
    setSubmitting(false);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t("professor.newTitle")}</h1>

      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-2xl p-8 space-y-6" aria-label={t("professor.newTitle")}>
        {error && <div role="alert" className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>}

        <div>
          <label htmlFor="lecture-title" className="block text-sm font-medium text-gray-700 mb-1.5">{t("professor.lectureTitle")}</label>
          <input id="lecture-title" value={title} onChange={(e) => setTitle(e.target.value)} required
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            placeholder={t("professor.lectureTitlePlaceholder")} />
        </div>

        <div>
          <label htmlFor="lecture-desc" className="block text-sm font-medium text-gray-700 mb-1.5">{t("professor.description")}</label>
          <textarea id="lecture-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 resize-none"
            placeholder={t("professor.descriptionPlaceholder")} />
        </div>

        <div>
          <label htmlFor="ppt-upload" className="block text-sm font-medium text-gray-700 mb-1.5">{t("professor.pptFile")}</label>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
            aria-label={t("professor.pptDragDrop")}
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
                <p className="text-sm text-gray-500">{t("professor.pptDragDrop")}</p>
                <p className="text-xs text-gray-400 mt-1">{t("professor.pptFormat")}</p>
              </div>
            )}
            <input ref={fileInputRef} id="ppt-upload" type="file" accept=".pptx,.ppt" className="hidden"
              onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])} />
          </div>
        </div>

        <button type="submit" disabled={submitting || !title.trim()}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl py-3 text-sm font-semibold transition">
          {submitting ? t("professor.creating") : t("professor.createLectureBtn")}
        </button>
      </form>
    </div>
  );
}
