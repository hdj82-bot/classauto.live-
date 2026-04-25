"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { authApi } from "@/lib/api";
import { useI18n } from "@/contexts/I18nContext";

type ExchangedProfile = {
  tempToken: string;
  email: string;
  name: string;
  role: "professor" | "student";
};

export default function CompleteProfileContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { login } = useAuth();
  const { t } = useI18n();

  const [profile, setProfile] = useState<ExchangedProfile | null>(null);
  const [school, setSchool] = useState("");
  const [department, setDepartment] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // temp_code는 1회용. StrictMode 이중 실행으로 두 번째가 401 나는 것을 막는다.
  const exchangedRef = useRef(false);

  useEffect(() => {
    if (exchangedRef.current) return;
    const tempCode = searchParams.get("temp_code");
    if (!tempCode) {
      router.replace("/auth/login?error=invalid_state");
      return;
    }
    exchangedRef.current = true;
    (async () => {
      try {
        const { data } = await authApi.tempExchange(tempCode);
        setProfile({
          tempToken: data.temp_token,
          email: data.email,
          name: data.name,
          role: data.role,
        });
      } catch {
        router.replace("/auth/login?error=exchange_failed");
      }
    })();
  }, [searchParams, router]);

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-gray-500">{t("auth.completeProfile")}...</p>
      </div>
    );
  }

  const { tempToken, email, name, role } = profile;

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
      login(data.access_token);
      router.replace("/dashboard");
    } catch {
      setError(t("auth.registerError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 text-white text-xl font-bold mb-4 select-none" aria-hidden="true">
            IFL
          </div>
          <h1 className="text-xl font-bold text-gray-900">{t("auth.completeProfile")}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {t("auth.registeringAs", { role: role === "professor" ? t("common.professor") : t("common.student") })}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {/* Google account info */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-200 mb-6">
            <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm flex-shrink-0" aria-hidden="true">
              {name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{name}</p>
              <p className="text-xs text-gray-400 truncate">{email}</p>
            </div>
            <span className="ml-auto text-xs text-indigo-600 font-medium bg-indigo-50 px-2 py-0.5 rounded-full flex-shrink-0">
              {role === "professor" ? t("common.professor") : t("common.student")}
            </span>
          </div>

          {/* Error */}
          {error && (
            <div role="alert" className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {role === "professor" ? (
              <>
                <Field label={t("auth.school")} id="school" placeholder={t("auth.schoolPlaceholder")} value={school} onChange={setSchool} />
                <Field label={t("auth.department")} id="department" placeholder={t("auth.departmentPlaceholder")} value={department} onChange={setDepartment} />
              </>
            ) : (
              <Field label={t("auth.studentNumber")} id="student_number" placeholder={t("auth.studentNumberPlaceholder")} value={studentNumber} onChange={setStudentNumber} />
            )}

            <button
              type="submit"
              disabled={!isValid || isSubmitting}
              className="mt-2 w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? t("auth.registering") : t("auth.register")}
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
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1.5">
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
