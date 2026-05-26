"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import Link from "next/link";
import { PageContainer, PageHeader } from "@/components/professor/shell";
import { useToast } from "@/components/ui/Toast";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useReducedMotion } from "@/components/professor/avatars/useReducedMotion";
import { useVoicePreview } from "@/components/professor/avatars/useVoicePreview";
import {
  addLibraryVoice,
  listLibraryVoices,
  listVoiceOptions,
  setVoiceFavorite,
  type LibraryQuery,
  type LibraryVoice,
} from "@/components/professor/avatars/voicesApi";
import type { VoiceOption } from "@/components/professor/avatars/voicePresets";

/**
 * /professor/voices — 음성 라이브러리.
 *
 * 두 모드:
 *  - "내 보이스": 계정 보이스(premade/추가/클론) 미리듣기 + ★ 즐겨찾기 토글.
 *  - "라이브러리": ElevenLabs 공유 라이브러리(수천 종)를 검색·필터·페이지로
 *    둘러보고, ★(= 내 보이스에 추가 + 즐겨찾기)로 바로 사용 가능하게 한다.
 *
 * 강의 편집 화면(음성 패널의 '더 많은 음성')에서 ``?lecture={id}`` 로 진입하면
 * 상단에 '강의 편집으로 돌아가기' 버튼을 노출한다.
 */

const SAMPLE_TEXT = "안녕하세요. 이 목소리로 강의 영상을 만들 수 있어요.";

// 카드 강조색 — 골드 일색 톤과 대비되도록 스카이 블루.
const SKY = "#0EA5E9";
const SKY_SOFT = "rgba(14,165,233,0.12)";
const SKY_TEXT = "#0369A1";

type Mode = "mine" | "library";
type MineFilter = "all" | "favorites" | "male" | "female";

const MINE_FILTERS: { key: MineFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "favorites", label: "즐겨찾기" },
  { key: "male", label: "남성" },
  { key: "female", label: "여성" },
];

function isFallbackVoice(id: string): boolean {
  return id.startsWith("tts-");
}

// 검색창에서 한국어로 남성/여성/국가 검색 지원. 예) "여성 미국" → gender=female,
// search="american". 인식 못한 단어는 그대로 검색어로 넘긴다.
const GENDER_WORDS: Record<string, "male" | "female"> = {
  남성: "male",
  남자: "male",
  남: "male",
  여성: "female",
  여자: "female",
  여: "female",
};
const COUNTRY_WORDS: Record<string, { search?: string; language?: string }> = {
  미국: { search: "american" },
  영국: { search: "british" },
  호주: { search: "australian" },
  한국: { search: "korean", language: "ko" },
  인도: { search: "indian" },
  일본: { search: "japanese", language: "ja" },
  중국: { search: "chinese", language: "zh" },
  캐나다: { search: "canadian" },
  아일랜드: { search: "irish" },
  스코틀랜드: { search: "scottish" },
  프랑스: { search: "french", language: "fr" },
  독일: { search: "german", language: "de" },
  스페인: { search: "spanish", language: "es" },
};

function parseKoreanVoiceQuery(input: string): {
  gender: "" | "male" | "female";
  language: string;
  search: string;
} {
  let gender: "" | "male" | "female" = "";
  let language = "";
  const terms: string[] = [];
  for (const tok of input.trim().split(/\s+/).filter(Boolean)) {
    if (GENDER_WORDS[tok]) {
      gender = GENDER_WORDS[tok];
      continue;
    }
    const c = COUNTRY_WORDS[tok];
    if (c) {
      if (c.language) language = c.language;
      if (c.search) terms.push(c.search);
      continue;
    }
    terms.push(tok);
  }
  return { gender, language, search: terms.join(" ") };
}

