"use client";

import { useRef, useState } from "react";
import { useStudioI18n } from "./useStudioI18n";
import { validateStep1, validatePptFile, MAX_PPT_BYTES } from "./guardrails";
import GuardrailBanner from "./GuardrailBanner";
import type { Course } from "./studioTypes";
import { tabularStyle, PrimaryButton, Card } from "@/components/professor/shell";

interface Step1Props {
  courses: readonly Course[];
  submitting: boolean;
  onSubmit: (input: {
    courseId: string | null;
    newCourseTitle: string | null;
    title: string;
    description: string;
    file: File;
  }) => Promise<void>;
}

/**
 * Step 1 — 강좌 선택/생성 + 강의 제목 + .pptx 업로드.
 *
 * v2 디자인 — docs/prototypes/05-studio-flow.extracted.html SCREEN 1 의
 * upload-modal 패턴 (dropzone 골드 그라데이션 아이콘, gold-soft hover, 골드
 * pick-link) 을 폼 안에 통합.
 *
 * 백엔드 호출 순서:
 *  1. (새 강좌면) POST /api/courses
 *  2. POST /api/lectures
 *  3. POST /api/v1/render/upload?lecture_id={id}  (multipart)
 *
 * 본 컴포넌트는 폼 상태와 가드레일 검증만 책임진다 — 실제 호출은 페이지가
 * 처리하며 (`onSubmit`), 페이지가 lectureId 라우팅을 담당한다.
 */
export default function Step1PptUpload({
  courses,
  submitting,
  onSubmit,
}: Step1Props) {
  const { t } = useStudioI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [courseMode, setCourseMode] = useState<"existing" | "new">(
    courses.length > 0 ? "existing" : "new",
  );
  const [selectedCourseId, setSelectedCourseId] = useState(
    courses[0]?.id ?? "",
  );
  const [newCourseTitle, setNewCourseTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [oversizeMB, setOversizeMB] = useState<number | null>(null);

  const setFileWithValidation = (f: File | null) => {
    setOversizeMB(null);
    setErrorKey(null);
    if (!f) {
      setFile(null);
      return;
    }
    const result = validatePptFile(f);
    if (!result.ok) {
      if (result.reason === "size") {
        setOversizeMB(result.sizeMB ?? Math.round(f.size / (1024 * 1024)));
        setErrorKey("step1.errors.pptSize");
      } else {
        setErrorKey("step1.errors.pptType");
      }
      return;
    }
    setFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0] ?? null;
    setFileWithValidation(f);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const validationError = validateStep1({
      title,
      courseMode,
      selectedCourseId,
      newCourseTitle,
      file,
    });
    if (validationError) {
      const map: Record<string, string> = {
        title: "step1.errors.title",
        course: "step1.errors.course",
        ppt: "step1.errors.ppt",
        pptType: "step1.errors.pptType",
        pptSize: "step1.errors.pptSize",
      };
      setErrorKey(map[validationError] ?? "step1.errors.uploadFailed");
      return;
    }
    setErrorKey(null);

    try {
      await onSubmit({
        courseId: courseMode === "existing" ? selectedCourseId : null,
        newCourseTitle: courseMode === "new" ? newCourseTitle.trim() : null,
        title: title.trim(),
        description: description.trim(),
        file: file as File,
      });
    } catch {
      setErrorKey("step1.errors.uploadFailed");
    }
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
    <Card padding={28} radius={16}>
      <form onSubmit={handleSubmit} aria-label={t("step1.title")} className="space-y-6">
        <header>
          <h2
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 700,
              color: "var(--text)",
              letterSpacing: "-0.01em",
            }}
          >
            {t("step1.title")}
          </h2>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 13,
              color: "var(--text-muted)",
            }}
          >
            {t("step1.subtitle")}
          </p>
        </header>

        {/* 강좌 선택 */}
        <fieldset style={{ display: "flex", flexDirection: "column", gap: 12, border: "none", padding: 0, margin: 0 }}>
          <legend style={labelStyle}>{t("step1.courseLabel")}</legend>
          <div style={{ display: "flex", gap: 8 }}>
            <CourseModePill
              label={t("step1.courseExisting")}
              active={courseMode === "existing"}
              disabled={courses.length === 0}
              onClick={() => setCourseMode("existing")}
            />
            <CourseModePill
              label={t("step1.courseNew")}
              active={courseMode === "new"}
              onClick={() => setCourseMode("new")}
            />
          </div>
          {courseMode === "existing" ? (
            <select
              value={selectedCourseId}
              onChange={(e) => setSelectedCourseId(e.target.value)}
              style={inputStyle}
              aria-label={t("step1.courseExisting")}
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={newCourseTitle}
              onChange={(e) => setNewCourseTitle(e.target.value)}
              placeholder={t("step1.courseNewTitlePlaceholder")}
              aria-label={t("step1.courseNewTitleLabel")}
              style={inputStyle}
            />
          )}
          <p style={{ margin: 0, fontSize: 11.5, color: "var(--text-subtle)" }}>
            {t("step1.courseHelp")}
          </p>
        </fieldset>

        {/* 강의 제목 */}
        <div>
          <label htmlFor="studio-lecture-title" style={labelStyle}>
            {t("step1.lectureTitleLabel")}
          </label>
          <input
            id="studio-lecture-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder={t("step1.lectureTitlePlaceholder")}
            style={inputStyle}
          />
        </div>

        {/* 설명 */}
        <div>
          <label htmlFor="studio-description" style={labelStyle}>
            {t("step1.descriptionLabel")}
          </label>
          <textarea
            id="studio-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder={t("step1.descriptionPlaceholder")}
            style={{ ...inputStyle, resize: "none" }}
          />
        </div>

        {/* PPT 업로드 — prototype dropzone 패턴 */}
        <div>
          <label htmlFor="studio-ppt-upload" style={labelStyle}>
            {t("step1.pptLabel")}
          </label>
          <Dropzone
            file={file}
            dragOver={dragOver}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            onClear={() => {
              setFile(null);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
            t={t}
          />
          <input
            ref={fileInputRef}
            id="studio-ppt-upload"
            type="file"
            accept=".pptx"
            className="hidden"
            onChange={(e) => setFileWithValidation(e.target.files?.[0] ?? null)}
          />
        </div>

        <p style={{ margin: 0, fontSize: 11.5, color: "var(--text-subtle)" }}>
          {t("step1.uploadHint")}
        </p>

        {/* 에러 배너 */}
        {errorKey === "step1.errors.pptSize" && oversizeMB != null && (
          <GuardrailBanner variant="uploadOversize" fileSizeMB={oversizeMB} />
        )}
        {errorKey === "step1.errors.pptType" && (
          <GuardrailBanner variant="uploadInvalidType" />
        )}
        {errorKey &&
          errorKey !== "step1.errors.pptSize" &&
          errorKey !== "step1.errors.pptType" && (
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
              {t(errorKey)}
            </div>
          )}

        <div className="flex items-center justify-between gap-3">
          <PrimaryButton
            type="submit"
            variant="primary"
            size="lg"
            disabled={submitting || !file}
            trailingIcon={
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14" />
                <path d="M12 5l7 7-7 7" />
              </svg>
            }
          >
            {submitting ? t("step1.submitting") : t("step1.submit")}
          </PrimaryButton>
          <span
            style={{
              ...tabularStyle,
              fontSize: 11,
              color: "var(--text-faint)",
            }}
          >
            max {MAX_PPT_BYTES / (1024 * 1024)}MB
          </span>
        </div>
      </form>
    </Card>
  );
}

