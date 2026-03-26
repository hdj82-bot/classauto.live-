"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { authApi } from "@/lib/api";

export default function CompleteProfileContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { login } = useAuth();

  const tempToken = searchParams.get("temp_token") ?? "";
  const email = searchParams.get("email") ?? "";
  const name = searchParams.get("name") ?? "";
  const role = (searchParams.get("role") ?? "student") as
    | "professor"
    | "student";

  const [school, setSchool] = useState("");
  const [department, setDepartment] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!tempToken) {
    router.replace("/auth/login");
    return null;
  }

  const isValid =
    role === "professor"
      ? school.trim() !== "" && department.trim() !== ""
      : studentNumber.trim() !== "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    setIsSubmitting(true);
    setError("");

    try {
      const { data } = await authApi.completeProfile({
        temp_token: tempToken,
        ...(role === "professor"
          ? { school, department }
          : { student_number: studentNumber }),
      });
      login(data.access_token, data.refresh_token);
      router.replace("/dashboard");
    } catch {
      setError("오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* 헤더 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 text-white text-xl font-bold mb-4 select-none">
            IFL
          </div>
          <h1 className="text-xl font-bold text-gray-900">추가 정보 입력</h1>
          <p className="mt-1 text-sm text-gray-500">
            {role === "professor" ? "교수자" : "학습자"}로 가입합니다
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {/* Google 계정 정보 표시 */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-200 mb-6">
            <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm flex-shrink-0">
              {name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{name}</p>
              <p className="text-xs text-gray-400 truncate">{email}</p>
            </div>
            <span className="ml-auto text-xs text-indigo-600 font-medium bg-indigo-50 px-2 py-0.5 rounded-full flex-shrink-0">
              {role === "professor" ? "교수자" : "학습자"}
            </span>
          </div>

          {/* 에러 */}
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {role === "professor" ? (
              <>
                <Field
                  label="학교명"
                  id="school"
                  placeholder="예) 한국대학교"
                  value={school}
                  onChange={setSchool}
                />
                <Field
                  label="소속 학과"
                  id="department"
                  placeholder="예) 컴퓨터공학과"
                  value={department}
                  onChange={setDepartment}
                />
              </>
            ) : (
              <Field
                label="학번"
                id="student_number"
                placeholder="예) 20240001"
                value={studentNumber}
                onChange={setStudentNumber}
              />
            )}

            <button
              type="submit"
              disabled={!isValid || isSubmitting}
              className="mt-2 w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "가입 중..." : "가입 완료"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  id,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  id: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-medium text-gray-700 mb-1.5"
      >
        {label}
      </label>
      <input
        id={id}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
      />
    </div>
  );
}
