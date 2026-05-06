"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { useProfessorI18n } from "./useProfessorI18n";

export interface InstructorProfileDraft {
  school: string;
  department: string;
  position?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** 저장 성공 — 부모에 통지 (체크리스트 ① 단계 완료 토글) */
  onSaved: (profile: InstructorProfileDraft) => void;
  /** 초기값 — 다시 열어서 편집할 때 사용 */
  initial?: Partial<InstructorProfileDraft>;
}

const POSITION_KEYS = [
  "positionProfessor",
  "positionAssociate",
  "positionAssistant",
  "positionLecturer",
  "positionAdjunct",
  "positionOther",
] as const;

/**
 * 학과·소속 정보 입력 모달.
 *
 * 기획 근거: docs/planning/05-instructor-pages.md §3.4 (학과/강의 정보 입력).
 *
 * 백엔드 통합:
 *   현재 `POST /api/auth/complete-profile` 는 OAuth 직후 `temp_token` 을 요구합니다.
 *   "이미 로그인된 교수자가 프로필을 채우는" 흐름은 R2W2 의 `/complete-profile`
 *   확장(또는 `PATCH /api/users/me`) 과정에서 활성화됩니다. 본 컴포넌트는 그
 *   엔드포인트가 도착하면 즉시 동작하도록 작성하되, 현재 단계에서는 저장 실패를
 *   "임시 저장됨" UX 로 처리해 사용자가 다음 단계로 자연스럽게 넘어갈 수 있게
 *   합니다 (제출한 값은 부모 컴포넌트의 React state 로 보존).
 */
export default function InstructorProfileModal({
  open,
  onClose,
  onSaved,
  initial,
}: Props) {
  const { t } = useProfessorI18n();
  return (
    <Modal open={open} onClose={onClose} closable title={t("modalTitle")}>
      {/* Form 을 별도 컴포넌트로 분리해 모달이 매번 열릴 때 fresh-mount 되도록 한다.
         이렇게 두면 setState-in-effect 로 동기화하지 않고도 initial 이 props 그대로
         초기 상태에 들어가며, react-hooks/set-state-in-effect 규칙도 회피된다. */}
      <ProfileForm
        initial={initial}
        onSaved={onSaved}
        onClose={onClose}
      />
    </Modal>
  );
}

function ProfileForm({
  initial,
  onSaved,
  onClose,
}: {
  initial: Props["initial"];
  onSaved: Props["onSaved"];
  onClose: Props["onClose"];
}) {
  const { t } = useProfessorI18n();
  const { toast } = useToast();

  const [school, setSchool] = useState(initial?.school ?? "");
  const [department, setDepartment] = useState(initial?.department ?? "");
  const [position, setPosition] = useState(initial?.position ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedSchool = school.trim();
    const trimmedDept = department.trim();
    if (!trimmedSchool || !trimmedDept) {
      setError(t("modalErrorRequired"));
      return;
    }
    setSubmitting(true);
    setError(null);

    const draft: InstructorProfileDraft = {
      school: trimmedSchool,
      department: trimmedDept,
      position: position || undefined,
    };

    try {
      // R2W2 가 PATCH 로 받도록 확장 중 — 도착 전까지는 405/404 가 정상.
      // 서버가 새 형태로 받기 시작하면 이 호출이 그대로 성공 경로를 탑니다.
      await api.patch("/api/auth/complete-profile", draft);
      toast(t("modalSavedToast"), "success");
    } catch {
      // 백엔드 미준비 — UX 가 끊기지 않도록 deferred-save 로 처리.
      toast(t("modalDeferred"), "info");
    }

    setSubmitting(false);
    onSaved(draft);
    onClose();
  };

  return (
    <form
      onSubmit={handleSubmit}
      aria-label={t("modalTitle")}
      data-testid="professor-profile-form"
      className="space-y-4"
    >
        <p className="text-sm text-gray-500 leading-relaxed">
          {t("modalSubtitle")}
        </p>

        {error && (
          <div
            role="alert"
            className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        <div>
          <label
            htmlFor="prof-school"
            className="block text-sm font-medium text-gray-700 mb-1.5"
          >
            {t("modalSchoolLabel")}
          </label>
          <input
            id="prof-school"
            data-testid="professor-profile-school"
            type="text"
            required
            value={school}
            onChange={(e) => setSchool(e.target.value)}
            placeholder={t("modalSchoolPlaceholder")}
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
          />
        </div>

        <div>
          <label
            htmlFor="prof-department"
            className="block text-sm font-medium text-gray-700 mb-1.5"
          >
            {t("modalDepartmentLabel")}
          </label>
          <input
            id="prof-department"
            data-testid="professor-profile-department"
            type="text"
            required
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            placeholder={t("modalDepartmentPlaceholder")}
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
          />
        </div>

        <div>
          <label
            htmlFor="prof-position"
            className="block text-sm font-medium text-gray-700 mb-1.5"
          >
            {t("modalPositionLabel")}
          </label>
          <select
            id="prof-position"
            data-testid="professor-profile-position"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 bg-white"
          >
            <option value="">{t("modalPositionPlaceholder")}</option>
            {POSITION_KEYS.map((key) => (
              <option key={key} value={key}>
                {t(key)}
              </option>
            ))}
          </select>
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={submitting}
            data-testid="professor-profile-submit"
            className="w-full inline-flex items-center justify-center bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-sm font-semibold rounded-xl py-3 transition motion-reduce:transition-none shadow-sm"
          >
            {submitting ? t("modalSubmitting") : t("modalSubmit")}
          </button>
        </div>
      </form>
  );
}