export default function VoicesPage() {
  const { toast } = useToast();
  const { supported, play, stop } = useVoicePreview();
  const reduced = useReducedMotion();

  const [mode, setMode] = useState<Mode>("mine");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [lectureId, setLectureId] = useState<string | null>(null);

  // ── 내 보이스 ──
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [deferred, setDeferred] = useState(false);
  const [favIds, setFavIds] = useState<Set<string>>(new Set());
  const [mineFilter, setMineFilter] = useState<MineFilter>("all");

  // ── 라이브러리 ──
  const [lib, setLib] = useState<LibraryVoice[]>([]);
  const [libLoading, setLibLoading] = useState(false);
  const [libSearch, setLibSearch] = useState("");
  const [libQuery, setLibQuery] = useState<LibraryQuery>({ page: 0 });
  const [libHasMore, setLibHasMore] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);

  // 진입 시 ?lecture= 읽기 (client-only — useSearchParams Suspense 요구 회피).
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("lecture");
    setLectureId(id);
  }, []);

  const mergeLibFavorites = useCallback((list: LibraryVoice[]) => {
    setFavIds((prev) => {
      const s = new Set(prev);
      for (const v of list) if (v.favorite) s.add(v.voiceId);
      return s;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { voices: list, deferred: isDeferred } = await listVoiceOptions();
      if (cancelled) return;
      setVoices(list);
      setDeferred(isDeferred);
      setFavIds(new Set(list.filter((v) => v.favorite).map((v) => v.id)));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => stop(), [stop]);

  // 라이브러리 조회 — 로딩 표시는 트리거에서 켜고 여기서 끈다(effect 동기 setState
  // 회피). page 0 은 교체, 이후는 누적.
  useEffect(() => {
    if (mode !== "library") return;
    let cancelled = false;
    (async () => {
      const res = await listLibraryVoices(libQuery);
      if (cancelled) return;
      setLib((prev) =>
        (libQuery.page ?? 0) === 0 ? res.voices : [...prev, ...res.voices],
      );
      setLibHasMore(res.hasMore);
      mergeLibFavorites(res.voices);
      setLibLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, libQuery, mergeLibFavorites]);

  const goLibrary = () => {
    setMode("library");
    setLibLoading(true);
  };

  const onSearch = () => {
    const parsed = parseKoreanVoiceQuery(libSearch);
    setLibLoading(true);
    setLibQuery({
      page: 0,
      search: parsed.search,
      gender: parsed.gender,
      language: parsed.language,
    });
  };

  const onPickGender = (g: "" | "male" | "female") => {
    setLibLoading(true);
    setLibQuery((q) => ({ ...q, page: 0, gender: g }));
  };

  const mineShown = useMemo(() => {
    if (mineFilter === "favorites") return voices.filter((v) => favIds.has(v.id));
    if (mineFilter === "male" || mineFilter === "female") {
      return voices.filter((v) => v.gender === mineFilter);
    }
    return voices;
  }, [voices, favIds, mineFilter]);

  const toggleFavorite = async (id: string, fallback: boolean) => {
    if (fallback) return;
    const next = !favIds.has(id);
    setFavIds((prev) => {
      const s = new Set(prev);
      if (next) s.add(id);
      else s.delete(id);
      return s;
    });
    try {
      await setVoiceFavorite(id, next);
    } catch {
      setFavIds((prev) => {
        const s = new Set(prev);
        if (next) s.delete(id);
        else s.add(id);
        return s;
      });
      toast("즐겨찾기 저장에 실패했어요.", "error");
    }
  };

  const previewOption = (opt: VoiceOption) => {
    if (playingId === opt.id) {
      stop();
      setPlayingId(null);
      return;
    }
    setPlayingId(opt.id);
    play(opt, SAMPLE_TEXT, () =>
      setPlayingId((cur) => (cur === opt.id ? null : cur)),
    );
  };

  // 라이브러리 ★ = 내 보이스에 추가 + 즐겨찾기(추가된 계정 보이스 id 로). 추가해야
  // 강의 패널·목록에서 일관되게 보인다. 실패(요금제 한도 등) 시 토스트.
  const onAddFavorite = async (v: LibraryVoice) => {
    setAdding(v.voiceId);
    try {
      const newId = await addLibraryVoice(v.publicOwnerId, v.voiceId, v.name);
      await setVoiceFavorite(newId, true);
      setAdded((prev) => new Set(prev).add(v.voiceId));
      setFavIds((prev) => new Set(prev).add(newId));
      toast(
        `'${v.name}'을(를) 내 보이스에 추가하고 즐겨찾기했어요. 강의 패널 ‘즐겨찾기만’에서 고를 수 있어요.`,
        "success",
      );
    } catch {
      toast(
        "추가에 실패했어요. 요금제의 보이스 수 한도를 초과했을 수 있어요.",
        "error",
      );
    } finally {
      setAdding(null);
    }
  };

  if (loading) {
    return <LoadingSpinner fullScreen label="음성 목록을 불러오는 중…" />;
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="음성 라이브러리"
        title="음성 고르기"
        subtitle="‘라이브러리’ 탭에서 ElevenLabs 전체 음성을 검색·미리듣고, ★로 ‘내 보이스에 추가+즐겨찾기’ 하세요. 즐겨찾기한 음성은 강의 만들기 화면의 ‘즐겨찾기만’에서 바로 고를 수 있어요."
        actions={
          <div className="flex flex-wrap gap-2">
            {lectureId && (
              <Link
                href={`/professor/studio/${lectureId}`}
                style={{ ...linkBtnStyle, borderColor: SKY, color: SKY_TEXT, background: SKY_SOFT }}
              >
                ← 강의 편집으로
              </Link>
            )}
            <Link href="/professor/studio" style={linkBtnStyle}>
              스튜디오
            </Link>
            <Link href="/professor/dashboard" style={linkBtnStyle}>
              대시보드
            </Link>
          </div>
        }
      />

      <div className="flex gap-2" style={{ marginBottom: 18 }}>
        <button
          type="button"
          onClick={() => setMode("mine")}
          aria-pressed={mode === "mine"}
          style={tabBtn(mode === "mine")}
        >
          내 보이스
        </button>
        <button
          type="button"
          onClick={goLibrary}
          aria-pressed={mode === "library"}
          style={tabBtn(mode === "library")}
        >
          라이브러리 둘러보기
        </button>
      </div>

      {mode === "mine" ? (
        <>
          {deferred && (
            <p role="status" style={noticeStyle}>
              ElevenLabs 보이스 목록을 불러오지 못해 미리보기용 기본 음성을 보여주고
              있어요. (즐겨찾기는 실제 보이스에서만 저장됩니다.)
            </p>
          )}
          <div className="flex flex-wrap gap-2" style={{ marginBottom: 18 }}>
            {MINE_FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setMineFilter(f.key)}
                aria-pressed={mineFilter === f.key}
                style={chipBtn(mineFilter === f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {mineShown.length === 0 ? (
            <p style={emptyStyle}>
              {mineFilter === "favorites"
                ? "아직 즐겨찾기한 음성이 없어요. ‘라이브러리 둘러보기’에서 ★로 추가하세요."
                : "표시할 음성이 없습니다."}
            </p>
          ) : (
            <div style={gridStyle}>
              {mineShown.map((v) => (
                <VoiceCard
                  key={v.id}
                  reduced={reduced}
                  title={v.name}
                  meta={v.meta ?? null}
                  genderLabel={v.gender === "male" ? "남성" : "여성"}
                  playing={playingId === v.id}
                  canPreview={supported}
                  onPreview={() => previewOption(v)}
                  favorite={favIds.has(v.id)}
                  canFavorite={!isFallbackVoice(v.id)}
                  onToggleFavorite={() => toggleFavorite(v.id, isFallbackVoice(v.id))}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div
            className="flex flex-wrap items-center gap-2"
            style={{ marginBottom: 16 }}
          >
            <input
              value={libSearch}
              onChange={(e) => setLibSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSearch();
              }}
              placeholder="검색: 남성 / 여성 / 미국·영국·한국 등, 또는 영어 키워드"
              aria-label="라이브러리 음성 검색 (남성/여성/국가 가능)"
              style={searchStyle}
            />
            <button type="button" onClick={onSearch} style={searchBtnStyle}>
              검색
            </button>
            {([
              { key: "" as const, label: "전체" },
              { key: "male" as const, label: "남성" },
              { key: "female" as const, label: "여성" },
            ]).map((g) => (
              <button
                key={g.key || "all"}
                type="button"
                onClick={() => onPickGender(g.key)}
                aria-pressed={(libQuery.gender ?? "") === g.key}
                style={chipBtn((libQuery.gender ?? "") === g.key)}
              >
                {g.label}
              </button>
            ))}
          </div>

          {libLoading && lib.length === 0 ? (
            <p style={emptyStyle}>라이브러리를 불러오는 중…</p>
          ) : lib.length === 0 ? (
            <p style={emptyStyle}>조건에 맞는 음성이 없어요. 검색어를 바꿔보세요.</p>
          ) : (
            <>
              <div style={gridStyle}>
                {lib.map((v) => {
                  const meta = [v.descriptionKo, v.accentKo]
                    .filter((x): x is string => !!x)
                    .join(" · ");
                  const opt: VoiceOption = {
                    id: v.voiceId,
                    name: v.name,
                    gender: v.genderKo === "남성" ? "male" : "female",
                    previewUrl: v.previewUrl,
                    meta,
                  };
                  return (
                    <VoiceCard
                      key={v.voiceId}
                      reduced={reduced}
                      title={v.name}
                      meta={meta || null}
                      genderLabel={v.genderKo ?? "음성"}
                      playing={playingId === v.voiceId}
                      canPreview={supported && !!v.previewUrl}
                      onPreview={() => previewOption(opt)}
                      addState={
                        added.has(v.voiceId)
                          ? "added"
                          : adding === v.voiceId
                            ? "adding"
                            : "idle"
                      }
                      onAddFavorite={() => onAddFavorite(v)}
                    />
                  );
                })}
              </div>
              {libHasMore && (
                <div className="flex justify-center" style={{ marginTop: 18 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setLibLoading(true);
                      setLibQuery((q) => ({ ...q, page: (q.page ?? 0) + 1 }));
                    }}
                    disabled={libLoading}
                    style={{
                      ...searchBtnStyle,
                      opacity: libLoading ? 0.6 : 1,
                      cursor: libLoading ? "wait" : "pointer",
                    }}
                  >
                    {libLoading ? "불러오는 중…" : "더 보기"}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </PageContainer>
  );
}

type AddState = "idle" | "adding" | "added";

function VoiceCard({
  reduced,
  title,
  meta,
  genderLabel,
  playing,
  canPreview,
  onPreview,
  favorite,
  canFavorite,
  onToggleFavorite,
  addState,
  onAddFavorite,
}: {
  reduced: boolean;
  title: string;
  meta: string | null;
  genderLabel: string;
  playing: boolean;
  canPreview: boolean;
  onPreview: () => void;
  // 내 보이스 모드: ★ 토글
  favorite?: boolean;
  canFavorite?: boolean;
  onToggleFavorite?: () => void;
  // 라이브러리 모드: ★ = 추가 + 즐겨찾기
  addState?: AddState;
  onAddFavorite?: () => void;
}) {
  const [hover, setHover] = useState(false);
  const lifted = hover && !reduced;
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative",
        background: "var(--bg-card)",
        border: "1px solid",
        borderColor: lifted ? SKY : "var(--line)",
        borderTop: `3px solid ${SKY}`,
        borderRadius: 14,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        transform: lifted ? "translateY(-4px)" : "translateY(0)",
        boxShadow: lifted ? "0 12px 28px rgba(14,165,233,0.22)" : "var(--shadow-sm)",
        transition:
          "transform 180ms var(--ease-out), box-shadow 180ms var(--ease-out), border-color 180ms var(--ease-out)",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {title}
          </div>
          {meta && (
            <div
              style={{
                fontSize: 11.5,
                color: "var(--text-subtle)",
                marginTop: 3,
                lineHeight: 1.45,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {meta}
            </div>
          )}
        </div>
        <span
          style={{
            flexShrink: 0,
            fontSize: 10,
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: 999,
            background: SKY_SOFT,
            color: SKY_TEXT,
          }}
        >
          {genderLabel}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPreview}
          disabled={!canPreview}
          style={{
            ...pillBtn,
            opacity: canPreview ? 1 : 0.5,
            cursor: canPreview ? "pointer" : "not-allowed",
          }}
        >
          {playing ? "■ 정지" : "▶ 미리듣기"}
        </button>
        <span style={{ flex: 1 }} />

        {onAddFavorite ? (
          <button
            type="button"
            onClick={onAddFavorite}
            disabled={addState !== "idle"}
            style={{
              ...pillBtn,
              borderColor: addState === "added" ? SKY : "var(--line-strong)",
              background: addState === "added" ? SKY_SOFT : "var(--bg-card)",
              color: addState === "added" ? SKY_TEXT : "var(--text)",
              cursor: addState === "idle" ? "pointer" : "default",
            }}
          >
            {addState === "added"
              ? "★ 추가됨"
              : addState === "adding"
                ? "추가 중…"
                : "★ 내 보이스에 추가"}
          </button>
        ) : (
          <button
            type="button"
            onClick={onToggleFavorite}
            disabled={!canFavorite}
            aria-pressed={!!favorite}
            aria-label={favorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
            title={
              canFavorite
                ? favorite
                  ? "즐겨찾기 해제"
                  : "즐겨찾기 추가"
                : "기본 음성은 즐겨찾기할 수 없어요"
            }
            style={{
              flexShrink: 0,
              display: "inline-grid",
              placeItems: "center",
              width: 34,
              height: 34,
              borderRadius: 9,
              border: "1px solid",
              borderColor: favorite ? SKY : "var(--line-strong)",
              background: favorite ? SKY_SOFT : "var(--bg-card)",
              color: favorite ? SKY_TEXT : "var(--text-faint)",
              cursor: canFavorite ? "pointer" : "not-allowed",
              opacity: canFavorite ? 1 : 0.4,
              fontSize: 16,
              lineHeight: 1,
            }}
          >
            {favorite ? "★" : "☆"}
          </button>
        )}
      </div>
    </div>
  );
}

function tabBtn(active: boolean): CSSProperties {
  return {
    padding: "8px 16px",
    fontSize: 13,
    fontWeight: 700,
    borderRadius: 10,
    border: "1px solid",
    borderColor: active ? "var(--gold)" : "var(--line-strong)",
    background: active ? "var(--gold)" : "var(--bg-card)",
    color: active ? "#0A0A0A" : "var(--text-muted)",
    cursor: "pointer",
    fontFamily: "inherit",
  };
}

function chipBtn(active: boolean): CSSProperties {
  return {
    padding: "6px 14px",
    fontSize: 12.5,
    fontWeight: 600,
    borderRadius: 999,
    border: "1px solid",
    borderColor: active ? "var(--gold)" : "var(--line-strong)",
    background: active ? "var(--gold)" : "var(--bg-card)",
    color: active ? "#0A0A0A" : "var(--text-muted)",
    cursor: "pointer",
    fontFamily: "inherit",
  };
}

const linkBtnStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 14px",
  borderRadius: 9,
  border: "1px solid var(--line-strong)",
  background: "var(--bg-card)",
  color: "var(--text)",
  fontSize: 13,
  fontWeight: 600,
  textDecoration: "none",
};

const searchStyle: CSSProperties = {
  flex: "1 1 260px",
  minWidth: 0,
  padding: "9px 12px",
  fontSize: 13,
  borderRadius: 9,
  border: "1px solid var(--line-strong)",
  background: "var(--bg-card)",
  color: "var(--text)",
  fontFamily: "inherit",
};

const searchBtnStyle: CSSProperties = {
  padding: "9px 16px",
  fontSize: 13,
  fontWeight: 700,
  borderRadius: 9,
  border: "1px solid var(--gold)",
  background: "var(--gold-soft)",
  color: "var(--gold-on-light, #B88308)",
  cursor: "pointer",
  fontFamily: "inherit",
};

const noticeStyle: CSSProperties = {
  margin: "0 0 16px",
  padding: "10px 14px",
  borderRadius: 10,
  background: "var(--gold-soft)",
  color: "var(--gold-on-light, #B88308)",
  fontSize: 12.5,
  lineHeight: 1.5,
};

const emptyStyle: CSSProperties = { fontSize: 13, color: "var(--text-muted)" };

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))",
  gap: 12,
};

const pillBtn: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "7px 12px",
  borderRadius: 8,
  border: "1px solid var(--line-strong)",
  background: "var(--bg-card)",
  fontSize: 12.5,
  fontWeight: 600,
  color: "var(--text)",
  fontFamily: "inherit",
};
