"use client";

import { useCallback, useMemo, useState, type CSSProperties } from "react";
import { useToast } from "@/components/ui/Toast";
import { usePhotoAvatarFlow } from "./onboarding/usePhotoAvatarFlow";
import { usePhotoAvatarI18n } from "./onboarding/usePhotoAvatarI18n";
import { useAvatarsI18n } from "./useAvatarsI18n";
import PhotoUploadStep from "./onboarding/PhotoUploadStep";
import LookGenerateStep from "./onboarding/LookGenerateStep";
import LookSelectStep from "./onboarding/LookSelectStep";
import { CameraIcon, CheckIcon } from "./onboarding/PhotoAvatarIcons";
import type {
  LookGenerateInput,
  OnboardingStep,
} from "./onboarding/photoAvatarTypes";

interface PhotoAvatarStudioCardProps {
  reducedMotion: boolean;
  /** 기본 룩을 지정(확정)했을 때 — 페이지가 갤러리를 새로고침할 수 있다. */
  onConfirmed?: () => void;
}

/**
 * "내 사진으로 아바타 만들기" — 갤러리 페이지 안에 인라인으로 임베드한 v0.2
 * 사진 아바타 룩 온보딩(train 없음).
 *
 * 별도 ``/onboarding`` 라우트로 보내지 않고, 온보딩 단계 컴포넌트
 * (PhotoUploadStep/LookGenerateStep/LookSelectStep)와 ``usePhotoAvatarFlow`` 를
 * 이 카드 안에서 그대로 재사용한다. 흐름은 사진 업로드(즉시 ready) → 구조화
 * 옵션으로 룩 배치 생성 → 갤러리 선택 → 기본 룩 지정. 비용 가드(누적 상한·소프트
 * 안내)는 LookGenerateStep/LookOptionForm 이 유지한다 (docs/planning/12 §0.5).
 *
 * 움직이는 미리보기·본인 목소리는 이 페이지의 별도 음성 카드/미리보기 무대가
 * 담당하므로 임베드 흐름은 "기본 룩 지정"에서 끝낸다.
 */

// 임베드 흐름의 단계(미리보기 제외 3단계). v0.2 = train 없음. 여기선 "select"가
// 마지막(확정)이다.
const EMBED_STEPS: OnboardingStep[] = ["upload", "generate", "select"];

// 사진 클라이언트 상한 20MB (백엔드 한도와 정합). 가이드·검증 문구는 avatars
// 네임스페이스 키로 override 한다(아래 tUpload).
const PHOTO_MAX_BYTES = 20 * 1024 * 1024;

