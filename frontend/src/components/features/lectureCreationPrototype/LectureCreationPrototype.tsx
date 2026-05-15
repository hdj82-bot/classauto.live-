"use client";

/**
 * `/features` — 강의 제작 인터랙티브 프로토타입의 React 재구현.
 *
 * 디자인 근거: docs/prototypes/05-lecture-creation.extracted.html (standalone).
 * 기존 iframe 임베드를 대체. 마크업은 markup.ts 의 정적 문자열을 1회 주입하고,
 * 원본 standalone 의 vanilla-JS 3종(메인 스크립트 + gallery + interview)을
 * React effect 안의 컨트롤러로 그대로 포팅했다. 원본 자체가 innerHTML/DOM
 * 명령형 구조라 충실도(fidelity)를 위해 동일 패턴을 유지한다.
 *
 * - localStorage 미사용 (CLAUDE.md 준수). 모든 상태는 클로저/DOM 로컬.
 * - 원본의 `body.X` 클래스 토글은 `.lc-root` 래퍼로 이전 (CSS 네임스페이스).
 * - 타이머/리스너는 cleanup 에서 모두 해제.
 * - prefers-reduced-motion 은 CSS 미디어쿼리 + confetti 가드로 대응.
 */

import { useEffect, useRef } from "react";
import "./lectureCreation.css";
import { PROTOTYPE_HTML } from "./markup";
import {
  SLIDES,
  AVATARS,
  AVATAR_FILTERS,
  VOICES,
  VOICE_FILTERS,
  han,
  type Avatar,
  type Voice,
} from "./data";

const QR_TARGET_URL = "https://classauto.live/v/abc123XYZ";

