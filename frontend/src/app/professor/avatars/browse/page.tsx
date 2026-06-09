"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/professor/shell";
import { useToast } from "@/components/ui/Toast";
import { useAvatarsI18n } from "@/components/professor/avatars/useAvatarsI18n";
import { useReducedMotion } from "@/components/professor/avatars/useReducedMotion";
import AvatarBrowser from "@/components/professor/avatars/AvatarBrowser";
import {
  addFavoriteAvatar,
  listFavoriteAvatars,
  listHeyGenAccountAvatars,
  listHeyGenAvatarGroups,
  listHeyGenGroupLooks,
  registerStandardAvatar,
  removeFavoriteAvatar,
  setRecentAvatar,
} from "@/components/professor/avatars/avatarsApi";
import type {
  Avatar,
  HeyGenAvatarGroup,
} from "@/components/professor/avatars/avatarsTypes";

/** 백엔드 오류 응답의 detail 문구를 꺼낸다(없으면 null). */
function backendDetail(err: unknown): string | null {
  const e = err as { response?: { data?: { detail?: unknown } } } | undefined;
  const d = e?.response?.data?.detail;
  return typeof d === "string" && d.trim() ? d : null;
}

/**
 * /professor/avatars/browse — 공개 아바타 전체 둘러보기(HeyGen "공개 아바타" 스타일).
 *
 * 표준 아바타 등록 카드의 컴팩트 피커로는 1000+ 공개 아바타를 보기 어려워, 전용
 * 넓은 페이지에서 캐릭터별로 묶어 보여 준다. 룩의 "이 아바타 등록"을 누르면 표준
 * 아바타로 등록하고, 그 아바타를 선택한 상태로 아바타 선택 페이지로 복귀한다
 * (``?selectStandard=`` → 상단 "룩"에 바로 표시). 강의 컨텍스트(``?lecture=``)는 보존.
 */
export default function AvatarBrowsePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useAvatarsI18n();
  const { toast } = useToast();
  const reducedMotion = useReducedMotion();

  const lectureId = searchParams?.get("lecture") ?? null;
  const backHref = `/professor/avatars${lectureId ? `?lecture=${lectureId}` : ""}`;

  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [groups, setGroups] = useState<HeyGenAvatarGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [registeringId, setRegisteringId] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Video Avatar(/v2/avatars)와 Photo Avatar 그룹(/v2/avatar_group.list)을 함께
      // 불러온다. 둘 다 실패해야 에러로 본다(하나만 와도 표시 가능).
      const [accountRes, groupRes] = await Promise.allSettled([
        listHeyGenAccountAvatars(),
        listHeyGenAvatarGroups(),
      ]);
      if (cancelled) return;
      const list =
        accountRes.status === "fulfilled" ? accountRes.value : [];
      const grpList = groupRes.status === "fulfilled" ? groupRes.value : [];
      setAvatars(list);
      setGroups(grpList);
      setError(list.length === 0 && grpList.length === 0);
      setLoading(false);
    })();
    (async () => {
      try {
        const favs = await listFavoriteAvatars();
        if (!cancelled) setFavorites(new Set(favs));
      } catch {
        /* 즐겨찾기 로드 실패는 무시(빈 집합) */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 별표 토글 — 낙관적으로 갱신하고 서버에 반영(실패 시 되돌린다).
  const handleToggleFavorite = useCallback((avatarId: string, next: boolean) => {
    setFavorites((prev) => {
      const s = new Set(prev);
      if (next) s.add(avatarId);
      else s.delete(avatarId);
      return s;
    });
    const op = next ? addFavoriteAvatar : removeFavoriteAvatar;
    void op(avatarId).catch(() => {
      setFavorites((prev) => {
        const s = new Set(prev);
        if (next) s.delete(avatarId);
        else s.add(avatarId);
        return s;
      });
    });
  }, []);

  // 그룹 룩 lazy 로드 — 캐릭터를 열 때 호출(AvatarBrowser 가 결과를 캐시).
  const handleLoadGroupLooks = useCallback(
    (groupId: string) => listHeyGenGroupLooks(groupId),
    [],
  );

  const handleRegister = useCallback(
    async (a: Avatar) => {
      setRegisteringId(a.id);
      try {
        await registerStandardAvatar(a.id, a.name, {
          preview_image_url: a.preview_image_url,
          preview_video_url: a.preview_video_url,
          gender: a.gender,
        });
        // 복귀 후 "최근 선택" 복원 + selectStandard 로 상단 "룩"에 바로 표시.
        try {
          await setRecentAvatar(a.id);
        } catch {
          /* 최근 기록 실패는 무시 */
        }
        toast(t("standardRegisterSuccess"), "success");
        const q = new URLSearchParams();
        q.set("selectStandard", a.id);
        if (lectureId) q.set("lecture", lectureId);
        router.push(`/professor/avatars?${q.toString()}`);
      } catch (err) {
        toast(backendDetail(err) ?? t("standardRegisterError"), "error");
        setRegisteringId(null);
      }
    },
    [lectureId, router, toast, t],
  );

  return (
    <PageContainer>
      <div className="space-y-6">
        <Link href={backHref} style={backLinkStyle}>
          ← {t("browseBack")}
        </Link>
        <PageHeader
          eyebrow={t("browseEyebrow")}
          title={t("browseTitle")}
          subtitle={t("browseSubtitle")}
        />
        <AvatarBrowser
          avatars={avatars}
          groups={groups}
          loadGroupLooks={handleLoadGroupLooks}
          loading={loading}
          error={error}
          onRegister={handleRegister}
          registeringId={registeringId}
          favorites={favorites}
          onToggleFavorite={handleToggleFavorite}
          reducedMotion={reducedMotion}
          t={t}
        />
      </div>
    </PageContainer>
  );
}

const backLinkStyle = {
  display: "inline-block",
  fontSize: 13,
  fontWeight: 600,
  color: "var(--gold-on-light, #B88308)",
  textDecoration: "none",
} as const;