export default function PhotoAvatarStudioCard({
  reducedMotion,
  onConfirmed,
}: PhotoAvatarStudioCardProps) {
  const { t } = usePhotoAvatarI18n();
  const { t: tAvatars } = useAvatarsI18n();
  const { toast } = useToast();
  const flow = usePhotoAvatarFlow();
  const [confirmed, setConfirmed] = useState(false);

  // PhotoUploadStep 의 사진 용량 가이드/검증 문구를 20MB 로 맞추기 위한 thin
  // t-래퍼. photoAvatarOnboarding 네임스페이스(소유 밖)를 수정하지 않고, avatars
  // 네임스페이스의 studioPhoto* 키로 그 두 문구만 갈아끼운다.
  const tUpload = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      if (key === "upload.guideFormat") return tAvatars("studioPhotoFormat");
      if (key === "upload.errorTooLarge") return tAvatars("studioPhotoTooLarge");
      return t(key, params);
    },
    [t, tAvatars],
  );

  const selectedLook = useMemo(
    () => flow.looks.find((l) => l.look_id === flow.selectedLookId) ?? null,
    [flow.looks, flow.selectedLookId],
  );

  const handleGenerate = useCallback(
    async (input: LookGenerateInput) => {
      try {
        await flow.generate(input);
      } catch {
        toast(t("looks.error"), "error");
      }
    },
    [flow, toast, t],
  );

  const handleSelect = useCallback(
    async (lookId: string) => {
      setConfirmed(false);
      try {
        await flow.select(lookId);
      } catch {
        toast(t("select.error"), "error");
      }
    },
    [flow, toast, t],
  );

  const handleDelete = useCallback(
    async (lookId: string) => {
      try {
        await flow.remove(lookId);
      } catch {
        toast(t("looks.error"), "error");
      }
    },
    [flow, toast, t],
  );

  // ④ "기본 룩 지정" 확정 — flow.select 가 이미 기본 룩을 저장했으므로 여기선
  // 확정 상태로 전환하고 부모에게 알린다(갤러리 새로고침).
  const handleConfirm = useCallback(() => {
    setConfirmed(true);
    toast(t("embed.confirmed"), "success");
    onConfirmed?.();
  }, [toast, t, onConfirmed]);

  const restart = useCallback(() => {
    setConfirmed(false);
    flow.goTo("upload");
  }, [flow]);

  const currentIndex = EMBED_STEPS.indexOf(
    EMBED_STEPS.includes(flow.step) ? flow.step : "upload",
  );

  return (
    <div data-testid="photo-avatar-studio" style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <CameraIcon size={24} />
        <h3 style={titleStyle}>{t("embed.title")}</h3>
      </div>
      <p style={descStyle}>{t("embed.description")}</p>

      {flow.deferred && (
        <p role="status" data-testid="studio-deferred-note" style={deferredNote}>
          {t("deferredBanner")}
        </p>
      )}

      {/* 컴팩트 3단계 인디케이터 (확정 시 전부 완료 표시) */}
      <ol style={stepperStyle} data-testid="studio-stepper" aria-hidden={confirmed}>
        {EMBED_STEPS.map((stepKey, i) => {
          const state: "done" | "current" | "upcoming" = confirmed
            ? "done"
            : i < currentIndex
              ? "done"
              : i === currentIndex
                ? "current"
                : "upcoming";
          const isLast = i === EMBED_STEPS.length - 1;
          return (
            <li key={stepKey} style={{ flex: isLast ? "0 0 auto" : "1 1 0", minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center" }}>
                <span
                  style={{
                    ...nodeStyle,
                    background:
                      state === "done"
                        ? "var(--gold)"
                        : state === "current"
                          ? "var(--bg-card)"
                          : "var(--bg-subtle)",
                    borderColor: state === "upcoming" ? "var(--line)" : "var(--gold)",
                    boxShadow: state === "current" ? "0 0 0 4px var(--gold-soft)" : "none",
                    color:
                      state === "done"
                        ? "#0A0A0A"
                        : state === "current"
                          ? "var(--gold-on-light)"
                          : "var(--text-faint)",
                  }}
                >
                  {state === "done" ? (
                    <CheckIcon size={15} mono />
                  ) : (
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{i + 1}</span>
                  )}
                </span>
                {!isLast && (
                  <span
                    aria-hidden="true"
                    style={{
                      flex: 1,
                      height: 2,
                      margin: "0 6px",
                      borderRadius: 2,
                      background: i < currentIndex || confirmed ? "var(--gold)" : "var(--line)",
                    }}
                  />
                )}
              </div>
              <span
                style={{
                  ...stepLabel,
                  color: state === "upcoming" ? "var(--text-faint)" : "var(--text)",
                  fontWeight: state === "current" ? 700 : 500,
                }}
              >
                {t(`step.${stepKey}.label`)}
              </span>
            </li>
          );
        })}
      </ol>

      {/* 확정 패널 또는 현재 단계 */}
      {confirmed ? (
        <div style={confirmPanel} data-testid="studio-confirmed">
          <div style={confirmThumb}>
            {selectedLook?.image_url || selectedLook?.preview_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selectedLook.image_url ?? selectedLook.preview_image_url ?? ""}
                alt={t("embed.confirmedTitle")}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            ) : (
              <CheckIcon size={32} />
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text)" }}>
              {t("embed.confirmedTitle")}
            </p>
            <p style={{ margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.6, color: "var(--text-muted)" }}>
              {t("embed.confirmedBody")}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              <button type="button" onClick={() => { setConfirmed(false); flow.goTo("select"); }} style={secondaryBtn} data-testid="studio-rechoose">
                {t("embed.rechoose")}
              </button>
              <button type="button" onClick={restart} style={ghostBtn} data-testid="studio-restart">
                {t("embed.restart")}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 16 }}>
          {flow.step === "upload" && (
            <PhotoUploadStep
              onSubmit={flow.uploadPhoto}
              maxBytes={PHOTO_MAX_BYTES}
              t={tUpload}
            />
          )}
          {flow.step === "generate" && (
            <LookGenerateStep
              looks={flow.looks}
              onGenerate={handleGenerate}
              onDelete={handleDelete}
              looksPending={flow.looksPending}
              lastInput={flow.lastInput}
              reducedMotion={reducedMotion}
              onNext={() => flow.goTo("select")}
              onRestart={restart}
              t={t}
            />
          )}
          {/* 미리보기 단계로 보내지 않고, "다음" 대신 "기본 룩 지정" 확정으로 끝낸다. */}
          {(flow.step === "select" || flow.step === "preview") && (
            <LookSelectStep
              looks={flow.looks}
              selectedLookId={flow.selectedLookId}
              onSelect={handleSelect}
              onGenerate={handleGenerate}
              onDelete={handleDelete}
              lastInput={flow.lastInput}
              looksPending={flow.looksPending}
              reducedMotion={reducedMotion}
              onBack={() => flow.goTo("generate")}
              onRestart={restart}
              onNext={handleConfirm}
              t={tSelectConfirm(t)}
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * LookSelectStep 의 "다음: 미리보기" 라벨을 임베드 맥락의 "기본 룩으로 지정"으로
 * 바꾸기 위한 thin t-래퍼. 그 외 키는 그대로 위임한다.
 */
function tSelectConfirm(
  t: (key: string, params?: Record<string, string | number>) => string,
): (key: string, params?: Record<string, string | number>) => string {
  return (key, params) =>
    key === "select.next" ? t("embed.setDefault") : t(key, params);
}

const cardStyle: CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--line)",
  borderRadius: 16,
  padding: 22,
  boxShadow: "var(--shadow-sm)",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 700,
  color: "var(--text)",
};

const descStyle: CSSProperties = {
  margin: "2px 0 0",
  fontSize: 13,
  lineHeight: 1.6,
  color: "var(--text-muted)",
};

const deferredNote: CSSProperties = {
  margin: "12px 0 0",
  padding: "10px 12px",
  borderRadius: 10,
  fontSize: 12,
  lineHeight: 1.5,
  color: "var(--gold-on-light)",
  background: "var(--gold-soft)",
  border: "1px solid var(--gold-medium)",
};

const stepperStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  listStyle: "none",
  margin: "18px 0 0",
  padding: 0,
};

const nodeStyle: CSSProperties = {
  flexShrink: 0,
  width: 30,
  height: 30,
  borderRadius: "50%",
  border: "2px solid",
  display: "grid",
  placeItems: "center",
  transition: "box-shadow 140ms var(--ease-out), background 140ms var(--ease-out)",
};

const stepLabel: CSSProperties = {
  display: "block",
  marginTop: 7,
  fontSize: 11,
  lineHeight: 1.3,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  paddingRight: 6,
};

const confirmPanel: CSSProperties = {
  display: "flex",
  gap: 16,
  alignItems: "flex-start",
  marginTop: 18,
  padding: 18,
  borderRadius: 14,
  background: "var(--gold-soft)",
  border: "1px solid var(--gold-medium)",
};

const confirmThumb: CSSProperties = {
  width: 84,
  height: 112,
  flexShrink: 0,
  borderRadius: 12,
  overflow: "hidden",
  background: "var(--bg-card)",
  border: "1px solid var(--gold-medium)",
  display: "grid",
  placeItems: "center",
};

const secondaryBtn: CSSProperties = {
  padding: "9px 16px",
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 10,
  border: "1px solid transparent",
  background: "linear-gradient(135deg, #FFB627, #E89E0E)",
  color: "#0A0A0A",
  cursor: "pointer",
  fontFamily: "inherit",
};

const ghostBtn: CSSProperties = {
  padding: "9px 16px",
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 10,
  border: "1px solid var(--line-strong)",
  background: "var(--bg-card)",
  color: "var(--text-muted)",
  cursor: "pointer",
  fontFamily: "inherit",
};