/* ───────────────────────── Internal subcomponents ───────────────────────── */

function CourseModePill({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        flex: 1,
        padding: "10px 12px",
        borderRadius: 10,
        fontSize: 12.5,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        background: active ? "var(--gold-soft)" : "var(--bg-card)",
        color: disabled
          ? "var(--text-faint)"
          : active
            ? "var(--gold)"
            : "var(--text-muted)",
        border: `1px solid ${active ? "var(--gold-bright)" : "var(--line)"}`,
        transition: "all 140ms var(--ease-out)",
      }}
    >
      {label}
    </button>
  );
}

function Dropzone({
  file,
  dragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onClick,
  onClear,
  t,
}: {
  file: File | null;
  dragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onClick: () => void;
  onClear: () => void;
  t: (key: string) => string;
}) {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={t("step1.pptDragDrop")}
      style={{
        border: `1.5px dashed ${dragOver ? "var(--gold-bright)" : "var(--line-strong)"}`,
        borderRadius: 14,
        background: dragOver ? "rgba(255, 182, 39, 0.04)" : "var(--bg)",
        padding: "32px 24px",
        textAlign: "center",
        cursor: "pointer",
        transition: "border-color 180ms var(--ease-out), background 180ms var(--ease-out)",
      }}
    >
      {file ? (
        <div>
          <div
            className="inline-grid place-items-center"
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "linear-gradient(135deg, rgba(255,182,39,0.18), rgba(232,158,14,0.10))",
              margin: "0 auto 14px",
            }}
            aria-hidden="true"
          >
            <svg
              viewBox="0 0 24 24"
              width="26"
              height="26"
              fill="none"
              stroke="url(#nav-grad-electric)"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
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
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            style={{
              marginTop: 10,
              fontSize: 11.5,
              color: "var(--text-muted)",
              background: "transparent",
              border: "none",
              textDecoration: "underline",
              textUnderlineOffset: 2,
              cursor: "pointer",
            }}
          >
            {t("step1.pptRemove")}
          </button>
        </div>
      ) : (
        <div>
          <div
            className="inline-grid place-items-center"
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "linear-gradient(135deg, rgba(255,182,39,0.18), rgba(232,158,14,0.10))",
              margin: "0 auto 14px",
            }}
            aria-hidden="true"
          >
            <svg
              viewBox="0 0 24 24"
              width="26"
              height="26"
              fill="none"
              stroke="url(#nav-grad-electric)"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 16V4M12 4l-4 4M12 4l4 4" />
              <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            </svg>
          </div>
          <p
            style={{
              margin: 0,
              fontSize: 14.5,
              fontWeight: 600,
              color: "var(--text)",
            }}
          >
            {t("step1.pptDragDrop")}
          </p>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 12,
              color: "var(--text-muted)",
            }}
          >
            {t("step1.pptFormat")}
          </p>
          <div style={{ marginTop: 12, display: "flex", justifyContent: "center", gap: 8 }}>
            {[".pptx", ".pdf", "최대 50MB"].map((c) => (
              <span
                key={c}
                style={{
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: "var(--bg-card)",
                  border: "1px solid var(--line)",
                  fontSize: 10.5,
                  fontWeight: 500,
                  color: "var(--text-subtle)",
                }}
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
