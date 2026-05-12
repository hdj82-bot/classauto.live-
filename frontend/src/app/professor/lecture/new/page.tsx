"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { useI18n } from "@/contexts/I18nContext";
import {
  PageContainer,
  PageHeader,
  PrimaryButton,
  Card,
  tabularStyle,
} from "@/components/professor/shell";

/**
 * /professor/lecture/new — 단순 강의 생성 폼 (v1).
 *
 * `/professor/studio` 마법사가 신규 작성 흐름의 entry 지만, 본 페이지는
 * 단순한 직접 입력 폼으로 병행 유지된다 (Header.tsx 의 nav.newLecture
 * 진입로).
 *
 * v2 재디자인: PageContainer(narrow) + PageHeader + Card 안의 폼. 인디고 →
 * 골드 톤. dropzone 은 prototype 1.5px dashed + gold-bright hover.
 */
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
        course_id: cId,
        title,
        description: description || undefined,
      });

      if (file) {
        const formData = new FormData();
        formData.append("file", file);
        await api.post(
          `/api/v1/render/upload?lecture_id=${lecture.id}`,
          formData,
          { headers: { "Content-Type": "multipart/form-data" } },
        );
      }

      toast(t("professor.createSuccess"), "success");
      router.push(`/professor/lecture/${lecture.id}`);
    } catch {
      setError(t("professor.createError"));
      toast(t("professor.createError"), "error");
    }
    setSubmitting(false);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 14px",
    border: "1px solid var(--line-strong)",
    borderRadius: 10,
    fontSize: 13.5,
    background: "var(--bg-card)",
    color: "var(--text)",
    outline: "none",
    transition: "border-color 140ms var(--ease-out)",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
    marginBottom: 6,
  };

  return (
    <PageContainer width="narrow">
      <PageHeader
        eyebrow="새 강의"
        title={t("professor.newTitle")}
        subtitle="제목·설명·PPT 만 입력하면 즉시 강의를 만들고 마법사로 이동합니다."
      />

      <Card padding={28} radius={16}>
        <form
          onSubmit={handleSubmit}
          aria-label={t("professor.newTitle")}
          className="space-y-6"
        >
          {error && (
            <div
              role="alert"
              style={{
                background: "rgba(239, 68, 68, 0.06)",
                border: "1px solid rgba(239, 68, 68, 0.24)",
                borderRadius: 10,
                padding: "10px 14px",
                fontSize: 13,
                color: "#B91C1C",
              }}
            >
              {error}
            </div>
          )}

          <div>
            <label htmlFor="lecture-title" style={labelStyle}>
              {t("professor.lectureTitle")}
            </label>
            <input
              id="lecture-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder={t("professor.lectureTitlePlaceholder")}
              style={inputStyle}
            />
          </div>

          <div>
            <label htmlFor="lecture-desc" style={labelStyle}>
              {t("professor.description")}
            </label>
            <textarea
              id="lecture-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder={t("professor.descriptionPlaceholder")}
              style={{ ...inputStyle, resize: "none" }}
            />
          </div>

          <div>
            <label htmlFor="ppt-upload" style={labelStyle}>
              {t("professor.pptFile")}
            </label>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              aria-label={t("professor.pptDragDrop")}
              style={{
                border: `1.5px dashed ${dragOver ? "var(--gold-bright)" : "var(--line-strong)"}`,
                borderRadius: 14,
                background: dragOver ? "rgba(255, 182, 39, 0.04)" : "var(--bg)",
                padding: "32px 24px",
                textAlign: "center",
                cursor: "pointer",
                outline: "none",
                transition: "border-color 180ms var(--ease-out), background 180ms var(--ease-out)",
              }}
            >
              {file ? (
                <div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 14,
                      fontWeight: 600,
                      color: "var(--text)",
                    }}
                  >
                    {file.name}
                  </p>
                  <p
                    style={{
                      ...tabularStyle,
                      margin: "4px 0 0",
                      fontSize: 12,
                      color: "var(--text-subtle)",
                    }}
                  >
                    {(file.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                </div>
              ) : (
                <div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 14.5,
                      fontWeight: 600,
                      color: "var(--text)",
                    }}
                  >
                    {t("professor.pptDragDrop")}
                  </p>
                  <p
                    style={{
                      margin: "6px 0 0",
                      fontSize: 12,
                      color: "var(--text-muted)",
                    }}
                  >
                    {t("professor.pptFormat")}
                  </p>
                </div>
              )}
              <input
                ref={fileInputRef}
                id="ppt-upload"
                type="file"
                accept=".pptx,.ppt"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])}
              />
            </div>
          </div>

          <PrimaryButton
            type="submit"
            variant="primary"
            size="lg"
            disabled={submitting || !title.trim()}
            style={{ width: "100%", justifyContent: "center" }}
          >
            {submitting ? t("professor.creating") : t("professor.createLectureBtn")}
          </PrimaryButton>
        </form>
      </Card>
    </PageContainer>
  );
}