const ICO = {
  sparkle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z"/><path d="M19 14l.7 1.8L21.5 16.5l-1.8.7L19 19l-.7-1.8L16.5 16.5l1.8-.7z"/></svg>`,
  bulb: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.7.5 1 1.3 1 2.1V18h6v-1.2c0-.8.3-1.6 1-2.1A7 7 0 0 0 12 2z"/></svg>`,
  arrow: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>`,
  listSparkle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.5 3.5L17 8l-3.5 1.5L12 13l-1.5-3.5L7 8l3.5-1.5z"/><path d="M5 17h14"/><path d="M5 21h14"/></svg>`,
  warn: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
  smile: `<svg viewBox="0 0 24 24" fill="none" stroke="url(#grad-electric)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><circle cx="9" cy="10" r="0.6" fill="currentColor" stroke="none"/><circle cx="15" cy="10" r="0.6" fill="currentColor" stroke="none"/></svg>`,
  cap: `<svg viewBox="0 0 24 24" fill="none" stroke="url(#grad-violet)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c2 1 4 2 6 2s4-1 6-2v-5"/></svg>`,
  spark: `<svg viewBox="0 0 24 24" fill="none" stroke="url(#grad-electric)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h8l-1 8 10-12h-8l1-8z"/></svg>`,
  moon: `<svg viewBox="0 0 24 24" fill="none" stroke="url(#grad-cyan)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
  persona: (color: string) =>
    `<svg class="persona" viewBox="0 0 100 100" fill="none" aria-hidden="true"><circle cx="50" cy="38" r="16" fill="${color}"/><path d="M18 92c0-18 14-32 32-32s32 14 32 32" fill="${color}"/></svg>`,
};

const esc = (s: unknown) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );

function reducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export default function LectureCreationPrototype() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    // ── helpers scoped to the root (replaces document.* in the original) ──
    const $ = <T extends Element = HTMLElement>(sel: string) =>
      root.querySelector<T>(sel);
    const $$ = <T extends Element = HTMLElement>(sel: string) =>
      Array.from(root.querySelectorAll<T>(sel));
    const byId = <T extends HTMLElement = HTMLElement>(id: string) =>
      root.querySelector<T>(`#${CSS.escape(id)}`);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const intervals = new Set<ReturnType<typeof setInterval>>();
    let disposed = false;
    const after = (fn: () => void, ms: number) => {
      const t = setTimeout(() => {
        timers.delete(t);
        if (!disposed) fn();
      }, ms);
      timers.add(t);
      return t;
    };
    const every = (fn: () => void, ms: number) => {
      const t = setInterval(() => {
        if (!disposed) fn();
      }, ms);
      intervals.add(t);
      return t;
    };

    // body.X -> root.classList (CSS namespaced to .lc-root.X)
    const bodyAdd = (...c: string[]) => root.classList.add(...c);
    const bodyRemove = (...c: string[]) => root.classList.remove(...c);
    const bodyToggle = (c: string, force?: boolean) =>
      root.classList.toggle(c, force);
    const bodyHas = (c: string) => root.classList.contains(c);

    // ───────────────────────── Slides (main script) ─────────────────────────
    const slides = SLIDES.map((s) => ({ ...s })); // local mutable copy
    let activeSlide = 3;

    function statusSvg(s: string) {
      if (s === "adopted")
        return '<svg viewBox="0 0 24 24" class="status-adopted"><circle cx="12" cy="12" r="6"/></svg>';
      if (s === "warn")
        return '<svg viewBox="0 0 24 24" class="status-warn" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
      return '<svg viewBox="0 0 24 24" class="status-empty"><circle cx="12" cy="12" r="6"/></svg>';
    }

    function renderSlides() {
      const list = byId("slide-list");
      if (!list) return;
      list.innerHTML = slides
        .map(
          (s) => `
      <div class="slide-card ${s.n === activeSlide ? "active" : ""}" data-n="${s.n}" data-slide-pick="${s.n}">
        <div class="thumb"><span class="han">${s.hanThumb}</span></div>
        <div class="body">
          <div class="num">SLIDE ${String(s.n).padStart(2, "0")}</div>
          <div class="name">${s.title}</div>
        </div>
        <span class="status" title="${s.status}">${statusSvg(s.status)}</span>
      </div>`
        )
        .join("");
    }

    function selectSlide(n: number) {
      activeSlide = Math.max(1, Math.min(slides.length, n));
      const s = slides[activeSlide - 1];
      renderSlides();
      const set = (id: string, v: string) => {
        const el = byId(id);
        if (el) el.textContent = v;
      };
      set("cur-slide-num", String(activeSlide));
      set("cur-slide-title", s.title);
      set("bar-cur", String(activeSlide));
      set(
        "bar-adopted",
        String(slides.filter((x) => x.status === "adopted").length)
      );
      const mock = byId("slide-mock");
      if (mock)
        mock.innerHTML = `
      <span class="badge">${s.badge}</span>
      <h1>${s.heading}</h1>
      <p class="sub">${s.sub}</p>
      <div class="body-cols">${s.body}</div>`;
      const orig = byId("orig-text");
      if (orig) orig.innerHTML = s.orig;
      const ai = byId("ai-text");
      if (ai) ai.innerHTML = s.ai;
      const meta = $(".script-head .meta");
      if (meta) meta.textContent = s.meta;
      bodyRemove("drawer-slides-open");
    }
    const navSlide = (d: number) => selectSlide(activeSlide + d);

    // ───────────────────────── Screen routing ─────────────────────────
    function goto(n: number, fromUpload?: boolean) {
      $$<HTMLElement>(".screen").forEach((el) => {
        el.classList.toggle("active", +(el.dataset.screen ?? "0") === n);
      });
      $$<HTMLElement>(".demo-nav-btn[data-go]").forEach((b) => {
        b.classList.toggle("active", +(b.dataset.go ?? "0") === n);
      });
      bodyToggle("show-iv-dev", n === 2);
      if (n === 1 && fromUpload) resetUpload();
      if (n === 3) selectSlide(activeSlide);
    }

    // ───────────────────────── Upload simulation ─────────────────────────
    let uploadTimer: ReturnType<typeof setTimeout> | null = null;
    function startUpload() {
      const dz = byId("dropzone");
      if (dz) dz.style.display = "none";
      byId("upload-progress")?.classList.add("show");
      runUploadSequence();
    }
    function resetUpload() {
      if (uploadTimer) {
        clearTimeout(uploadTimer);
        timers.delete(uploadTimer);
        uploadTimer = null;
      }
      const dz = byId("dropzone");
      if (dz) dz.style.display = "";
      byId("upload-progress")?.classList.remove("show");
      const pbar = byId("pbar");
      if (pbar) pbar.style.width = "0%";
      const setT = (id: string, v: string) => {
        const e = byId(id);
        if (e) e.textContent = v;
      };
      setT("up-pct", "0%");
      setT("up-size", "0.0");
      const wb = byId<HTMLButtonElement>("wizard-start-btn");
      if (wb) wb.disabled = true;
      ["step-1", "step-2", "step-3", "step-4"].forEach((id) =>
        byId(id)?.classList.remove("active", "done")
      );
      setT("step-3-detail", "예상 12초");
    }
    function setStep(id: string, state: "" | "active" | "done") {
      const el = byId(id);
      if (!el) return;
      el.classList.remove("active", "done");
      if (state) el.classList.add(state);
    }
    function runUploadSequence() {
      let pct = 0;
      const pbar = byId("pbar");
      const pctEl = byId("up-pct");
      const sizeEl = byId("up-size");
      const tick = () => {
        pct = Math.min(100, pct + (8 + Math.random() * 9));
        if (pbar) pbar.style.width = pct + "%";
        if (pctEl) pctEl.textContent = Math.floor(pct) + "%";
        if (sizeEl) sizeEl.textContent = ((pct / 100) * 12.4).toFixed(1);
        if (pct < 100) {
          uploadTimer = after(tick, 140);
        } else {
          setStep("step-1", "active");
          uploadTimer = after(() => {
            setStep("step-1", "done");
            setStep("step-2", "active");
          }, 700);
          uploadTimer = after(() => {
            setStep("step-2", "done");
            setStep("step-3", "active");
          }, 1500);
          let t = 12;
          const cd = every(() => {
            t -= 1;
            const d = byId("step-3-detail");
            if (d) d.textContent = t > 0 ? "예상 " + t + "초" : "완료";
            if (t <= 0) {
              clearInterval(cd);
              intervals.delete(cd);
            }
          }, 280);
          uploadTimer = after(() => {
            setStep("step-3", "done");
            setStep("step-4", "active");
          }, 4900);
          uploadTimer = after(() => {
            setStep("step-4", "done");
            const wb = byId<HTMLButtonElement>("wizard-start-btn");
            if (wb) wb.disabled = false;
          }, 5700);
        }
      };
      tick();
    }

    // ───────────────────────── Generation modal ─────────────────────────
    let genPct = 47;
    let genTimer: ReturnType<typeof setInterval> | null = null;

    function openGenModal() {
      bodyAdd("gen-modal-open");
      bodyRemove("gen-bg", "gen-done");
      $$<HTMLElement>(".demo-nav-btn[data-go]").forEach((b) =>
        b.classList.toggle("active", b.dataset.go === "4")
      );
      startGenSim();
    }
    function stopGenSim() {
      if (genTimer) {
        clearInterval(genTimer);
        intervals.delete(genTimer);
        genTimer = null;
      }
    }
    function startGenSim() {
      stopGenSim();
      genTimer = every(() => {
        if (bodyHas("gen-done")) return;
        updateGenUI(genPct);
      }, 1000);
    }
    function setGenPct(pct: number) {
      genPct = Math.max(0, Math.min(100, pct));
      if (genPct >= 100) {
        completeGen();
        return;
      }
      updateGenUI(genPct);
    }
    function formatEta(seconds: number) {
      seconds = Math.max(0, Math.round(seconds));
      if (seconds < 60) return seconds + "초";
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return m + "분 " + String(s).padStart(2, "0") + "초";
    }
    function updateGenUI(pct: number) {
      const fill = byId("ring-fill");
      const circ = 440;
      if (fill)
        (fill as unknown as SVGElement).setAttribute(
          "style",
          `stroke-dashoffset:${circ * (1 - pct / 100)}`
        );
      const set = (id: string, v: string) => {
        const e = byId(id);
        if (e) e.textContent = v;
      };
      set("gen-pct", String(Math.round(pct)));
      set("gen-widget-pct", String(Math.round(pct)));
      const stages = $$<HTMLElement>(".gen-stage");
      const setStage = (i: number, state: string) =>
        stages[i]?.setAttribute("data-state", state);
      setStage(0, "done");
      if (pct < 55) {
        setStage(1, "active");
        setStage(2, "pending");
        setStage(3, "pending");
        const sp = Math.max(0, Math.min(100, ((pct - 10) / 45) * 100));
        const slidesDone = Math.round((sp / 100) * 24);
        set("tts-cur", String(slidesDone));
        set("tts-pct", String(Math.round(sp)));
        const bar = byId("tts-bar");
        if (bar) bar.style.width = sp + "%";
        set("tts-eta", formatEta((100 - pct) * 5.5));
      } else if (pct < 85) {
        setStage(1, "done");
        setStage(2, "active");
        setStage(3, "pending");
        const d = stages[2]?.querySelector<HTMLElement>(".stage-detail");
        if (d)
          d.textContent =
            "슬라이드 " + Math.min(8, Math.ceil(((pct - 55) / 30) * 8)) + " / 8 합성 중";
      } else {
        setStage(1, "done");
        setStage(2, "done");
        setStage(3, "active");
        const d = stages[3]?.querySelector<HTMLElement>(".stage-detail");
        if (d)
          d.textContent = "인코딩 " + Math.round(((pct - 85) / 15) * 100) + "%";
      }
      set("gen-eta", formatEta((100 - pct) * 5.5));
      const slidesProg = Math.min(8, Math.ceil((pct / 100) * 8));
      set("prog-slides", String(slidesProg));
      set("prog-slides-pct", String(Math.round((slidesProg / 8) * 100)));
    }
    function completeGen() {
      genPct = 100;
      stopGenSim();
      bodyAdd("gen-done");
      bodyRemove("gen-bg");
      $$<HTMLElement>(".gen-stage").forEach((s) =>
        s.setAttribute("data-state", "done")
      );
      $$<HTMLElement>(".gen-stage .stage-time").forEach((t, i) => {
        t.textContent = ["0초", "3분 12초", "3분 48초", "32초"][i];
      });
      $$<HTMLElement>(".gen-stage .stage-detail").forEach((d, i) => {
        if (i === 1) d.textContent = "24 / 24 슬라이드";
        if (i === 2) d.textContent = "8 / 8 슬라이드 합성 완료";
        if (i === 3) d.textContent = "인코딩 완료 · 5분 12초";
      });
      $$<HTMLElement>(".gen-stage .stage-live").forEach(
        (e) => (e.style.display = "none")
      );
      $$<HTMLElement>(".gen-stage .stage-progressbar").forEach(
        (e) => (e.style.display = "none")
      );
      byId("gen-ring")?.classList.add("done");
      const h = byId("gen-h1");
      if (h) h.textContent = "영상이 완성되었어요!";
      const ar = byId("gen-actions-running");
      if (ar) ar.style.display = "none";
      const ad = byId("gen-actions-done");
      if (ad) ad.style.display = "flex";
      spawnConfetti();
    }
    function spawnConfetti() {
      if (reducedMotion()) return;
      const c = $(".gen-confetti");
      if (!c) return;
      c.innerHTML = "";
      const colors = ["#FFB627", "#E89E0E", "#B88308", "#10B981", "#8B5CF6"];
      for (let i = 0; i < 50; i++) {
        const piece = document.createElement("i");
        piece.style.left = Math.random() * 100 + "%";
        piece.style.background = colors[i % colors.length];
        piece.style.animationDelay = Math.random() * 0.6 + "s";
        piece.style.transform = "rotate(" + Math.random() * 360 + "deg)";
        c.appendChild(piece);
      }
      after(() => {
        c.innerHTML = "";
      }, 5000);
    }
    function minimizeGen() {
      bodyAdd("gen-bg");
      bodyRemove("gen-modal-open");
    }
    function expandGen() {
      bodyAdd("gen-modal-open");
      bodyRemove("gen-bg");
    }

    // ───────────────────────── Done & Share ─────────────────────────
    function qrSrc(theme: string) {
      const fg = theme === "dark" ? "FFB627" : "B88308";
      const bg = theme === "dark" ? "0A0A0A" : "FFFFFF";
      const data = encodeURIComponent(QR_TARGET_URL);
      return (
        "https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=8&qzone=2&ecc=H&format=png&data=" +
        data +
        "&color=" +
        fg +
        "&bgcolor=" +
        bg
      );
    }
    function gotoDone() {
      bodyRemove("gen-modal-open", "gen-bg");
      goto(5);
      const img = byId<HTMLImageElement>("qr-img");
      if (img && !img.src) img.src = qrSrc("light");
      after(() => {
        const p = $<HTMLElement>(".video-card-overlays .vc-progress span");
        if (p) p.style.width = "32%";
      }, 600);
    }
    function openQR() {
      const img = byId<HTMLImageElement>("qr-img");
      if (img && !img.src) img.src = qrSrc("light");
      bodyAdd("qr-open");
    }
    function closeQR() {
      bodyRemove("qr-open");
    }
    function setQRTheme(t: string) {
      byId("qr-box")?.classList.toggle("dark", t === "dark");
      $$<HTMLElement>(".qr-toggle button").forEach((b) =>
        b.classList.toggle("active", b.dataset.qrTheme === t)
      );
      const img = byId<HTMLImageElement>("qr-img");
      if (img) img.src = qrSrc(t);
    }
    let toastTimer: ReturnType<typeof setTimeout> | null = null;
    function showToast(msg?: string) {
      const t = byId("share-toast");
      const m = byId("toast-msg");
      if (m) m.textContent = msg || "URL이 복사되었어요";
      t?.classList.add("show");
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = after(() => t?.classList.remove("show"), 2400);
    }
    function copyShareUrl() {
      if (navigator.clipboard)
        navigator.clipboard.writeText(QR_TARGET_URL).catch(() => {});
      showToast("URL이 복사되었어요");
    }

    const COMPOSER_TEMPLATES: Record<
      string,
      { icon: string; title: string; sub: string; body: string; cta: string }
    > = {
      email: {
        icon: '<svg viewBox="0 0 24 24" fill="none"><defs><linearGradient id="co-em" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3B82F6"/><stop offset="1" stop-color="#1D4ED8"/></linearGradient></defs><rect x="3" y="5" width="18" height="14" rx="2" fill="url(#co-em)"/><path d="M4 7 L12 13 L20 7" stroke="#FFFFFF" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>',
        title: "이메일로 공유",
        sub: "학생들에게 강의 영상 안내 메일을 보냅니다",
        body: '<div class="clab">받는 사람</div><input class="cinput" type="text" placeholder="학생 이메일 또는 그룹 (쉼표로 구분)" value="중국어문법의이해@kyonggi.ac.kr"/><div class="clab">제목</div><input class="cinput" type="text" value="[중국어문법의 이해 3주차] 把자문(把字句) 입문 영상"/><div class="clab">본문</div><textarea class="carea">안녕하세요, 하두진입니다.\n\n중국어문법의 이해 3주차 강의 영상 "把자문(把字句) 입문"이 준비되었습니다.\n\n▶ 시청 링크: https://classauto.live/v/abc123XYZ\n▶ 학습 코드: ABCD-1234\n▶ 영상 길이: 5분 12초\n\n학교 이메일(.ac.kr)로 로그인 후 시청해주세요.</textarea>',
        cta: "메일 보내기",
      },
      kakao: {
        icon: '<svg viewBox="0 0 24 24" fill="none"><defs><linearGradient id="co-kk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FEE500"/><stop offset="1" stop-color="#F4D200"/></linearGradient></defs><ellipse cx="12" cy="11" rx="9" ry="7" fill="url(#co-kk)"/><polygon points="8 16 10 21 13 17" fill="url(#co-kk)"/></svg>',
        title: "카카오톡으로 공유",
        sub: "카카오링크 카드 미리보기",
        body: '<div class="cprev"><div style="width: 100%; aspect-ratio: 16/9; border-radius: 8px; background: radial-gradient(circle at 30% 30%, rgba(255,182,39,0.16), transparent 50%), linear-gradient(135deg, #1A1A1A, #0A0A0A); margin-bottom: 12px; display: flex; align-items: center; justify-content: center; color: #FFB627; font-family: serif; font-weight: 700; font-size: 32px;">把</div><div class="ptitle">把자문(把字句) 입문</div><div>경기대학교 · 중국어문법의 이해 · 3주차 · 5분 12초</div><div class="purl">classauto.live/v/abc123XYZ</div></div><div class="clab">친구 선택</div><input class="cinput" type="text" placeholder="이름 또는 그룹 검색" value="중국어문법 3주차 (38명)"/>',
        cta: "카카오톡으로 보내기",
      },
      x: {
        icon: '<svg viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="5" fill="#0A0A0A"/><path d="M7 7 L17 17 M7 17 L17 7" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round"/></svg>',
        title: "X로 공유",
        sub: "공개 강의 트윗 카드",
        body: '<div class="cprev"><div class="ptitle">把자문(把字句) 입문</div><div>경기대학교 · 중국어문법의 이해 · 하두진 교수</div><div class="purl">classauto.live/v/abc123XYZ</div></div><div class="clab">트윗 본문 (280자)</div><textarea class="carea" style="min-height: 100px">把자문(把字句) 입문 강의를 공개했습니다. 중국어의 처치 의미를 강조하는 특수 구문을 5분에 정리했어요.\n\n#중국어 #把字句 #ClassAuto\nhttps://classauto.live/v/abc123XYZ</textarea>',
        cta: "트윗 게시",
      },
      sms: {
        icon: '<svg viewBox="0 0 24 24" fill="none"><defs><linearGradient id="co-sm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#06B6D4"/><stop offset="1" stop-color="#0891B2"/></linearGradient></defs><rect x="6" y="3" width="12" height="18" rx="2" fill="url(#co-sm)"/><rect x="7.5" y="5" width="9" height="12" fill="#FFFFFF"/></svg>',
        title: "문자(SMS)로 공유",
        sub: "학생 휴대폰 번호로 안내 문자 발송",
        body: '<div class="clab">받는 사람</div><input class="cinput" type="text" placeholder="학생 번호 또는 그룹" value="중국어문법 3주차 그룹 (38명)"/><div class="clab">메시지</div><textarea class="carea" style="min-height: 110px">[중국어문법의 이해 3주차] 把자문 강의 영상이 준비되었습니다.\n시청: https://classauto.live/v/abc123XYZ\n코드: ABCD-1234</textarea><div style="font-size: 11px; color: var(--text-muted); margin-top: -4px;">총 78자 / 2건 (LMS 발송)</div>',
        cta: "SMS 발송",
      },
    };
    function openComposer(kind: string) {
      const tpl = COMPOSER_TEMPLATES[kind];
      if (!tpl) return;
      const cb = byId("composer-body");
      if (cb)
        cb.innerHTML =
          '<div class="ch">' +
          tpl.icon +
          tpl.title +
          "</div>" +
          '<div class="csub">' +
          tpl.sub +
          "</div>" +
          tpl.body +
          '<div class="composer-foot"><button class="btn" type="button" data-act="close-composer">취소</button><button class="btn primary" type="button" data-act="composer-send" data-cta="' +
          esc(tpl.cta) +
          '">' +
          tpl.cta +
          "</button></div>";
      bodyAdd("composer-open");
    }
    function closeComposer() {
      bodyRemove("composer-open");
    }

    // ── Script-action buttons (채택/거부/수동편집/다시생성) ──
    function regenScript(rejected: boolean) {
      const aiText = byId("ai-text");
      if (!aiText || aiText.dataset.editing === "y") return;
      const slide = slides[activeSlide - 1];
      if (!slide) return;
      aiText.innerHTML = `<div style="display:flex; align-items:center; gap:10px; color:var(--text-muted); padding:18px 4px; font-size:13.5px;"><span style="width:14px; height:14px; border:2px solid var(--gold); border-top-color:transparent; border-radius:999px; display:inline-block; animation: ivsSpin 0.9s linear infinite;"></span>AI가 다시 작성 중입니다…</div>`;
      after(() => {
        const variants = [
          (s: string) => `${s}`.replace("이번에는", "먼저"),
          (s: string) => `좋습니다, 다시 정리해볼게요. ${s}`,
          (s: string) => `${s} (재생성된 버전)`,
        ];
        const pick = variants[Math.floor(Math.random() * variants.length)];
        slide.ai = pick(slide.ai);
        aiText.innerHTML = slide.ai;
        showToast(
          rejected
            ? `슬라이드 ${activeSlide} 스크립트가 다시 생성되었어요`
            : `슬라이드 ${activeSlide} 새 스크립트가 도착했어요`
        );
      }, 1600);
    }
    function scriptAction(action: string) {
      const aiText = byId("ai-text");
      const n = activeSlide;
      if (action === "accept") {
        const slide = slides[n - 1];
        if (slide && slide.status !== "adopted") {
          slide.status = "adopted";
          renderSlides();
          const ba = byId("bar-adopted");
          if (ba)
            ba.textContent = String(
              slides.filter((x) => x.status === "adopted").length
            );
        }
        showToast(`슬라이드 ${n} 스크립트가 채택되었어요`);
        const card = $(`.slide-card[data-n="${n}"]`);
        if (card) {
          card.classList.add("flash");
          after(() => card.classList.remove("flash"), 900);
        }
        after(() => {
          if (n < slides.length) selectSlide(n + 1);
        }, 900);
      } else if (action === "reject") {
        showToast(`슬라이드 ${n} 스크립트를 다시 생성하는 중…`);
        regenScript(true);
      } else if (action === "edit") {
        if (!aiText || aiText.dataset.editing === "y") return;
        const original = aiText.innerHTML;
        const plain = (aiText.textContent ?? "").trim();
        aiText.dataset.editing = "y";
        aiText.innerHTML = `<textarea class="ai-edit-area" style="width:100%; min-height:140px; padding:12px 14px; border:1.5px solid var(--gold); border-radius:10px; font-family:inherit; font-size:inherit; line-height:1.65; background:#FFFFFF; color:var(--text); resize:vertical; outline:none; box-shadow: 0 0 0 4px var(--gold-glow);"></textarea><div style="display:flex; gap:8px; margin-top:10px; justify-content:flex-end;"><button class="pill-btn" type="button" data-edit-act="cancel">취소</button><button class="pill-btn accept" type="button" data-edit-act="save">저장</button></div>`;
        const ta = aiText.querySelector("textarea");
        if (ta) {
          ta.value = plain;
          ta.focus();
          ta.setSelectionRange(plain.length, plain.length);
        }
        const cancel = aiText.querySelector<HTMLElement>(
          '[data-edit-act="cancel"]'
        );
        const save = aiText.querySelector<HTMLElement>('[data-edit-act="save"]');
        if (cancel)
          cancel.onclick = () => {
            aiText.innerHTML = original;
            aiText.dataset.editing = "";
          };
        if (save)
          save.onclick = () => {
            const v = (ta?.value ?? "").trim() || plain;
            aiText.textContent = v;
            aiText.dataset.editing = "";
            showToast(`슬라이드 ${n} 스크립트가 저장되었어요`);
          };
      } else if (action === "regenerate") {
        showToast(`슬라이드 ${n} 스크립트를 다시 생성하는 중…`);
        regenScript(false);
      }
    }

    // ───────────────────────── Gallery (gallery.js) ─────────────────────────
    const gstate = {
      avatar: { selected: "kim", applied: "kim", filter: "all", search: "" },
      voice: {
        primary: "yuna",
        secondary: "xiaoming",
        appliedPrimary: "yuna",
        appliedSecondary: "xiaoming",
        tab: "primary",
        ratio: 70,
        filter: "all",
      },
    };
    let voicePreviewTimer: ReturnType<typeof setTimeout> | null = null;
    let voiceToastTimer: ReturnType<typeof setTimeout> | null = null;

    function personaSVG(av: Avatar, size: number) {
      const sz = size || 84;
      const [c1, , c3] = av.gradient;
      const gid = "g-" + av.id + "-" + sz;
      return `<svg class="persona" viewBox="0 0 100 100" width="${sz}" height="${sz}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c1}"></stop><stop offset="100%" stop-color="${c3}"></stop></linearGradient></defs><circle cx="50" cy="38" r="18" fill="${av.skin}"></circle><path d="M30 38 Q30 18 50 18 Q70 18 70 38 L70 30 Q70 24 65 22 Q60 16 50 16 Q40 16 35 22 Q30 24 30 30 Z" fill="${av.hair}"></path><path d="M22 90 Q22 64 50 64 Q78 64 78 90 L78 100 L22 100 Z" fill="url(#${gid})"></path><ellipse cx="44" cy="40" rx="1.6" ry="2.2" fill="#0A0A0A"></ellipse><ellipse cx="56" cy="40" rx="1.6" ry="2.2" fill="#0A0A0A"></ellipse><path d="M45 47 Q50 50 55 47" stroke="#7D5A3D" stroke-width="1.4" stroke-linecap="round" fill="none"></path></svg>`;
    }
    const previewBg = (av: Avatar) =>
      `linear-gradient(135deg, ${av.gradient[0]}33 0%, ${av.gradient[2]}22 100%)`;

    function buildGalleryHTML() {
      return `
<div class="gallery-overlay avatar" id="avatar-gallery" role="dialog" aria-modal="true" aria-labelledby="avatar-gallery-title">
  <div class="gallery-card" data-stop="1">
    <div class="gallery-head">
      <h2 id="avatar-gallery-title">AI 아바타 선택</h2>
      <div class="sub">강의 영상에 등장할 AI 강의자를 선택하세요</div>
      <button class="gallery-close" type="button" data-action="close-avatar" aria-label="닫기"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"></line><line x1="6" y1="18" x2="18" y2="6"></line></svg></button>
    </div>
    <div class="gallery-toolbar">
      <div class="filter-row" id="avatar-filters"></div>
      <div class="search-box">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        <input type="text" id="avatar-search" placeholder="이름·특성 검색...">
      </div>
    </div>
    <div class="gallery-body"><div class="avatar-grid" id="avatar-grid"></div></div>
    <div class="gallery-foot">
      <div class="gallery-foot-info"><div>선택된 아바타</div><div class="selected-label gold-text" id="avatar-foot-name">김교수 페르소나</div></div>
      <button class="btn" type="button" data-action="close-avatar">취소</button>
      <button class="btn primary" type="button" data-action="apply-avatar">선택한 아바타 적용 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path></svg></button>
    </div>
  </div>
</div>
<div class="gallery-overlay voice" id="voice-gallery" role="dialog" aria-modal="true" aria-labelledby="voice-gallery-title">
  <div class="gallery-card" data-stop="1">
    <div class="gallery-head">
      <h2 id="voice-gallery-title">음성 선택 (이중 TTS)</h2>
      <div class="sub">강의 영상에 사용할 두 가지 음성을 선택하세요</div>
      <button class="gallery-close" type="button" data-action="close-voice" aria-label="닫기"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"></line><line x1="6" y1="18" x2="18" y2="6"></line></svg></button>
    </div>
    <div class="voice-tabs">
      <div class="voice-tab-group">
        <button class="voice-tab active" type="button" data-tab="primary">주 음성 <span class="tab-pct" id="vt-pct-primary">70%</span></button>
        <button class="voice-tab" type="button" data-tab="secondary">부 음성 <span class="tab-pct" id="vt-pct-secondary">30%</span></button>
      </div>
      <div class="ratio-control">
        <span class="ratio-label">비율</span>
        <div class="ratio-opts">
          <button class="ratio-opt active" type="button" data-ratio="70">70/30</button>
          <button class="ratio-opt" type="button" data-ratio="60">60/40</button>
          <button class="ratio-opt" type="button" data-ratio="50">50/50</button>
        </div>
      </div>
    </div>
    <div class="gallery-toolbar"><div class="filter-row" id="voice-filters"></div></div>
    <div class="gallery-body"><div class="voice-grid" id="voice-grid"></div></div>
    <div class="gallery-foot">
      <div class="gallery-foot-info">
        <div><span style="color:var(--text-muted);font-weight:600;">주 음성 · </span><span class="gold-text" id="voice-foot-primary">♀ Yuna · 70%</span></div>
        <div><span style="color:var(--text-muted);font-weight:600;">부 음성 · </span><span class="gold-text" id="voice-foot-secondary">♂ Xiaoming · 30%</span></div>
      </div>
      <button class="btn" type="button" data-action="close-voice">취소</button>
      <button class="btn primary" type="button" data-action="apply-voice">선택한 음성 조합 적용 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="M12 5l7 7-7 7"></path></svg></button>
    </div>
  </div>
</div>
<div class="voice-toast" id="voice-toast" role="status" aria-live="polite">
  <span class="vt-glyph" id="vt-toast-glyph">♀</span>
  <span id="vt-toast-msg">음성 재생 중</span>
  <span class="vt-bars" aria-hidden="true"><span></span><span></span><span></span><span></span></span>
</div>`;
    }
    function renderAvatarFilters() {
      const host = byId("avatar-filters");
      if (host)
        host.innerHTML = AVATAR_FILTERS.map(
          (f) =>
            `<button class="filter-chip ${
              f.id === gstate.avatar.filter ? "active" : ""
            }" type="button" data-filter="${f.id}">${f.label}</button>`
        ).join("");
    }
    function renderAvatarGrid() {
      const host = byId("avatar-grid");
      if (!host) return;
      const q = gstate.avatar.search.trim().toLowerCase();
      const fil = gstate.avatar.filter;
      const matches = AVATARS.filter((av) => {
        if (fil !== "all") {
          if (fil === "rec" && !av.rec) return false;
          if (
            fil !== "rec" &&
            !av.langs.includes(fil) &&
            !av.tags.includes(fil)
          )
            return false;
        }
        if (q) {
          const hay = (
            av.name +
            " " +
            av.tags.join(" ") +
            " " +
            av.langs.join(" ") +
            " " +
            av.meta
          ).toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
      if (matches.length === 0) {
        host.innerHTML =
          '<div class="empty-state"><div class="em-title">일치하는 아바타가 없습니다</div><div>필터나 검색어를 조정해 주세요</div></div>';
        return;
      }
      host.innerHTML = matches
        .map((av) => {
          const sel = av.id === gstate.avatar.selected;
          const badges = [
            av.rec ? '<span class="tile-badge rec">추천</span>' : "",
            ...av.tags
              .filter((t) => t !== "추천")
              .slice(0, 2)
              .map((t) => `<span class="tile-badge">${t}</span>`),
          ].join("");
          return `<div class="avatar-tile ${
            sel ? "selected" : ""
          }" data-avatar-id="${av.id}" role="button" tabindex="0"><div class="avatar-tile-img" style="background: ${previewBg(
            av
          )}">${personaSVG(
            av,
            70
          )}<span class="selected-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span></div><div class="avatar-tile-body"><div class="avatar-tile-name">${
            av.name
          }</div><div class="avatar-tile-badges">${badges}</div><div class="avatar-tile-meta">${av.langs.join(
            " · "
          )}</div></div><button class="avatar-tile-preview" type="button" data-preview="${
            av.id
          }"><svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>미리보기</button></div>`;
        })
        .join("");
    }
    function updateAvatarFoot() {
      const av = AVATARS.find((a) => a.id === gstate.avatar.selected);
      const el = byId("avatar-foot-name");
      if (el) el.textContent = av ? av.name : "—";
    }
    function renderVoiceFilters() {
      const host = byId("voice-filters");
      if (host)
        host.innerHTML = VOICE_FILTERS.map(
          (f) =>
            `<button class="filter-chip ${
              f.id === gstate.voice.filter ? "active" : ""
            }" type="button" data-vfilter="${f.id}">${f.label}</button>`
        ).join("");
    }
    function renderVoiceGrid() {
      const host = byId("voice-grid");
      if (!host) return;
      const fil = gstate.voice.filter;
      const matches = VOICES.filter((v) => {
        if (fil === "all") return true;
        if (fil === "f" || fil === "m") return v.gender === fil;
        if (v.lang === fil) return true;
        if (v.tags.includes(fil)) return true;
        return false;
      });
      if (matches.length === 0) {
        host.innerHTML =
          '<div class="empty-state" style="grid-column:1/-1"><div class="em-title">일치하는 음성이 없습니다</div><div>필터를 조정해 주세요</div></div>';
        return;
      }
      host.innerHTML = matches
        .map((v) => {
          const isPrimary = v.id === gstate.voice.primary;
          const isSecondary = v.id === gstate.voice.secondary;
          const glyph = v.gender === "f" ? "♀" : "♂";
          const cls =
            (isPrimary ? "selected-primary " : "") +
            (isSecondary ? "selected-secondary" : "");
          const roleBadge =
            isPrimary && isSecondary
              ? '<span class="voice-tile-role">주+부</span>'
              : isPrimary
              ? '<span class="voice-tile-role">주 음성</span>'
              : isSecondary
              ? '<span class="voice-tile-role">부 음성</span>'
              : "";
          const tags = v.tags
            .map((t) => `<span class="tile-badge">${t}</span>`)
            .join("");
          const selectLabel =
            gstate.voice.tab === "primary"
              ? isPrimary
                ? "주 음성 ✓"
                : "주 음성 선택"
              : isSecondary
              ? "부 음성 ✓"
              : "부 음성 선택";
          return `<div class="voice-tile ${cls}" data-voice-id="${v.id}"><div class="voice-tile-head"><span class="voice-tile-glyph ${
            v.gender
          }">${glyph}</span><div class="voice-tile-headtext"><div class="voice-tile-name">${
            v.name
          } <span style="font-weight:500;color:var(--text-muted);font-size:12px;margin-left:4px;">· ${
            v.lang
          }</span></div><div class="voice-tile-meta">${
            v.meta
          }</div><div class="voice-tile-tags">${tags}</div></div>${
            v.rec ? '<span class="voice-tile-rec">추천</span>' : ""
          }${roleBadge}</div><div class="voice-tile-foot"><button class="voice-tile-preview" type="button" data-vpreview="${
            v.id
          }"><svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>미리듣기</button><button class="voice-tile-select" type="button" data-vselect="${
            v.id
          }">${selectLabel}</button></div></div>`;
        })
        .join("");
    }
    function updateVoiceFoot() {
      const p = VOICES.find((v) => v.id === gstate.voice.primary);
      const s = VOICES.find((v) => v.id === gstate.voice.secondary);
      const pSh = gstate.voice.ratio;
      const sSh = 100 - pSh;
      const set = (id: string, v: string) => {
        const e = byId(id);
        if (e) e.textContent = v;
      };
      set(
        "voice-foot-primary",
        p ? `${p.gender === "f" ? "♀" : "♂"} ${p.name} · ${pSh}%` : "—"
      );
      set(
        "voice-foot-secondary",
        s ? `${s.gender === "f" ? "♀" : "♂"} ${s.name} · ${sSh}%` : "—"
      );
      set("vt-pct-primary", `${pSh}%`);
      set("vt-pct-secondary", `${sSh}%`);
      $$<HTMLElement>(".ratio-opt").forEach((btn) =>
        btn.classList.toggle("active", String(pSh) === btn.dataset.ratio)
      );
      $$<HTMLElement>(".voice-tab").forEach((t) =>
        t.classList.toggle("active", t.dataset.tab === gstate.voice.tab)
      );
    }
    function refreshAvatarCard() {
      const av = AVATARS.find((a) => a.id === gstate.avatar.applied);
      if (!av) return;
      const preview = byId("avatar-card-preview");
      if (preview) {
        preview.style.background = previewBg(av);
        preview.innerHTML = personaSVG(av, 84);
      }
      const n = byId("avatar-card-name");
      if (n) n.textContent = av.name;
      const sub = byId("avatar-card-sub");
      if (sub) sub.textContent = av.meta;
      const sumVal = byId("avatar-picker-card")
        ?.closest("details")
        ?.querySelector<HTMLElement>(".summary-val");
      if (sumVal) sumVal.textContent = av.name.split(" ")[0];
    }
    function refreshVoiceCard() {
      const p = VOICES.find((v) => v.id === gstate.voice.appliedPrimary);
      const s = VOICES.find((v) => v.id === gstate.voice.appliedSecondary);
      if (!p || !s) return;
      const set = (id: string, v: string) => {
        const e = byId(id);
        if (e) e.textContent = v;
      };
      set("voice-glyph-primary", p.gender === "f" ? "♀" : "♂");
      set("voice-name-primary", p.name);
      set("voice-sub-primary", (p.tags[0] || "표준") + " · " + p.lang);
      set("voice-glyph-secondary", s.gender === "f" ? "♀" : "♂");
      set("voice-name-secondary", s.name);
      set("voice-sub-secondary", (s.tags[0] || "표준") + " · " + s.lang);
      set("voice-pct-primary", String(gstate.voice.ratio));
      set("voice-pct-secondary", String(100 - gstate.voice.ratio));
      const sumVal = byId("voice-picker-card")
        ?.closest("details")
        ?.querySelector<HTMLElement>(".summary-val");
      if (sumVal)
        sumVal.textContent = `${p.lang.slice(0, 1)} · ${s.lang.slice(0, 1)}`;
    }
    function openAvatarGallery() {
      gstate.avatar.selected = gstate.avatar.applied;
      gstate.avatar.filter = "all";
      gstate.avatar.search = "";
      renderAvatarFilters();
      renderAvatarGrid();
      updateAvatarFoot();
      const inp = byId<HTMLInputElement>("avatar-search");
      if (inp) inp.value = "";
      bodyAdd("gallery-avatar-open");
    }
    function closeAvatarGallery() {
      bodyRemove("gallery-avatar-open");
    }
    function applyAvatarSelection() {
      gstate.avatar.applied = gstate.avatar.selected;
      refreshAvatarCard();
      closeAvatarGallery();
      const av = AVATARS.find((a) => a.id === gstate.avatar.applied);
      showVoiceToast((av ? av.name : "") + " 아바타 적용됨");
    }
    function openVoiceGallery() {
      gstate.voice.primary = gstate.voice.appliedPrimary;
      gstate.voice.secondary = gstate.voice.appliedSecondary;
      gstate.voice.filter = "all";
      gstate.voice.tab = "primary";
      renderVoiceFilters();
      renderVoiceGrid();
      updateVoiceFoot();
      bodyAdd("gallery-voice-open");
    }
    function closeVoiceGallery() {
      bodyRemove("gallery-voice-open");
    }
    function applyVoiceSelection() {
      gstate.voice.appliedPrimary = gstate.voice.primary;
      gstate.voice.appliedSecondary = gstate.voice.secondary;
      refreshVoiceCard();
      closeVoiceGallery();
      showVoiceToast("음성 조합 적용됨");
    }
    function showVoiceToast(msg: string, glyph?: string) {
      const toast = byId("voice-toast");
      if (!toast) return;
      const m = byId("vt-toast-msg");
      if (m) m.textContent = msg;
      const g = byId("vt-toast-glyph");
      if (g) g.textContent = glyph || "🔊";
      toast.classList.add("show");
      if (voiceToastTimer) clearTimeout(voiceToastTimer);
      voiceToastTimer = after(() => toast.classList.remove("show"), 2400);
    }
    function playVoicePreview(voiceId: string) {
      let v: Voice | undefined;
      let msg = "";
      if (voiceId === "primary") {
        v = VOICES.find((x) => x.id === gstate.voice.appliedPrimary);
        msg = (v ? v.name : "") + " 음성 재생 중 (주 음성)";
      } else if (voiceId === "secondary") {
        v = VOICES.find((x) => x.id === gstate.voice.appliedSecondary);
        msg = (v ? v.name : "") + " 음성 재생 중 (부 음성)";
      } else {
        v = VOICES.find((x) => x.id === voiceId);
        msg = (v ? v.name : "") + " 음성 재생 중";
      }
      if (!v) return;
      const glyph = v.gender === "f" ? "♀" : "♂";
      showVoiceToast(msg, glyph);
      const playSvg =
        '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>';
      const pauseSvg =
        '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14"></rect><rect x="14" y="5" width="4" height="14"></rect></svg>';
      const rightBtns = $$<HTMLElement>("[data-voice-play]");
      rightBtns.forEach((b) => {
        const isThis =
          (voiceId === "primary" && b.dataset.voicePlay === "primary") ||
          (voiceId === "secondary" && b.dataset.voicePlay === "secondary");
        if (isThis) {
          b.classList.add("playing");
          b.innerHTML = pauseSvg;
        }
      });
      const modalBtns = $$<HTMLElement>(`[data-vpreview="${v.id}"]`);
      modalBtns.forEach((b) => {
        b.classList.add("playing");
        b.innerHTML = pauseSvg + " 재생 중...";
      });
      if (voicePreviewTimer) clearTimeout(voicePreviewTimer);
      voicePreviewTimer = after(() => {
        rightBtns.forEach((b) => {
          b.classList.remove("playing");
          b.innerHTML = playSvg;
        });
        modalBtns.forEach((b) => {
          b.classList.remove("playing");
          b.innerHTML = playSvg + " 미리듣기";
        });
      }, 3000);
    }
    function initGallery() {
      const mount = byId("gallery-mount-point");
      if (!mount) return;
      mount.innerHTML = buildGalleryHTML();
      refreshAvatarCard();
      refreshVoiceCard();
    }

    // ───────────────────────── Interview (interview.js) ─────────────────────
    const ISTATE: {
      scenario: string;
      step: number;
      progress: Set<string>;
      decisions: Record<string, string>;
    } = { scenario: "B", step: 0, progress: new Set(), decisions: {} };
    const AVATARS_FRIENDLY = [
      { id: "ihyena", name: "이지혜 강사", sub: "친근한 강의체 · 한국어", color: "#F4C77B", rec: true },
      { id: "kimprof", name: "김교수 페르소나", sub: "비즈니스 캐주얼 · 한국어", color: "#A8B5C8", rec: false },
      { id: "wang", name: "Wáng 老師", sub: "친근 · 中文", color: "#E89E8E", rec: false },
    ];
    const AVATARS_ACADEMIC = [
      { id: "drchen", name: "Dr. Chen", sub: "학술 강의 · 中文/EN", color: "#B0A8D9", rec: true },
      { id: "kimprof", name: "김교수 페르소나", sub: "비즈니스 캐주얼 · 한국어", color: "#A8B5C8", rec: false },
      { id: "lilao", name: "Lǐ 老師", sub: "中文 학술", color: "#9DC4A8", rec: false },
    ];
    const CB_REGISTRY = new Map<string, (btn: HTMLElement) => void>();
    const regCb = (fn: (btn: HTMLElement) => void) => {
      const id = "cb-" + Math.random().toString(36).slice(2, 9);
      CB_REGISTRY.set(id, fn);
      return id;
    };
    const getThread = () => byId("chat-thread");
    function setProgress(keys: string[]) {
      keys.forEach((k) => ISTATE.progress.add(k));
      $$<HTMLElement>("#iv-progress .ip-dot").forEach((d) =>
        d.classList.toggle("filled", ISTATE.progress.has(d.dataset.d ?? ""))
      );
    }
    function setHeaderTitle(text: string, neutral?: boolean) {
      const titleInput = $<HTMLInputElement>(".title-input");
      if (!titleInput) return;
      if (neutral) {
        titleInput.value = "";
        titleInput.placeholder = "제목 없음 (편집 가능)";
        titleInput.classList.add("placeholder-mode");
      } else {
        titleInput.value = String(text || "").replace(/<[^>]+>/g, "");
        titleInput.classList.remove("placeholder-mode");
      }
    }
    function scrollToEnd() {
      const host = $(".screen[data-screen=\"2\"]");
      if (!host) return;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          host.scrollTo({ top: host.scrollHeight, behavior: "smooth" });
        })
      );
    }
    function pushMessage(role: string, html: string) {
      const thread = getThread();
      if (!thread) return null;
      const row = document.createElement("div");
      row.className = `msg-row ${role}`;
      row.innerHTML =
        role === "ai"
          ? `<div class="ai-orb">${ICO.sparkle}</div><div class="msg-bubble">${html}</div>`
          : `<div class="msg-bubble">${html}</div>`;
      thread.appendChild(row);
      scrollToEnd();
      after(scrollToEnd, 140);
      after(scrollToEnd, 360);
      return row;
    }
    function showTyping() {
      const thread = getThread();
      if (!thread) return;
      const row = document.createElement("div");
      row.className = "msg-row ai typing-row";
      row.id = "iv-typing";
      row.innerHTML = `<div class="ai-orb">${ICO.sparkle}</div><div class="typing-bubble"><span></span><span></span><span></span></div>`;
      thread.appendChild(row);
      scrollToEnd();
    }
    function hideTyping() {
      byId("iv-typing")?.remove();
    }
    function aiSay(html: string, delay = 650) {
      showTyping();
      return new Promise<void>((res) => {
        after(() => {
          hideTyping();
          pushMessage("ai", html);
          res();
        }, delay);
      });
    }
    const userSay = (html: string) => pushMessage("user", html);

    function avatarMiniGrid(
      avs: { id: string; name: string; sub: string; color: string; rec: boolean }[],
      onPick: (a: (typeof avs)[number]) => void
    ) {
      const cb = regCb((btn) => onPick(avs[+(btn.dataset.idx ?? "0")]));
      return (
        `<div class="avatar-mini-grid" data-cb-group>${avs
          .map(
            (a, i) =>
              `<button type="button" class="avatar-mini" data-cb="${cb}" data-idx="${i}">${
                a.rec ? `<span class="am-recommend">⭐ 추천</span>` : ""
              }<span class="am-preview">${ICO.persona(
                a.color
              )}</span><span class="am-name">${esc(
                a.name
              )}</span><span class="am-sub">${esc(a.sub)}</span></button>`
          )
          .join("")}</div>` +
        `<div class="avatar-mini-foot">12명 중 직접 고르고 싶으시면 <button type="button" data-act="iv-gallery-hint">전체 아바타 보기</button></div>`
      );
    }
    function choiceChips(
      items: { label?: string }[] | string[],
      onPick: (it: { label?: string } | string, i: number) => void
    ) {
      const cb = regCb((btn) =>
        onPick(
          (items as { label?: string }[])[+(btn.dataset.idx ?? "0")],
          +(btn.dataset.idx ?? "0")
        )
      );
      return `<div class="choice-row" data-cb-group>${(
        items as { label?: string }[]
      )
        .map(
          (it, i) =>
            `<button type="button" class="choice-chip" data-cb="${cb}" data-idx="${i}">${esc(
              (it as { label?: string }).label ?? it
            )}</button>`
        )
        .join("")}</div>`;
    }
    function toneGrid(
      items: { name: string; sub: string; icon: string }[],
      onPick: (t: (typeof items)[number]) => void
    ) {
      const cb = regCb((btn) => onPick(items[+(btn.dataset.idx ?? "0")]));
      return `<div class="tone-grid" data-cb-group>${items
        .map(
          (t, i) =>
            `<button type="button" class="tone-card" data-cb="${cb}" data-idx="${i}"><span class="ico">${
              t.icon
            }</span><span><span class="tc-name">${esc(
              t.name
            )}</span><br><span class="tc-sub">${esc(
              t.sub
            )}</span></span></button>`
        )
        .join("")}</div>`;
    }
    function voiceRec(
      primary: { glyph: string; name: string; sub: string; pct: number },
      secondary: { glyph: string; name: string; sub: string; pct: number },
      onProceed: (tune: boolean) => void
    ) {
      const cbProceed = regCb(() => onProceed(false));
      const cbTune = regCb(() => onProceed(true));
      return `<div class="voice-rec" data-cb-group><div class="vr-head">${
        ICO.bulb
      } 추천 음성 조합</div><div class="vr-row"><span class="vr-tag">주 음성</span><span class="vr-glyph">${
        primary.glyph
      }</span><span><span class="vr-name">${esc(
        primary.name
      )}</span><span class="vr-sub">${esc(
        primary.sub
      )}</span></span><span class="vr-pct">${
        primary.pct
      }%</span></div><div class="vr-row"><span class="vr-tag">부 음성</span><span class="vr-glyph">${
        secondary.glyph
      }</span><span><span class="vr-name">${esc(
        secondary.name
      )}</span><span class="vr-sub">${esc(
        secondary.sub
      )}</span></span><span class="vr-pct">${
        secondary.pct
      }%</span></div><div class="vr-actions"><button type="button" class="btn-small" data-cb="${cbTune}">조정</button><button type="button" class="btn-small primary" data-cb="${cbProceed}">이대로 진행 →</button></div></div>`;
    }
    function summaryCard(d: Record<string, string>) {
      const cbGen = regCb(() => runScriptGen());
      const cbEdit = regCb(() => {
        aiSay("어떤 부분을 수정할까요? 채팅창에 자유롭게 적어주세요.", 350);
      });
      return `<div class="iv-summary" data-cb-group><div class="ivs-head">${
        ICO.listSparkle
      } 강의 영상 컨셉</div><dl><dt>주제</dt><dd>${
        d.topic
      }</dd><dt>대상</dt><dd>${esc(d.audience)}</dd><dt>톤</dt><dd>${esc(
        d.tone
      )}</dd><dt>방식</dt><dd>${esc(d.approach)}</dd><dt>아바타</dt><dd>${esc(
        d.avatar
      )}</dd><dt>음성</dt><dd>${esc(d.voice)}</dd><dt>길이</dt><dd>${esc(
        d.length
      )}</dd></dl><div class="ivs-actions"><button type="button" class="btn-small" data-cb="${cbEdit}">수정하기</button><button type="button" class="btn-small primary" data-cb="${cbGen}">AI 스크립트 생성 ${
        ICO.arrow
      }</button></div></div>`;
    }
    async function startScenario(letter: string) {
      ISTATE.scenario = letter;
      ISTATE.step = 0;
      ISTATE.progress.clear();
      ISTATE.decisions = {};
      const thread = getThread();
      if (thread) thread.innerHTML = "";
      setProgress([]);
      setHeaderTitle("", true);
      await aiSay(
        `안녕하세요, <strong>하두진 교수님</strong>.\n` +
          `PPT 8장을 받았어요. 슬라이드 제목들을 보니 ${han(
            "把"
          )}자문 관련 강의 같은데요, 맞나요?\n\n` +
          `어떤 영상을 만들고 싶으신지 자유롭게 말씀해주세요.\n` +
          `예시 — 대상 학습자가 누구인가요? · 어떤 톤으로 가르치고 싶으세요? · 강조하고 싶은 부분이 있나요?\n\n` +
          `한 번에 다 말씀해주셔도 좋고, 짧게 시작해주셔도 좋아요.`,
        400
      );
      updateDevStep();
    }
    async function devAdvance() {
      if (ISTATE.scenario === "A") return scenarioA();
      if (ISTATE.scenario === "B") return scenarioB();
      if (ISTATE.scenario === "C") return scenarioC();
    }
    async function scenarioA() {
      if (ISTATE.step !== 0) return;
      userSay(
        `${han(
          "把"
        )}자문 강의를 만들고 싶어요. 학부 1~2학년이 쉽게 이해할 수 있도록 친근한 톤으로, 풍부한 예시 곁들여서요.`
      );
      ISTATE.step++;
      setHeaderTitle(`${han("把")}자문(把字句) 입문`);
      setProgress(["topic", "audience", "tone"]);
      ISTATE.decisions = {
        ...ISTATE.decisions,
        topic: `${han("把")}자문 입문`,
        topicTitle: "把자문(把字句) 입문",
        audience: "학부 1~2학년",
        tone: "친근한 강의체",
        approach: "예시 중심",
      };
      await aiSay(
        `좋아요. 정리하면:\n<dl class="parsed-list"><dt>주제</dt><dd>${han(
          "把"
        )}자문(${han(
          "把字句"
        )}) 입문 <em style="color:var(--gold);font-style:normal;font-size:11.5px">— 헤더 갱신됨</em></dd><dt>대상</dt><dd>학부 1~2학년</dd><dt>톤</dt><dd>친근한 강의체</dd><dt>방식</dt><dd>예시 중심 (PPT 슬라이드 5번의 일상 회화 예시 3가지를 적극 활용할게요)</dd></dl>\n이 컨셉으로 진행할게요. 한 가지만 더 정하면 됩니다 — 영상에 등장할 <strong>AI 아바타</strong>를 골라주세요.\n` +
          avatarMiniGrid(AVATARS_FRIENDLY, async (av) => {
            userSay(`${esc(av.name)} 선택했어요`);
            ISTATE.decisions.avatar = av.name;
            ISTATE.decisions.avatarId = av.id;
            setProgress(["avatar"]);
            ISTATE.step++;
            await aiSay(
              `좋습니다. 마지막으로 음성 한 가지만 추천드릴게요.\n` +
                voiceRec(
                  { glyph: "♀", name: "Yuna", sub: "자연스러운 여성 음성 · 한국어", pct: 70 },
                  { glyph: "♂", name: "Xiaoming", sub: "표준 보통화 남성 · 中文", pct: 30 },
                  async (tune) => {
                    userSay(tune ? "조정하고 진행할게요" : "이대로 진행해주세요");
                    ISTATE.decisions.voice = "한국어 70% + 中文 30%";
                    ISTATE.decisions.length = "5분 12초 (슬라이드 8장 기준)";
                    setProgress(["voice"]);
                    ISTATE.step++;
                    await aiSay(
                      `좋아요, 컨셉이 모두 정해졌어요. 한 번 확인해주세요.\n` +
                        summaryCard(ISTATE.decisions),
                      800
                    );
                    updateDevStep();
                  }
                ),
              700
            );
            updateDevStep();
          }),
        900
      );
      updateDevStep();
    }
    async function scenarioB() {
      if (ISTATE.step !== 0) return;
      userSay(
        `${han("被")}자문(피동문) 강의를 만들고 싶어요. 학부 2~3학년 대상이고, ${han(
          "把"
        )}자문과의 비교를 통해 학술적으로 설명할 거예요.`
      );
      ISTATE.step++;
      setHeaderTitle(`${han("被")}자문(被字句) — ${han("把")}자문과의 비교`);
      setProgress(["topic", "audience", "tone"]);
      ISTATE.decisions = {
        ...ISTATE.decisions,
        topic: `${han("被")}자문 — ${han("把")}자문과의 비교 분석`,
        topicTitle: "被자문(被字句) — 把자문과의 비교",
        audience: "학부 2~3학년",
        tone: "학술적 (정확한 문법 설명 중심)",
        approach: "비교 분석",
      };
      await aiSay(
        `흥미로운 접근이에요. ${han("把")}자문이 처치 의미라면 ${han(
          "被"
        )}자문은 피동 의미니까, 비교 분석이 학생 이해에 도움이 되겠네요.\n\n정리하면:\n<dl class="parsed-list"><dt>주제</dt><dd>${han(
          "被"
        )}자문 (피동문) — ${han(
          "把"
        )}자문과의 비교 분석</dd><dt>대상</dt><dd>학부 2~3학년</dd><dt>톤</dt><dd>학술적 (정확한 문법 설명 중심)</dd><dt>방식</dt><dd>비교 분석</dd></dl><div class="parsed-note">${
          ICO.warn
        } <strong>안내</strong> — PPT 8장이 ${han(
          "把"
        )}자문 중심으로 구성되어 있어요. ${han(
          "被"
        )}자문 비교 설명을 추가하면 슬라이드 보강이 필요할 수 있는데, 진행 후 마법사 화면에서 슬라이드 추가하실 수 있습니다.</div>\n한 가지만 더 정하면 됩니다 — 학술적 톤에 맞는 <strong>AI 아바타</strong>를 골라주세요.\n` +
          avatarMiniGrid(AVATARS_ACADEMIC, async (av) => {
            userSay(`${esc(av.name)} 좋아요`);
            ISTATE.decisions.avatar = av.name;
            ISTATE.decisions.avatarId = av.id;
            setProgress(["avatar"]);
            ISTATE.step++;
            await aiSay(
              `학술적 톤에 맞춰 ${esc(
                av.name
              )} 아바타로 진행할게요. 마지막으로 음성을 추천드릴게요.\n` +
                voiceRec(
                  { glyph: "♂", name: "Jihoon", sub: "차분한 남성 음성 · 한국어", pct: 60 },
                  { glyph: "♀", name: "Mei", sub: "표준 보통화 여성 · 中文", pct: 40 },
                  async (tune) => {
                    userSay(tune ? "조정 후 진행" : "이대로 진행해주세요");
                    ISTATE.decisions.voiceP = "Jihoon 60%";
                    ISTATE.decisions.voiceS = "Mei 40%";
                    ISTATE.decisions.voice = "한국어 60% + 中文 40%";
                    ISTATE.decisions.length =
                      "6분 38초 (슬라이드 8장 + 비교 보강 예상)";
                    setProgress(["voice"]);
                    ISTATE.step++;
                    await aiSay(
                      `좋아요, 컨셉이 모두 정해졌어요. 한 번 확인해주세요.\n` +
                        summaryCard(ISTATE.decisions),
                      800
                    );
                    updateDevStep();
                  }
                ),
              700
            );
            updateDevStep();
          }),
        950
      );
      updateDevStep();
    }
    async function scenarioC() {
      if (ISTATE.step !== 0) return;
      userSay("강의 만들고 싶어요");
      ISTATE.step++;
      await aiSay(
        `좋아요, 함께 정해가요.\nPPT를 보니 ${han(
          "把"
        )}자문 관련 슬라이드 같은데요, 이 주제가 맞나요? 아니면 다른 주제를 다루실 건가요?\n` +
          choiceChips(
            [
              { label: `${han("把")}자문 맞아요` },
              { label: "다른 주제예요 (입력)" },
            ],
            async (_it, i) => {
              if (i === 0) {
                userSay(`${han("把")}자문 맞아요`);
                setHeaderTitle(`${han("把")}자문(把字句) 입문`);
                ISTATE.decisions.topic = `${han("把")}자문 입문`;
                ISTATE.decisions.topicTitle = "把자문(把字句) 입문";
                setProgress(["topic"]);
                ISTATE.step++;
                await aiSay(
                  `좋습니다. 이 강의를 누구를 대상으로 만드실 건가요?\n` +
                    choiceChips(
                      [
                        { label: "학부 1~2학년" },
                        { label: "학부 3~4학년" },
                        { label: "대학원" },
                        { label: "일반 청중" },
                      ],
                      async (a) => {
                        const al = (a as { label?: string }).label ?? "";
                        userSay(al);
                        ISTATE.decisions.audience = al;
                        setProgress(["audience"]);
                        ISTATE.step++;
                        await aiSay(
                          `${al}이라면 친근한 톤이 좋겠죠. 어떤 분위기가 좋으실까요?\n` +
                            toneGrid(
                              [
                                { name: "친근", sub: "따뜻한 강의체", icon: ICO.smile },
                                { name: "격식 학술", sub: "정확·정중", icon: ICO.cap },
                                { name: "활기", sub: "에너지·리듬감", icon: ICO.spark },
                                { name: "차분", sub: "느린 호흡 · 안정", icon: ICO.moon },
                              ],
                              async (t) => {
                                userSay(`${t.name} 좋겠어요`);
                                ISTATE.decisions.tone =
                                  t.name + " (" + t.sub + ")";
                                ISTATE.decisions.approach = "예시 중심";
                                setProgress(["tone"]);
                                ISTATE.step++;
                                const pool =
                                  t.name === "격식 학술"
                                    ? AVATARS_ACADEMIC
                                    : AVATARS_FRIENDLY;
                                await aiSay(
                                  `좋아요. ${t.name} 톤으로 설정했어요. 마지막으로 아바타 추천드릴게요.\n` +
                                    avatarMiniGrid(pool, async (av) => {
                                      userSay(`${esc(av.name)} 선택`);
                                      ISTATE.decisions.avatar = av.name;
                                      setProgress(["avatar"]);
                                      ISTATE.step++;
                                      await aiSay(
                                        `음성 추천을 보여드릴게요.\n` +
                                          voiceRec(
                                            { glyph: "♀", name: "Yuna", sub: "자연스러운 여성 음성 · 한국어", pct: 70 },
                                            { glyph: "♂", name: "Xiaoming", sub: "표준 보통화 남성 · 中文", pct: 30 },
                                            async (tune) => {
                                              userSay(
                                                tune
                                                  ? "조정 후 진행"
                                                  : "이대로 진행해주세요"
                                              );
                                              ISTATE.decisions.voice =
                                                "한국어 70% + 中文 30%";
                                              ISTATE.decisions.length =
                                                "5분 12초 (슬라이드 8장 기준)";
                                              setProgress(["voice"]);
                                              ISTATE.step++;
                                              await aiSay(
                                                `좋아요, 컨셉이 모두 정해졌어요. 한 번 확인해주세요.\n` +
                                                  summaryCard(ISTATE.decisions),
                                                750
                                              );
                                              updateDevStep();
                                            }
                                          ),
                                        650
                                      );
                                      updateDevStep();
                                    }),
                                  750
                                );
                                updateDevStep();
                              }
                            ),
                          650
                        );
                        updateDevStep();
                      }
                    ),
                  650
                );
                updateDevStep();
              } else {
                userSay("다른 주제예요");
                await aiSay(`주제를 알려주세요. 채팅창에 입력해주세요.`, 350);
              }
            }
          ),
        700
      );
      updateDevStep();
    }
    function updateDevStep() {
      const el = byId("dp-step");
      if (!el) return;
      const turnsTotal = ISTATE.scenario === "C" ? 5 : 3;
      el.textContent = `현재 턴 ${ISTATE.step} / ${turnsTotal}`;
    }
    function sendUserMessage() {
      const composer = byId<HTMLTextAreaElement>("iv-composer-input");
      const sendBtn = byId<HTMLButtonElement>("iv-send-btn");
      if (!composer || !sendBtn) return;
      const v = composer.value.trim();
      if (!v) return;
      userSay(esc(v));
      composer.value = "";
      composer.style.height = "";
      sendBtn.disabled = true;
      sendBtn.classList.remove("active");
      runFreeformTurn(v);
    }
    const SLOT_ORDER = ["topic", "audience", "tone", "avatar", "voice"];
    function parseFreeform(raw: string) {
      const out: Record<string, string> = {};
      if (/把자문|把字句|把字|ba자문|ba字/.test(raw)) {
        out.topic = `${han("把")}자문 입문`;
        out.topicTitle = "把자문(把字句) 입문";
      } else if (/被자문|被字句|被字|bei자문|피동문/.test(raw)) {
        out.topic = `${han("被")}자문 (피동문)`;
        out.topicTitle = "被자문(被字句)";
        if (/比교|비교|대조/.test(raw) && /把/.test(raw)) {
          out.topic = `${han("被")}자문 — ${han("把")}자문과의 비교 분석`;
          out.topicTitle = "被자문(被字句) — 把자문과의 비교";
        }
      } else if (/한자|漢字|中国语|中文 문법|중국어 문법/.test(raw)) {
        out.topic = "중국어 문법 (자유 주제)";
        out.topicTitle = "중국어 문법";
      }
      if (/학부\s*1\s*[~\-–]\s*2|학부\s*1[\s,·]*2학년|1\s*~\s*2학년|학부 저학년/.test(raw))
        out.audience = "학부 1~2학년";
      else if (/학부\s*2\s*[~\-–]\s*3|2\s*~\s*3학년/.test(raw))
        out.audience = "학부 2~3학년";
      else if (/학부\s*3\s*[~\-–]\s*4|3\s*~\s*4학년|학부 고학년/.test(raw))
        out.audience = "학부 3~4학년";
      else if (/대학원|석사|박사/.test(raw)) out.audience = "대학원";
      else if (/일반|성인|직장인|시민/.test(raw)) out.audience = "일반 청중";
      else if (/학부생|학부\s*학생|undergrad/i.test(raw))
        out.audience = "학부생";
      const toneSignals: string[] = [];
      if (/친근|따뜻|편안|편한|부담\s*없|쉽게|쉬운/.test(raw))
        toneSignals.push("친근");
      if (/학술|격식|정확|정중|formal|문법.*설명/.test(raw))
        toneSignals.push("학술");
      if (/활기|에너지|밝게|경쾌|신나|fun/.test(raw)) toneSignals.push("활기");
      if (/차분|느린|안정|조용|침착/.test(raw)) toneSignals.push("차분");
      if (toneSignals.length === 1) {
        const map: Record<string, string> = {
          친근: "친근한 강의체",
          학술: "학술적 (정확한 문법 설명 중심)",
          활기: "활기찬 톤",
          차분: "차분한 톤",
        };
        out.tone = map[toneSignals[0]];
      } else if (toneSignals.length > 1) {
        out.tone = toneSignals[0] === "친근" ? "친근한 강의체" : "학술적";
      }
      if (/예시|예제|사례|일상\s*회화/.test(raw)) out.approach = "예시 중심";
      else if (/비교|대조|차이/.test(raw)) out.approach = "비교 분석";
      else if (/단계.*적|step|차근/.test(raw)) out.approach = "단계별 설명";
      const avHints: string[] = [];
      if (/제스처|동작|손짓|손\s*동작|움직임|움직이는/.test(raw))
        avHints.push("제스처가 풍부한");
      if (/친근|편안|밝은|미소/.test(raw)) avHints.push("친근한 인상");
      if (/학술|차분|진중|professional|정장/.test(raw))
        avHints.push("학술적인 톤");
      if (/여성|여자|female/.test(raw)) avHints.push("여성");
      if (/남성|남자|male/.test(raw)) avHints.push("남성");
      if (/중국|중국어|중국인|chinese/i.test(raw)) avHints.push("中文 화자");
      if (avHints.length) out.avatarHints = avHints.join("");
      return out;
    }
    function nextMissingSlot() {
      for (const k of SLOT_ORDER) if (!ISTATE.decisions[k]) return k;
      return null;
    }
    async function runFreeformTurn(raw: string) {
      const parsed = parseFreeform(raw);
      const before = { ...ISTATE.decisions };
      const acquired: string[] = [];
      if (parsed.topic && !before.topic) {
        ISTATE.decisions.topic = parsed.topic;
        acquired.push("topic");
      }
      if (parsed.topicTitle && !before.topicTitle)
        ISTATE.decisions.topicTitle = parsed.topicTitle;
      if (parsed.audience && !before.audience) {
        ISTATE.decisions.audience = parsed.audience;
        acquired.push("audience");
      }
      if (parsed.tone && !before.tone) {
        ISTATE.decisions.tone = parsed.tone;
        acquired.push("tone");
      }
      if (parsed.approach && !before.approach)
        ISTATE.decisions.approach = parsed.approach;
      if (parsed.avatarHints) ISTATE.decisions.avatarHints = parsed.avatarHints;
      if (ISTATE.decisions.topicTitle)
        setHeaderTitle(ISTATE.decisions.topicTitle);
      if (acquired.length) setProgress(acquired);
      const ackLines: string[] = [];
      if (parsed.topic) ackLines.push(`<dt>주제</dt><dd>${parsed.topic}</dd>`);
      if (parsed.audience)
        ackLines.push(`<dt>대상</dt><dd>${esc(parsed.audience)}</dd>`);
      if (parsed.tone) ackLines.push(`<dt>톤</dt><dd>${esc(parsed.tone)}</dd>`);
      if (parsed.approach)
        ackLines.push(`<dt>방식</dt><dd>${esc(parsed.approach)}</dd>`);
      if (parsed.avatarHints)
        ackLines.push(
          `<dt>아바타</dt><dd>${esc(
            parsed.avatarHints.split("").join(" · ")
          )} 선호</dd>`
        );
      const next = nextMissingSlot();
      let body =
        ackLines.length > 0
          ? `좋아요. 말씀해주신 내용 정리해볼게요:\n<dl class="parsed-list">${ackLines.join(
              ""
            )}</dl>\n`
          : `네, 알겠습니다.\n`;
      if (!next) {
        const d = ISTATE.decisions;
        d.approach = d.approach || "예시 중심";
        d.voice = d.voice || "한국어 70% + 中文 30%";
        d.length = d.length || "5분 12초 (슬라이드 8장 기준)";
        body += `\n컨셉이 모두 정해졌어요. 한 번 확인해주세요.\n` + summaryCard(d);
        await aiSay(body, 700);
        return;
      }
      body += `\n` + askForSlot(next);
      await aiSay(body, 700);
    }
    function askForSlot(slot: string): string {
      if (slot === "topic") {
        return (
          `먼저 강의 주제를 알려주세요. PPT를 보니 ${han(
            "把"
          )}자문 슬라이드 같은데요, 이 주제로 진행할까요?\n` +
          choiceChips(
            [{ label: `${han("把")}자문 맞아요` }, { label: "다른 주제예요 (입력)" }],
            (_it, i) => {
              if (i === 0) {
                userSay(`${han("把")}자문 맞아요`);
                ISTATE.decisions.topic = `${han("把")}자문 입문`;
                ISTATE.decisions.topicTitle = "把자문(把字句) 입문";
                setHeaderTitle(ISTATE.decisions.topicTitle);
                setProgress(["topic"]);
                continueAsking();
              } else {
                userSay("다른 주제예요");
                aiSay("주제를 채팅창에 입력해주세요.", 300);
              }
            }
          )
        );
      }
      if (slot === "audience") {
        return (
          `누구를 대상으로 만드실 건가요?\n` +
          choiceChips(
            [
              { label: "학부 1~2학년" },
              { label: "학부 3~4학년" },
              { label: "대학원" },
              { label: "일반 청중" },
            ],
            (a) => {
              const al = (a as { label?: string }).label ?? "";
              userSay(al);
              ISTATE.decisions.audience = al;
              setProgress(["audience"]);
              continueAsking();
            }
          )
        );
      }
      if (slot === "tone") {
        return (
          `어떤 분위기로 가르치고 싶으세요?\n` +
          toneGrid(
            [
              { name: "친근", sub: "따뜻한 강의체", icon: ICO.smile },
              { name: "격식 학술", sub: "정확·정중", icon: ICO.cap },
              { name: "활기", sub: "에너지·리듬감", icon: ICO.spark },
              { name: "차분", sub: "느린 호흡 · 안정", icon: ICO.moon },
            ],
            (t) => {
              userSay(`${t.name} 좋겠어요`);
              ISTATE.decisions.tone = `${t.name} (${t.sub})`;
              ISTATE.decisions.approach =
                ISTATE.decisions.approach || "예시 중심";
              setProgress(["tone"]);
              continueAsking();
            }
          )
        );
      }
      if (slot === "avatar") {
        const isAcademic = /학술|격식/.test(ISTATE.decisions.tone || "");
        const pool = isAcademic ? AVATARS_ACADEMIC : AVATARS_FRIENDLY;
        const hints = ISTATE.decisions.avatarHints
          ? ISTATE.decisions.avatarHints.split("")
          : [];
        const hintLine = hints.length
          ? `<em style="display:block;margin-top:6px;font-size:12.5px;color:var(--text-muted);font-style:normal">교수님이 말씀하신 "${esc(
              hints.join(", ")
            )}" 특징을 반영해서 추천했어요.</em>`
          : "";
        return (
          `이제 영상에 등장할 AI 아바타를 골라주세요.${hintLine}\n` +
          avatarMiniGrid(pool, (av) => {
            userSay(`${esc(av.name)} 선택했어요`);
            ISTATE.decisions.avatar = av.name;
            ISTATE.decisions.avatarId = av.id;
            setProgress(["avatar"]);
            continueAsking();
          })
        );
      }
      if (slot === "voice") {
        const isAcademic = /학술|격식/.test(ISTATE.decisions.tone || "");
        const p = isAcademic
          ? { glyph: "♂", name: "Jihoon", sub: "차분한 남성 음성 · 한국어", pct: 60 }
          : { glyph: "♀", name: "Yuna", sub: "자연스러운 여성 음성 · 한국어", pct: 70 };
        const s = isAcademic
          ? { glyph: "♀", name: "Mei", sub: "표준 보통화 여성 · 中文", pct: 40 }
          : { glyph: "♂", name: "Xiaoming", sub: "표준 보통화 남성 · 中文", pct: 30 };
        return (
          `마지막으로 음성을 추천드릴게요. ${
            ISTATE.decisions.tone || "교수님 톤"
          }에 맞춘 조합이에요.\n` +
          voiceRec(p, s, (tune) => {
            userSay(tune ? "조정 후 진행할게요" : "이대로 진행해주세요");
            ISTATE.decisions.voiceP = `${p.name} ${p.pct}%`;
            ISTATE.decisions.voiceS = `${s.name} ${s.pct}%`;
            ISTATE.decisions.voice =
              p.name === "Jihoon"
                ? "한국어 60% + 中文 40%"
                : "한국어 70% + 中文 30%";
            ISTATE.decisions.length =
              ISTATE.decisions.length || "5분 12초 (슬라이드 8장 기준)";
            setProgress(["voice"]);
            continueAsking();
          })
        );
      }
      return "";
    }
    async function continueAsking() {
      const next = nextMissingSlot();
      if (!next) {
        const d = ISTATE.decisions;
        d.approach = d.approach || "예시 중심";
        d.voice = d.voice || "한국어 70% + 中文 30%";
        d.length = d.length || "5분 12초 (슬라이드 8장 기준)";
        await aiSay(
          `좋아요, 컨셉이 모두 정해졌어요. 한 번 확인해주세요.\n` +
            summaryCard(d),
          700
        );
        return;
      }
      await aiSay(askForSlot(next), 650);
    }
    function showQuickModal() {
      byId("quick-overlay")?.classList.add("show");
    }
    function closeQuick() {
      byId("quick-overlay")?.classList.remove("show");
    }
    function quickProceed() {
      byId("quick-overlay")?.classList.remove("show");
      ISTATE.decisions = {
        topic: `${han("把")}자문 입문 (PPT 자동 추정)`,
        topicTitle: "把자문(把字句) 입문",
        audience: "학부 1~2학년 (기본값)",
        tone: "친근한 강의체 (기본값)",
        approach: "예시 중심",
        avatar: "이지혜 강사 (추천)",
        voice: "한국어 70% + 中文 30% (추천 조합)",
        length: "5분 12초 (예상)",
      };
      setHeaderTitle(`${han("把")}자문(把字句) 입문`);
      runScriptGen();
    }
    async function runScriptGen() {
      const ov = byId("iv-gen-overlay");
      if (!ov) return;
      ov.classList.add("show");
      const steps = $$<HTMLElement>(".iv-gen-step");
      steps.forEach((s) => (s.dataset.state = ""));
      const wait = (ms: number) =>
        new Promise<void>((r) => after(() => r(), ms));
      await wait(400);
      if (steps[0]) steps[0].dataset.state = "active";
      await wait(1200);
      if (steps[0]) steps[0].dataset.state = "done";
      if (steps[1]) steps[1].dataset.state = "active";
      await wait(1400);
      if (steps[1]) steps[1].dataset.state = "done";
      if (steps[2]) steps[2].dataset.state = "active";
      const writingLabel = steps[2]?.querySelector<HTMLElement>(".ivg-label");
      for (let i = 1; i <= 8; i++) {
        if (writingLabel)
          writingLabel.innerHTML = `슬라이드 <strong>${i}/8</strong> 스크립트 작성 중…`;
        await wait(520);
      }
      if (writingLabel)
        writingLabel.innerHTML = `슬라이드 8/8 작성 완료`;
      if (steps[2]) steps[2].dataset.state = "done";
      await wait(500);
      applyDecisionsToWizard();
      ov.classList.remove("show");
      goto(3);
    }
    function applyDecisionsToWizard() {
      const d = ISTATE.decisions;
      if (!d || !d.avatar) return;
      const an = byId("avatar-card-name");
      if (an) an.textContent = (d.avatar || "").replace(/<[^>]+>/g, "");
      const as = byId("avatar-card-sub");
      if (as && d.tone) as.textContent = d.tone.replace(/<[^>]+>/g, "");
      const sumVals = $$<HTMLElement>(".summary-val");
      if (sumVals[0])
        sumVals[0].textContent = (d.avatar || "")
          .replace(/<[^>]+>/g, "")
          .split(" ")[0];
      if (d.voiceP && d.voiceS && /Jihoon/.test(d.voiceP)) {
        const set = (id: string, v: string) => {
          const e = byId(id);
          if (e) e.textContent = v;
        };
        set("voice-name-primary", "Jihoon");
        set("voice-sub-primary", "차분한 남성 음성 · 한국어");
        set("voice-glyph-primary", "♂");
        set("voice-pct-primary", "60");
        set("voice-name-secondary", "Mei");
        set("voice-sub-secondary", "표준 보통화 여성 · 中文");
        set("voice-glyph-secondary", "♀");
        set("voice-pct-secondary", "40");
      }
    }
    function ivDevComplete() {
      const presets: Record<string, Record<string, string>> = {
        A: {
          topic: `${han("把")}자문 입문`,
          topicTitle: "把자문(把字句) 입문",
          audience: "학부 1~2학년",
          tone: "친근한 강의체",
          approach: "예시 중심",
          avatar: "이지혜 강사",
          voice: "한국어 70% + 中文 30%",
          length: "5분 12초 (슬라이드 8장 기준)",
        },
        B: {
          topic: `${han("被")}자문 — ${han("把")}자문과의 비교 분석`,
          topicTitle: "被자문(被字句) — 把자문과의 비교",
          audience: "학부 2~3학년",
          tone: "학술적 (정확한 문법 설명 중심)",
          approach: "비교 분석",
          avatar: "Dr. Chen",
          voice: "한국어 60% + 中文 40%",
          voiceP: "Jihoon 60%",
          voiceS: "Mei 40%",
          length: "6분 38초 (슬라이드 8장 + 비교 보강 예상)",
        },
        C: {
          topic: `${han("把")}자문 입문`,
          topicTitle: "把자문(把字句) 입문",
          audience: "학부 1~2학년",
          tone: "친근 (따뜻한 강의체)",
          approach: "예시 중심",
          avatar: "이지혜 강사",
          voice: "한국어 70% + 中文 30%",
          length: "5분 12초 (슬라이드 8장 기준)",
        },
      };
      ISTATE.decisions = presets[ISTATE.scenario] || presets.B;
      setHeaderTitle(ISTATE.decisions.topic);
      runScriptGen();
    }

    // ───────────────────────── Wire everything up ─────────────────────────
    renderSlides();
    selectSlide(activeSlide);
    initGallery();

    // composer (interview) input behavior
    const composer = byId<HTMLTextAreaElement>("iv-composer-input");
    const sendBtn = byId<HTMLButtonElement>("iv-send-btn");
    const refreshSendBtn = () => {
      if (!composer || !sendBtn) return;
      const has = composer.value.trim().length > 0;
      sendBtn.disabled = !has;
      sendBtn.classList.toggle("active", has);
    };
    const onComposerInput = () => {
      if (!composer) return;
      composer.style.height = "auto";
      composer.style.height = Math.min(140, composer.scrollHeight) + "px";
      refreshSendBtn();
    };
    const onComposerKeydown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (sendBtn && !sendBtn.disabled) sendUserMessage();
      }
    };
    composer?.addEventListener("input", onComposerInput);
    composer?.addEventListener("keyup", refreshSendBtn);
    composer?.addEventListener("change", refreshSendBtn);
    composer?.addEventListener("keydown", onComposerKeydown);
    sendBtn?.addEventListener("click", sendUserMessage);
    refreshSendBtn();

    // dropzone DnD
    const dz = byId("dropzone");
    const dzPrevent = (e: Event) => {
      e.preventDefault();
      dz?.classList.add("drag");
    };
    const dzLeave = (e: Event) => {
      e.preventDefault();
      dz?.classList.remove("drag");
    };
    const dzDrop = () => startUpload();
    const dzKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        startUpload();
      }
    };
    ["dragenter", "dragover"].forEach((ev) =>
      dz?.addEventListener(ev, dzPrevent)
    );
    ["dragleave", "drop"].forEach((ev) => dz?.addEventListener(ev, dzLeave));
    dz?.addEventListener("drop", dzDrop);
    dz?.addEventListener("click", () => startUpload());
    dz?.addEventListener("keydown", dzKey);

    // DEV scenario radios
    const onScenarioChange = (ev: Event) => {
      const r = ev.target as HTMLInputElement;
      if (r && r.name === "iv-sc" && r.checked) {
        ISTATE.scenario = r.value;
        startScenario(r.value);
        updateDevStep();
      }
    };
    $$<HTMLInputElement>('.dev-panel input[name="iv-sc"]').forEach((r) =>
      r.addEventListener("change", onScenarioChange)
    );

    // single delegated click handler for data-act + interview cb + galleries
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // interview inline cb buttons
      const cbBtn = target.closest<HTMLElement>("[data-cb]");
      const thread = getThread();
      if (cbBtn && thread && thread.contains(cbBtn)) {
        if (cbBtn.dataset.done === "y") return;
        const fn = CB_REGISTRY.get(cbBtn.dataset.cb ?? "");
        if (fn) {
          const group = cbBtn.closest<HTMLElement>("[data-cb-group]");
          if (group)
            group
              .querySelectorAll<HTMLButtonElement>("[data-cb]")
              .forEach((b) => {
                b.dataset.done = "y";
                b.disabled = true;
              });
          else {
            cbBtn.dataset.done = "y";
            (cbBtn as HTMLButtonElement).disabled = true;
          }
          fn(cbBtn);
          return;
        }
      }

      // gallery slide pick
      const slidePick = target.closest<HTMLElement>("[data-slide-pick]");
      if (slidePick) {
        selectSlide(+(slidePick.dataset.slidePick ?? "1"));
        return;
      }

      // gallery data-action
      const ga = target.closest<HTMLElement>("[data-action]");
      if (ga) {
        const act = ga.dataset.action;
        if (act === "close-avatar") closeAvatarGallery();
        else if (act === "apply-avatar") applyAvatarSelection();
        else if (act === "close-voice") closeVoiceGallery();
        else if (act === "apply-voice") applyVoiceSelection();
        return;
      }
      const af = target.closest<HTMLElement>("[data-filter]");
      if (af && byId("avatar-gallery")?.contains(af)) {
        gstate.avatar.filter = af.dataset.filter ?? "all";
        renderAvatarFilters();
        renderAvatarGrid();
        return;
      }
      const aPv = target.closest<HTMLElement>("[data-preview]");
      if (aPv) {
        e.stopPropagation();
        const av = AVATARS.find((a) => a.id === aPv.dataset.preview);
        if (av) showVoiceToast(av.name + " 아바타 미리보기 재생 중");
        return;
      }
      const aTile = target.closest<HTMLElement>("[data-avatar-id]");
      if (aTile) {
        gstate.avatar.selected = aTile.dataset.avatarId ?? "";
        renderAvatarGrid();
        updateAvatarFoot();
        return;
      }
      const vf = target.closest<HTMLElement>("[data-vfilter]");
      if (vf && byId("voice-gallery")?.contains(vf)) {
        gstate.voice.filter = vf.dataset.vfilter ?? "all";
        renderVoiceFilters();
        renderVoiceGrid();
        return;
      }
      const vt = target.closest<HTMLElement>("[data-tab]");
      if (vt && byId("voice-gallery")?.contains(vt)) {
        gstate.voice.tab = vt.dataset.tab ?? "primary";
        updateVoiceFoot();
        renderVoiceGrid();
        return;
      }
      const r = target.closest<HTMLElement>("[data-ratio]");
      if (r && byId("voice-gallery")?.contains(r)) {
        gstate.voice.ratio = parseInt(r.dataset.ratio ?? "70", 10);
        updateVoiceFoot();
        return;
      }
      const vp = target.closest<HTMLElement>("[data-vpreview]");
      if (vp) {
        e.stopPropagation();
        playVoicePreview(vp.dataset.vpreview ?? "");
        return;
      }
      const vSel = target.closest<HTMLElement>("[data-vselect]");
      if (vSel) {
        e.stopPropagation();
        const id = vSel.dataset.vselect ?? "";
        if (gstate.voice.tab === "primary") gstate.voice.primary = id;
        else gstate.voice.secondary = id;
        renderVoiceGrid();
        updateVoiceFoot();
        return;
      }
      const vTile = target.closest<HTMLElement>("[data-voice-id]");
      if (vTile && byId("voice-gallery")?.contains(vTile)) {
        const id = vTile.dataset.voiceId ?? "";
        if (gstate.voice.tab === "primary") gstate.voice.primary = id;
        else gstate.voice.secondary = id;
        renderVoiceGrid();
        updateVoiceFoot();
        return;
      }

      // gallery overlay backdrop close
      if (target.id === "avatar-gallery") {
        closeAvatarGallery();
        return;
      }
      if (target.id === "voice-gallery") {
        closeVoiceGallery();
        return;
      }

      // script actions
      const sa = target.closest<HTMLElement>("[data-script-action]");
      if (sa) {
        scriptAction(sa.dataset.scriptAction ?? "");
        return;
      }

      // generic data-act
      const actEl = target.closest<HTMLElement>("[data-act]");
      if (!actEl) return;
      const act = actEl.dataset.act;
      switch (act) {
        case "start-upload":
          e.stopPropagation();
          startUpload();
          break;
        case "reset-upload":
          resetUpload();
          break;
        case "goto-2":
          goto(2);
          break;
        case "goto-3":
          goto(3);
          break;
        case "goto-1-fromupload":
          goto(1, true);
          break;
        case "goto-done":
          gotoDone();
          break;
        case "open-gen":
          openGenModal();
          break;
        case "minimize-gen":
          minimizeGen();
          break;
        case "expand-gen":
          expandGen();
          break;
        case "dev-gen-add":
          setGenPct(genPct + 10);
          break;
        case "dev-gen-complete":
          completeGen();
          after(gotoDone, 1200);
          break;
        case "dev-gen-bg":
          minimizeGen();
          break;
        case "gen-confirm":
          bodyRemove("gen-modal-open");
          after(gotoDone, 220);
          break;
        case "gen-share-panel":
          bodyRemove("gen-modal-open");
          after(gotoDone, 220);
          break;
        case "open-support":
          bodyAdd("gen-support-open");
          break;
        case "close-support":
          bodyRemove("gen-support-open");
          break;
        case "open-qr":
          e.preventDefault();
          e.stopPropagation();
          openQR();
          break;
        case "close-qr":
          closeQR();
          break;
        case "qr-light":
          setQRTheme("light");
          break;
        case "qr-dark":
          setQRTheme("dark");
          break;
        case "copy-url":
          copyShareUrl();
          break;
        case "composer-email":
          openComposer("email");
          break;
        case "composer-kakao":
          openComposer("kakao");
          break;
        case "composer-x":
          openComposer("x");
          break;
        case "composer-sms":
          openComposer("sms");
          break;
        case "close-composer":
          closeComposer();
          break;
        case "composer-send":
          closeComposer();
          showToast((actEl.dataset.cta || "") + " — 전송 준비 완료");
          break;
        case "close-drawers":
          bodyRemove("drawer-settings-open", "drawer-slides-open");
          break;
        case "toggle-settings":
          bodyToggle("drawer-settings-open");
          break;
        case "toggle-slides":
          bodyToggle("drawer-slides-open");
          break;
        case "nav-prev":
          navSlide(-1);
          break;
        case "nav-next":
          navSlide(1);
          break;
        case "open-avatar-gallery":
          openAvatarGallery();
          break;
        case "open-voice-gallery":
          openVoiceGallery();
          break;
        case "play-primary":
          e.stopPropagation();
          playVoicePreview("primary");
          break;
        case "play-secondary":
          e.stopPropagation();
          playVoicePreview("secondary");
          break;
        case "seg": {
          const grp = actEl.parentElement;
          grp
            ?.querySelectorAll(".seg-opt")
            .forEach((b) => b.classList.remove("on"));
          actEl.classList.add("on");
          break;
        }
        case "switch":
          actEl.classList.toggle("on");
          break;
        case "radio": {
          const grp = actEl.parentElement;
          grp
            ?.querySelectorAll("label")
            .forEach((l) => l.classList.remove("on"));
          actEl.classList.add("on");
          const inp = actEl.querySelector<HTMLInputElement>("input");
          if (inp) inp.checked = true;
          break;
        }
        case "toast-analytics":
          showToast("학습 분석은 곧 제공됩니다");
          break;
        case "toast-qrpng":
          showToast("QR 이미지가 다운로드되었어요");
          break;
        case "toast-qrppt":
          showToast("PPT 슬라이드 템플릿이 다운로드되었어요");
          break;
        case "toast-qrpdf":
          showToast("A4 인쇄용 PDF가 다운로드되었어요");
          break;
        case "iv-quick":
          showQuickModal();
          break;
        case "iv-quick-close":
          closeQuick();
          break;
        case "iv-quick-proceed":
          quickProceed();
          break;
        case "iv-dev-advance":
          devAdvance();
          break;
        case "iv-dev-complete":
          ivDevComplete();
          break;
        case "iv-dev-reset":
          startScenario(ISTATE.scenario);
          break;
        case "iv-gallery-hint":
          aiSay(
            "전체 아바타 12명은 마법사 메인 화면에서 갤러리로 확인하실 수 있어요. 지금은 추천된 3명 중에서 골라주세요.",
            350
          );
          break;
        default:
          break;
      }
    };
    root.addEventListener("click", onClick);

    const onAvatarSearch = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t && t.id === "avatar-search") {
        gstate.avatar.search = t.value;
        renderAvatarGrid();
      }
    };
    root.addEventListener("input", onAvatarSearch);

    const onKeydown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (bodyHas("gallery-avatar-open")) closeAvatarGallery();
      else if (bodyHas("gallery-voice-open")) closeVoiceGallery();
      else if (bodyHas("qr-open")) closeQR();
      else if (bodyHas("composer-open")) closeComposer();
    };
    root.addEventListener("keydown", onKeydown);

    // first-view: auto-start upload sim after a beat
    after(() => {
      if ($('.screen[data-screen="1"]')?.classList.contains("active"))
        startUpload();
    }, 600);

    // start interview scenario B in the background (matches original)
    startScenario("B");

    return () => {
      disposed = true;
      timers.forEach((t) => clearTimeout(t));
      intervals.forEach((t) => clearInterval(t));
      if (toastTimer) clearTimeout(toastTimer);
      if (voicePreviewTimer) clearTimeout(voicePreviewTimer);
      if (voiceToastTimer) clearTimeout(voiceToastTimer);
      root.removeEventListener("click", onClick);
      root.removeEventListener("input", onAvatarSearch);
      root.removeEventListener("keydown", onKeydown);
      composer?.removeEventListener("input", onComposerInput);
      composer?.removeEventListener("keyup", refreshSendBtn);
      composer?.removeEventListener("change", refreshSendBtn);
      composer?.removeEventListener("keydown", onComposerKeydown);
      sendBtn?.removeEventListener("click", sendUserMessage);
      ["dragenter", "dragover"].forEach((ev) =>
        dz?.removeEventListener(ev, dzPrevent)
      );
      ["dragleave", "drop"].forEach((ev) =>
        dz?.removeEventListener(ev, dzLeave)
      );
      dz?.removeEventListener("drop", dzDrop);
      dz?.removeEventListener("keydown", dzKey);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="lc-root"
      /* 정적 프로토타입 마크업(신뢰된 모듈 상수)을 1회 주입한 뒤
         ref 로 명령형 제어 — 원본 standalone 과 동일한 패턴. */
      dangerouslySetInnerHTML={{ __html: PROTOTYPE_HTML }}
    />
  );
}
