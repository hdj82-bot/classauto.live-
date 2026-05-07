"use client";

import { useRef, useState } from "react";
import { useStudioI18n } from "./useStudioI18n";
import { validateStep1, validatePptFile, MAX_PPT_BYTES } from "./guardrails";
import GuardrailBanner from "./GuardrailBanner";
import type { Course } from "./studioTypes";

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

  return (
    <form
      onSubmit={handleSubmit}
      aria-label={t("step1.title")}
      className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 space-y-6"
    >
      <header>
        <h2 className="text-lg font-bold text-gray-900">{t("step1.title")}</h2>
        <p className="mt-1 text-sm text-gray-500">{t("step1.subtitle")}</p>
      </header>

      {/* 강좌 선택 */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-gray-700">
          {t("step1.courseLabel")}
        </legend>
        <p className="text-xs text-gray-400">{t("step1.courseHelp")}</p>
        <div className="flex gap-2">
          <label className="flex-1 cursor-pointer">
            <input
              type="radio"
              name="courseMode"
              value="existing"
              checked={courseMode === "existing"}
              onChange={() => setCourseMode("existing")}
              className="sr-only peer"
              disabled={courses.length === 0}
            />
            <div
              className={`text-center text-xs font-medium px-3 py-2 rounded-xl border transition ${
                courses.length === 0
                  ? "border-gray-200 text-gray-300 cursor-not-allowed"
                  : courseMode === "existing"
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              {t("step1.courseExisting")}
            </div>
          </label>
          <label className="flex-1 cursor-pointer">
            <input
              type="radio"
              name="courseMode"
              value="new"
              checked={courseMode === "new"}
              onChange={() => setCourseMode("new")}
              className="sr-only peer"
            />
            <div
              className={`text-center text-xs font-medium px-3 py-2 rounded-xl border transition ${
                courseMode === "new"
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                  : "border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              {t("step1.courseNew")}
            </div>
          </label>
        </div>

        {courseMode === "existing" ? (
          <select
            value={selectedCourseId}
            onChange={(e) => setSelectedCourseId(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
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
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          />
        )}
      </fieldset>

      {/* 강의 제목 */}
      <div>
        <label
          htmlFor="studio-lecture-title"
          className="block text-sm font-medium text-gray-700 mb-1.5"
        >
          {t("step1.lectureTitleLabel")}
        </label>
        <input
          id="studio-lecture-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder={t("step1.lectureTitlePlaceholder")}
          className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>

      <div>
        <label
          htmlFor="studio-description"
          className="block text-sm font-medium text-gray-700 mb-1.5"
        >
          {t("step1.descriptionLabel")}
        </label>
        <textarea
          id="studio-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder={t("step1.descriptionPlaceholder")}
          className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 resize-none"
        />
      </div>

      {/* PPT 업로드 */}
      <div>
        <label
          htmlFor="studio-ppt-upload"
          className="block text-sm font-medium text-gray-700 mb-1.5"
        >
          {t("step1.pptLabel")}
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
          aria-label={t("step1.pptDragDrop")}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 transition ${
            dragOver
              ? "border-indigo-500 bg-indigo-50"
              : "border-gray-300 hover:border-gray-400"
          }`}
        >
          {file ? (
            <div>
              <p className="text-sm font-medium text-gray-900">{file.name}</p>
              <p className="text-xs text-gray-400 mt-1 tabular-nums">
                {(file.size / 1024 / 1024).toFixed(1)} MB
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="mt-2 text-xs text-gray-500 hover:text-gray-700 underline underline-offset-2"
              >
                {t("step1.pptRemove")}
              </button>
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-500">{t("step1.pptDragDrop")}</p>
              <p className="text-xs text-gray-400 mt-1">
                {t("step1.pptFormat")}
              </p>
            </div>
          )}
          <input
            ref={fileInputRef}
            id="studio-ppt-upload"
            type="file"
            accept=".pptx"
            className="hidden"
            onChange={(e) => setFileWithValidation(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>

      <p className="text-xs text-gray-400">{t("step1.uploadHint")}</p>

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
            className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700"
          >
            {t(errorKey)}
          </div>
        )}

      <button
        type="submit"
        disabled={submitting || !file}
        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl py-3 text-sm font-semibold transition"
      >
        {submitting ? t("step1.submitting") : t("step1.submit")}
      </button>

      {/* 100MB 한도 표시 — 백엔드 미러 */}
      <p className="text-[11px] text-gray-300 tabular-nums text-right">
        max {MAX_PPT_BYTES / (1024 * 1024)}MB
      </p>
    </form>
  );
}
