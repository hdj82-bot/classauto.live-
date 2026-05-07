"use client";

import { useStudioI18n } from "./useStudioI18n";
import AvatarPicker from "./AvatarPicker";
import CostMeter from "./CostMeter";
import GuardrailBanner from "./GuardrailBanner";
import { evaluatePlanUsage } from "./guardrails";
import { estimateCost } from "./costEstimator";
import type {
  HeyGenAvatar,
  PlanUsage,
  ScriptSegment,
  TtsProvider,
} from "./studioTypes";

interface Step3Props {
  segments: readonly ScriptSegment[];
  avatars: readonly HeyGenAvatar[];
  avatarsLoading: boolean;
  avatarsError: string | null;
  selectedAvatarId: string | null;
  onSelectAvatar: (id: string) => void;
  ttsProvider: TtsProvider;
  onChangeTtsProvider: (p: TtsProvider) => void;
  expiresAt: string | null;
  onChangeExpiresAt: (iso: string | null) => void;
  usage: PlanUsage;
  onNext: () => void;
}

/**
 * Step 3 — 아바타 / 음성 선택 + 비용 미리보기.
 *
 * 비용 미터가 80% 이상이면 펄스 경고, 100% 초과이면 다음 단계 차단.
 * docs/planning/05-instructor-pages.md §5.3 (2) 실시간 비용 미터 + §5.2 우측 설정 패널.
 */
export default function Step3AvatarVoice({
  segments,
  avatars,
  avatarsLoading,
  avatarsError,
  selectedAvatarId,
  onSelectAvatar,
  ttsProvider,
  onChangeTtsProvider,
  expiresAt,
  onChangeExpiresAt,
  usage,
  onNext,
}: Step3Props) {
  const { t } = useStudioI18n();

  const estimate = estimateCost(segments, ttsProvider);
  const decision = evaluatePlanUsage(usage, estimate);

  const canProceed = !!selectedAvatarId && !decision.block;

  return (
    <section
      aria-labelledby="step3-title"
      className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4"
    >
      <div className="space-y-6">
        <header>
          <h2 id="step3-title" className="text-lg font-bold text-gray-900">
            {t("step3.title")}
          </h2>
          <p className="mt-1 text-sm text-gray-500">{t("step3.subtitle")}</p>
        </header>

        {decision.block && (
          <GuardrailBanner variant="block" usage={usage} />
        )}

        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            {t("step3.avatarSection")}
          </h3>
          <AvatarPicker
            avatars={avatars}
            loading={avatarsLoading}
            error={avatarsError}
            selectedId={selectedAvatarId}
            onSelect={onSelectAvatar}
          />
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            {t("step3.voiceSection")}
          </h3>
          <fieldset
            className="grid grid-cols-1 sm:grid-cols-2 gap-2"
            aria-label={t("step3.ttsProviderLabel")}
          >
            <label
              className={`flex items-start gap-2 px-3 py-2 rounded-xl border cursor-pointer transition ${
                ttsProvider === "elevenlabs"
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                name="ttsProvider"
                value="elevenlabs"
                checked={ttsProvider === "elevenlabs"}
                onChange={() => onChangeTtsProvider("elevenlabs")}
                className="mt-1"
              />
              <span className="text-xs text-gray-700">
                {t("step3.ttsProviderElevenLabs")}
              </span>
            </label>
            <label
              className={`flex items-start gap-2 px-3 py-2 rounded-xl border cursor-pointer transition ${
                ttsProvider === "google"
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <input
                type="radio"
                name="ttsProvider"
                value="google"
                checked={ttsProvider === "google"}
                onChange={() => onChangeTtsProvider("google")}
                className="mt-1"
              />
              <span className="text-xs text-gray-700">
                {t("step3.ttsProviderGoogle")}
              </span>
            </label>
          </fieldset>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            {t("step3.settingsSection")}
          </h3>
          <label
            htmlFor="studio-expires-at"
            className="block text-xs font-medium text-gray-600 mb-1"
          >
            {t("step3.expiresLabel")}
          </label>
          <input
            id="studio-expires-at"
            type="date"
            value={expiresAt ? expiresAt.slice(0, 10) : ""}
            onChange={(e) => {
              const v = e.target.value;
              onChangeExpiresAt(v ? new Date(v).toISOString() : null);
            }}
            className="w-full sm:w-60 border border-gray-300 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-500"
          />
          <p className="text-[11px] text-gray-400 mt-1">
            {t("step3.expiresHelp")}
          </p>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onNext}
            disabled={!canProceed}
            className="text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl px-5 py-2.5 font-semibold transition"
          >
            {t("step3.next")}
          </button>
        </div>
      </div>

      {/* 우측 비용 미터 */}
      <aside className="lg:sticky lg:top-4 self-start">
        <CostMeter
          estimate={estimate}
          usage={usage}
          ttsProvider={ttsProvider}
        />
      </aside>
    </section>
  );
}
