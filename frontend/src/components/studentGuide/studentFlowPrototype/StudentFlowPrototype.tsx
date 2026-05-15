"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import "./studentFlow.css";

/**
 * 학습자 가이드 — 학생 흐름 프로토타입 (React 재구현, 2026-05-15).
 *
 * 원본: docs/prototypes/06-student-flow.html (데스크탑 고정 standalone).
 * iframe 임베드를 대체하는 모바일 반응형 React 컴포넌트.
 *
 * 4개 화면을 좌측(모바일은 하단) DEMO 네비게이션으로 전환:
 *   1) `/v/[강의ID]` 진입 (라이트)
 *   2) 학교 이메일 회원가입 3단계 (라이트)
 *   3) 1분 온보딩 4슬라이드 (라이트 → 다크 전환)
 *   4) 영상 시청 + Q&A + 인터스티셜 퀴즈 (다크 퀴즈/화이트 영상)
 *
 * 정책 근거: docs/planning/06-student-pages.md.
 * 원본 vanilla JS 는 모두 React hook(useState/useEffect/useRef)으로 포팅.
 * localStorage 미사용 (CLAUDE.md 금지) — 모든 상태는 React state.
 */

const SCHOOL_DOMAINS: Record<string, string> = {
  "kgu.ac.kr": "경기대학교",
  "snu.ac.kr": "서울대학교",
  "korea.ac.kr": "고려대학교",
  "yonsei.ac.kr": "연세대학교",
  "kaist.ac.kr": "카이스트",
  "postech.ac.kr": "포항공대",
  "hanyang.ac.kr": "한양대학교",
  "skku.edu": "성균관대학교",
};

const OB_TIMINGS: Record<number, number> = { 1: 8000, 2: 8000, 3: 8000, 4: 6000 };

const QA_ANSWERS: Record<string, string> = {
  "把자문은 언제 사용하나요?":
    "《把字句》는 주어가 대상(목적어)에 어떤 처치·영향을 가했는지 강조할 때 씁니다. 예: “他把书看完了” — “그가 책을 (다) 읽어버렸다”처럼 “다 읽으면서 동작이 완결되는” 대상의 상태 변화를 강조합니다.",
  "일반 어순과 어떻게 다른가요?":
    "일반 SVO(주어–동사–목적어)와 달리, 《把字句》는 “把 + 목적어 + 동사” 순서로 목적어를 동사 앞으로 끌어당깁니다. 이는 동작의 “처치·결과”를 담는 어조를 만들며, 목적어는 대개 특정적·한정적입니다.",
};

type ScreenId = 1 | 2 | 3 | 4;
type QaMsg = { id: number; role: "bot" | "me"; text: string; source?: string };

const NAV = [
  { go: 1 as ScreenId, num: "01 LIGHT", label: "진입" },
  { go: 2 as ScreenId, num: "02 LIGHT", label: "가입" },
  { go: 3 as ScreenId, num: "03 L→D", label: "온보딩" },
  { go: 4 as ScreenId, num: "04 DARK", label: "시청" },
];

export default function StudentFlowPrototype() {
  const uid = useId();
  const [screen, setScreen] = useState<ScreenId>(1);

  // ── Screen 2 (signup) state ──
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [email, setEmail] = useState("");
  const [emailState, setEmailState] = useState<"" | "valid" | "invalid">("");
  const [validText, setValidText] = useState("학교 이메일이 확인됐어요");
  const [resendSecs, setResendSecs] = useState(60);
  const [resendLabel, setResendLabel] = useState("인증 메일 다시 보내기");
  const [resendBusy, setResendBusy] = useState(false);
  const [agree, setAgree] = useState(false);
  const [showToast, setShowToast] = useState(false);

  // ── Screen 3 (onboarding) state ──
  const [obIdx, setObIdx] = useState(1);
  const obTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Screen 4 (video / Q&A / quiz) state ──
  const [qaMsgs, setQaMsgs] = useState<QaMsg[]>([
    {
      id: 0,
      role: "bot",
      text:
        "안녕하세요! 이번 주차는 《把字句의 기본 구조》입니다. 궁금한 부분을 자유롭게 물어보세요.",
      source: "3주차 강의안",
    },
  ]);
  const msgSeq = useRef(1);
  const [micOn, setMicOn] = useState(false);
  const [reacts, setReacts] = useState([12, 4, 7, 3]);
  const [bumpIdx, setBumpIdx] = useState<number | null>(null);
  const [quizOpen, setQuizOpen] = useState(false);
  const [quizSecs, setQuizSecs] = useState(10);
  const [quizPick, setQuizPick] = useState<string | null>(null);
  const quizTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const qaBodyRef = useRef<HTMLDivElement | null>(null);
  const qaInputRef = useRef<HTMLInputElement | null>(null);

  // ── Navigation ──
  const goto = useCallback((n: ScreenId) => {
    setScreen(n);
    // 온보딩(3)에 진입할 때마다 첫 슬라이드로 초기화 — effect 대신 핸들러에서
    // 직접 처리해 effect 내 setState(cascading render) 회피.
    if (n === 3) setObIdx(1);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  // 회원가입 step 2(메일 발송) 진입 시 재전송 타이머 초기화 헬퍼.
  const armResend = useCallback(() => {
    setResendSecs(60);
    setResendBusy(false);
    setResendLabel("인증 메일 다시 보내기");
  }, []);

  // ── Screen 2 email validation (port of validateEmail) ──
  const onEmailInput = (value: string) => {
    setEmail(value);
    const v = value.trim().toLowerCase();
    if (!v) {
      setEmailState("");
      return;
    }
    const m = v.match(/^[^@\s]+@([^@\s]+)$/);
    if (!m) {
      setEmailState("invalid");
      return;
    }
    const domain = m[1];
    if (/\.ac\.kr$|\.edu$/.test(domain)) {
      const name =
        SCHOOL_DOMAINS[domain] || domain.split(".")[0].toUpperCase() + " 도메인";
      setValidText(name + " 이메일이 확인됐어요");
      setEmailState("valid");
    } else {
      setEmailState("invalid");
    }
  };

  const emailValid = emailState === "valid";

  // ── Step transitions ── (step 2 진입 시 armResend 로 타이머 초기화)
  const setStepTo = (n: 1 | 2 | 3) => {
    if (n === step) return;
    if (n === 2) armResend();
    setStep(n);
  };
  const nextStep = () =>
    setStep((s) => {
      if (s >= 3) return s;
      const next = (s + 1) as 1 | 2 | 3;
      if (next === 2) armResend();
      return next;
    });
  const prevStep = () => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s));

  // Resend countdown — ticks only while visible on step 2 with time remaining.
  // setState 초기화는 armResend(핸들러)가 담당하므로 effect 는 순수 tick 만.
  useEffect(() => {
    if (screen !== 2 || step !== 2 || resendBusy || resendSecs <= 0) return;
    const id = setInterval(() => {
      setResendSecs((t) => (t <= 1 ? 0 : t - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [screen, step, resendBusy, resendSecs]);

  const resendMail = () => {
    setResendLabel("✓ 메일을 다시 보냈어요");
    setResendBusy(true);
    setTimeout(() => {
      setResendLabel("인증 메일 다시 보내기");
      setResendBusy(false);
      setResendSecs(60);
    }, 1800);
  };

  const completeSignup = () => {
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2600);
  };

  // ── Onboarding (port of obShow / obScheduleAuto) ──
  const obShow = useCallback((n: number) => {
    if (n < 1 || n > 4) return;
    setObIdx(n);
  }, []);

  useEffect(() => {
    if (screen !== 3) {
      if (obTimer.current) clearTimeout(obTimer.current);
      return;
    }
    if (obTimer.current) clearTimeout(obTimer.current);
    if (obIdx === 4) return;
    obTimer.current = setTimeout(() => {
      setObIdx((i) => (i < 4 ? i + 1 : i));
    }, OB_TIMINGS[obIdx] || 8000);
    return () => {
      if (obTimer.current) clearTimeout(obTimer.current);
    };
  }, [screen, obIdx]);

  const obDark = screen === 3 && obIdx === 4;

  // ── Screen 4 Q&A ──
  const pushQuestion = (text: string) => {
    const myId = msgSeq.current++;
    setQaMsgs((m) => [...m, { id: myId, role: "me", text }]);
    setTimeout(() => {
      const answer =
        QA_ANSWERS[text] || "강의 자료에서 관련 내용을 찾아 답변드릴게요.";
      setQaMsgs((m) => [
        ...m,
        {
          id: msgSeq.current++,
          role: "bot",
          text: answer,
          source: "3주차 강의안 · p.12",
        },
      ]);
    }, 280);
  };

  useEffect(() => {
    const el = qaBodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [qaMsgs]);

  const onAskSubmit = (e: FormEvent) => {
    e.preventDefault();
    const val = qaInputRef.current?.value.trim();
    if (!val) return;
    pushQuestion(val);
    if (qaInputRef.current) qaInputRef.current.value = "";
  };

  const bumpReact = (i: number) => {
    setReacts((r) => r.map((c, idx) => (idx === i ? c + 1 : c)));
    setBumpIdx(i);
    setTimeout(() => setBumpIdx((b) => (b === i ? null : b)), 300);
  };

  // ── Quiz (port of quizOpen / quizClose / quizAnswer) ──
  const openQuiz = () => {
    setQuizPick(null);
    setQuizSecs(10);
    setQuizOpen(true);
  };
  const closeQuiz = useCallback(() => {
    setQuizOpen(false);
    if (quizTimer.current) {
      clearInterval(quizTimer.current);
      quizTimer.current = null;
    }
  }, []);

  useEffect(() => {
    if (!quizOpen) return;
    if (quizPick) return;
    quizTimer.current = setInterval(() => {
      setQuizSecs((t) => {
        if (t <= 1) {
          if (quizTimer.current) clearInterval(quizTimer.current);
          setQuizOpen(false);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => {
      if (quizTimer.current) clearInterval(quizTimer.current);
    };
  }, [quizOpen, quizPick]);

  const answerQuiz = (key: string) => {
    if (quizPick) return;
    if (quizTimer.current) {
      clearInterval(quizTimer.current);
      quizTimer.current = null;
    }
    setQuizPick(key);
    setTimeout(() => closeQuiz(), 1600);
  };

  const optClass = (key: string, correct: boolean) => {
    if (!quizPick) return "v4-quiz-opt";
    if (key === quizPick) return correct ? "v4-quiz-opt correct" : "v4-quiz-opt wrong";
    if (correct) return "v4-quiz-opt correct";
    return "v4-quiz-opt";
  };

  const langToggle = (
    <button className="lang-toggle" type="button" aria-label="언어 선택">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
      </svg>
      <span>KO</span>
    </button>
  );

  const brandbar = (
    <header className="brandbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <span>ClassAuto</span>
      </div>
      {langToggle}
    </header>
  );

  return (
    <div className="sf-root">
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <defs>
          <linearGradient id={`${uid}-violet`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#A78BFA" />
            <stop offset="100%" stopColor="#6366F1" />
          </linearGradient>
          <linearGradient id={`${uid}-electric`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFB627" />
            <stop offset="100%" stopColor="#F59E0B" />
          </linearGradient>
          <linearGradient id={`${uid}-cyan`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#22D3EE" />
            <stop offset="100%" stopColor="#0EA5E9" />
          </linearGradient>
          <linearGradient id={`${uid}-success`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#34D399" />
            <stop offset="100%" stopColor="#10B981" />
          </linearGradient>
        </defs>
      </svg>

      {!obDark && screen !== 4 ? <div className="aurora-light" aria-hidden="true" /> : null}

      <div className="screens">
        {/* ───── SCREEN 1 · entry (light) ───── */}
        <section className={`screen${screen === 1 ? " active" : ""}`}>
          {brandbar}
          <div className="s1-wrap">
            <div className="sender">
              <div className="sender-avatar" aria-hidden="true">하</div>
              <div className="sender-text">
                <div className="who"><strong>하두진 교수님</strong>이 보낸 강의입니다</div>
                <div className="sub">경기대학교 · 중국어문법의 이해</div>
              </div>
              <span className="sender-verified" title="기관 인증 교수자">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                인증
              </span>
            </div>

            <div className="course">
              <div className="course-head">
                <div className="course-icon" aria-hidden="true">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={`url(#${uid}-violet)`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14z" />
                    <path d="M6.5 17H20v4H6.5A2.5 2.5 0 0 1 4 18.5v0A2.5 2.5 0 0 1 6.5 17z" />
                    <path d="M9 7h7" />
                  </svg>
                </div>
                <div className="course-meta">
                  <div className="course-tag">3주차 · Lesson 07</div>
                  <h1 className="course-title">
                    <span className="han">把</span>자문<span className="pcl"> (把字句) </span>입문
                  </h1>
                  <div className="course-sub">
                    <span>경기대학교</span>
                    <span className="dot">·</span>
                    <span>중국어문법의 이해</span>
                  </div>
                </div>
              </div>
              <div className="course-stats">
                <div className="stat" title="영상 길이">
                  <svg viewBox="0 0 24 24" fill="none" stroke={`url(#${uid}-cyan)`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" />
                    <polyline points="12 7 12 12 15 14" />
                  </svg>
                  <span className="numeric"><span className="v">5분 12초</span></span>
                </div>
                <div className="stat" title="누적 시청">
                  <svg viewBox="0 0 24 24" fill="none" stroke={`url(#${uid}-violet)`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  <span className="numeric"><span className="v">23</span>명 학습 중</span>
                </div>
                <div className="stat" title="평균 정답률">
                  <svg viewBox="0 0 24 24" fill="none" stroke={`url(#${uid}-success)`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="3 17 9 11 13 15 21 7" />
                    <polyline points="14 7 21 7 21 14" />
                  </svg>
                  <span className="numeric"><span className="v">82%</span></span>
                </div>
              </div>
            </div>

            <div className="reqs">
              <div className="reqs-title">시청 조건</div>
              <ul className="reqs-list">
                <li>
                  <svg className="ok" viewBox="0 0 24 24" fill="none" stroke={`url(#${uid}-success)`} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  학교 이메일 인증 <span style={{ color: "var(--sf-text-light-subtle)" }}>(.ac.kr)</span>
                </li>
                <li>
                  <span className="or">또는</span>
                  학습 코드 입력 <code className="numeric">ABCD-1234</code>
                </li>
              </ul>
            </div>

            <div className="actions">
              <button className="btn btn-gold" type="button" onClick={() => goto(2)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="m3 7 9 6 9-6" />
                </svg>
                학교 이메일로 시작
                <svg className="arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="13 6 19 12 13 18" />
                </svg>
              </button>
              <button className="btn btn-outline-light" type="button">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="11" width="18" height="10" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                학습 코드로 시작
                <svg className="arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="13 6 19 12 13 18" />
                </svg>
              </button>
            </div>

            <div className="tut">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={`url(#${uid}-electric)`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 18h6M10 22h4M12 2a7 7 0 0 1 4 12.7c-.5.4-.8.9-.9 1.5l-.1.8H9.1l-.1-.8c-.1-.6-.4-1.1-.9-1.5A7 7 0 0 1 12 2z" />
              </svg>
              처음 사용하시나요?{" "}
              <a onClick={() => goto(3)}>1분 안내 보기 →</a>
            </div>

            <div className="s1-foot">
              <div>
                ClassAuto는 학생 학습 도구입니다. 광고를 사용하지 않으며, 시청 데이터는 해당 강의 교수자만 볼 수 있습니다.
              </div>
              <div><a href="#">학생 데이터 보호 정책 보기 →</a></div>
            </div>
          </div>
        </section>

        {/* ───── SCREEN 2 · signup (light) ───── */}
        <section className={`screen${screen === 2 ? " active" : ""}`}>
          {brandbar}
          <div className="s2-wrap">
            <button
              className={`s2-back${step === 1 ? " hidden" : ""}`}
              type="button"
              onClick={prevStep}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="11 18 5 12 11 6" />
              </svg>
              이전 단계로
            </button>

            <div className="progress">
              <div
                className="progress-dots"
                role="progressbar"
                aria-valuemin={1}
                aria-valuemax={3}
                aria-valuenow={step}
              >
                {[1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className={`progress-dot${i < step ? " done" : ""}${i === step ? " current" : ""}`}
                  />
                ))}
              </div>
              <span className="progress-label">
                <span className="now">{step}</span> / 3
              </span>
            </div>

            <div className="step-card">
              <div className="dev-bar" role="group" aria-label="데모 단계 이동">
                <span className="dev-label">DEV</span>
                {([1, 2, 3] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={step === n ? "is-active" : ""}
                    onClick={() => setStepTo(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>

              {/* Step 1 · email */}
              <div className={`step${step === 1 ? " active" : ""}`}>
                <div className="step-head">
                  <h2>학교 이메일을<br />입력해주세요</h2>
                  <p>
                    ClassAuto는 학교 이메일로만 가입할 수 있어요.<br />
                    경기대학교(.ac.kr) 이메일을 사용해주세요.
                  </p>
                </div>
                <div className="field">
                  <label className="field-label" htmlFor={`${uid}-email`}>학교 이메일</label>
                  <div className={`input-wrap${emailState ? ` ${emailState}` : ""}`}>
                    <span className="lead" aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="5" width="18" height="14" rx="2" />
                        <path d="m3 7 9 6 9-6" />
                      </svg>
                    </span>
                    <input
                      id={`${uid}-email`}
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      placeholder="name@kgu.ac.kr"
                      value={email}
                      onChange={(e) => onEmailInput(e.target.value)}
                    />
                    <span className="trail" aria-hidden="true">
                      {emailState === "invalid" ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </span>
                  </div>
                  <div className={`field-hint${emailState ? ` ${emailState}` : ""}`}>
                    <span className="hint-default">학교에서 발급한 .ac.kr 이메일을 입력해주세요</span>
                    <span className="hint-valid">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>{validText}</span>
                    </span>
                    <span className="hint-invalid">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="13" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      학교 이메일(.ac.kr)을 입력해주세요
                    </span>
                  </div>
                </div>
                <div className="step-actions">
                  <button
                    className="btn btn-gold"
                    type="button"
                    disabled={!emailValid}
                    onClick={nextStep}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M22 2 11 13" />
                      <path d="M22 2 15 22 11 13 2 9 22 2z" />
                    </svg>
                    인증 메일 보내기
                    <svg className="arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="13 6 19 12 13 18" />
                    </svg>
                  </button>
                  <div className="alt-link">
                    또는 <a onClick={() => goto(1)}>학습 코드로 시작 →</a>
                  </div>
                </div>
              </div>

              {/* Step 2 · mail sent */}
              <div className={`step${step === 2 ? " active" : ""}`}>
                <div className="illust" aria-hidden="true">
                  <span className="floater a" />
                  <span className="floater b" />
                  <span className="floater c" />
                  <svg viewBox="0 0 48 48" fill="none">
                    <defs>
                      <linearGradient id={`${uid}-env`} x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#FFB627" />
                        <stop offset="100%" stopColor="#E89E0E" />
                      </linearGradient>
                      <linearGradient id={`${uid}-env-flap`} x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#FFC74D" />
                        <stop offset="100%" stopColor="#FFB627" />
                      </linearGradient>
                    </defs>
                    <rect x="6" y="12" width="36" height="26" rx="4" fill={`url(#${uid}-env)`} />
                    <path d="M6 16l18 12 18-12" stroke="#FFFCF3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    <path d="M6 16l18 12 18-12V14a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v2z" fill={`url(#${uid}-env-flap)`} />
                    <circle cx="38" cy="12" r="5" fill="#10B981" stroke="#FFFCF3" strokeWidth="1.5" />
                    <path d="M35.5 12l1.8 1.8 3.2-3.2" stroke="#FFFCF3" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  </svg>
                </div>
                <div className="step-head" style={{ textAlign: "center", alignItems: "center" }}>
                  <h2>메일을 보내드렸어요</h2>
                  <p>링크를 클릭하면 자동으로<br />다음 단계로 이동합니다.</p>
                </div>
                <div className="email-pill">
                  <span className="dot" aria-hidden="true" />
                  <span>{email.trim() || "name@kgu.ac.kr"}</span>
                </div>
                <div className="helper-card">
                  <div className="helper-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#0EA5E9" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                  </div>
                  <div className="helper-body">
                    <span className="helper-title">메일이 안 보이세요?</span>
                    <span className="helper-sub">스팸 메일함도 한 번 확인해주세요. 대부분 1분 이내에 도착해요.</span>
                  </div>
                </div>
                <div className="resend">
                  <button
                    type="button"
                    disabled={resendBusy || resendSecs > 0}
                    onClick={resendMail}
                  >
                    {resendLabel}
                  </button>
                  {resendSecs > 0 && !resendBusy ? (
                    <span className="timer"> · <span>{resendSecs}</span>초 뒤 가능</span>
                  ) : null}
                </div>
                <button
                  className="demo-advance"
                  type="button"
                  onClick={nextStep}
                  aria-label="데모: 인증 링크 클릭 시뮬레이션"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  데모: 링크 클릭 시뮬레이션
                </button>
              </div>

              {/* Step 3 · additional info */}
              <div className={`step${step === 3 ? " active" : ""}`}>
                <div className="step-head">
                  <h2>거의 다 됐어요</h2>
                  <p>마지막으로 몇 가지만 알려주세요.</p>
                </div>
                <div className="form-grid">
                  <div className="field">
                    <label className="field-label" htmlFor={`${uid}-name`}>이름</label>
                    <div className="input-wrap compact">
                      <input id={`${uid}-name`} type="text" autoComplete="name" placeholder="홍길동" />
                    </div>
                  </div>
                  <div className="field">
                    <label className="field-label" htmlFor={`${uid}-sid`}>학번</label>
                    <div className="input-wrap compact">
                      <input id={`${uid}-sid`} type="text" inputMode="numeric" autoComplete="off" placeholder="202012345" />
                    </div>
                  </div>
                  <div className="field full">
                    <label className="field-label" htmlFor={`${uid}-school`}>학교</label>
                    <div className="input-wrap compact locked">
                      <span className="lead" aria-hidden="true">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 21V8l9-5 9 5v13" />
                          <path d="M9 21V12h6v9" />
                        </svg>
                      </span>
                      <input id={`${uid}-school`} type="text" defaultValue="경기대학교" readOnly />
                      <span className="auto-tag">자동 매칭</span>
                    </div>
                  </div>
                  <div className="field full">
                    <label className="field-label" htmlFor={`${uid}-major`}>학과 / 전공</label>
                    <div className="input-wrap compact has-chevron">
                      <span className="lead" aria-hidden="true">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                        </svg>
                      </span>
                      <select id={`${uid}-major`} defaultValue="">
                        <option value="">학과를 선택해주세요</option>
                        <option>중어중문학과</option>
                        <option>국어국문학과</option>
                        <option>영어영문학과</option>
                        <option>일어일문학과</option>
                        <option>사업경영학과</option>
                        <option>광고홍보학과</option>
                        <option>전자공학과</option>
                        <option>컴퓨터과학과</option>
                        <option>기타</option>
                      </select>
                    </div>
                  </div>
                  <div className="field full">
                    <span className="field-label">학년</span>
                    <div className="radio-group" role="radiogroup" aria-label="학년 선택">
                      {[
                        { v: "1", l: "1학년" },
                        { v: "2", l: "2학년" },
                        { v: "3", l: "3학년" },
                        { v: "4", l: "4학년" },
                        { v: "g", l: "대학원" },
                      ].map((y) => (
                        <label key={y.v} className="radio-chip">
                          <input type="radio" name={`${uid}-year`} value={y.v} defaultChecked={y.v === "3"} />
                          {y.l}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="policy-block">
                  <div className="policy-head">
                    <span>데이터 처리 사전 고지</span>
                    <span className="line" />
                  </div>
                  <div className="policy-cards">
                    <div className="policy-card violet">
                      <div className="policy-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="20" x2="18" y2="10" />
                          <line x1="12" y1="20" x2="12" y2="4" />
                          <line x1="6" y1="20" x2="6" y2="14" />
                        </svg>
                      </div>
                      <span className="policy-label">수집 데이터</span>
                      <span className="policy-value">영상 시청 · Q&amp;A · 출석</span>
                    </div>
                    <div className="policy-card cyan">
                      <div className="policy-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="#0EA5E9" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </div>
                      <span className="policy-label">열람 권한</span>
                      <span className="policy-value">해당 강의 <span className="em">교수자만</span></span>
                    </div>
                    <div className="policy-card amber">
                      <div className="policy-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="#E89E0E" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          <path d="M10 11v6M14 11v6" />
                        </svg>
                      </div>
                      <span className="policy-label">삭제 정책</span>
                      <span className="policy-value"><span className="em">졸업 후</span> 자동 삭제</span>
                    </div>
                  </div>
                </div>

                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={agree}
                    onChange={(e) => setAgree(e.target.checked)}
                  />
                  <span className="check-box" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                  <span className="check-text">
                    <span className="check-title">데이터 처리 방침에 동의합니다<span className="req"> · 필수</span></span>
                    <span className="check-sub">위 3가지 조건을 확인하고 동의합니다.</span>
                  </span>
                </label>

                <div className="step-actions">
                  <button
                    className="btn btn-gold"
                    type="button"
                    disabled={!agree}
                    onClick={completeSignup}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    가입 완료
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className={`toast${showToast ? " show" : ""}`} role="status" aria-live="polite">
            <span className="toast-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
            가입이 완료됐어요. 공부하러 가볼까요?
          </div>
        </section>

        {/* ───── SCREEN 3 · onboarding (light → dark) ───── */}
        <section className={`screen${screen === 3 ? " active" : ""}`}>
          <div className={`ob${obDark ? " dark" : ""}`}>
            <div className="ob-top">
              <div className="ob-dots">
                {[1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    className={`ob-dot${i < obIdx ? " done" : ""}${i === obIdx ? " current" : ""}`}
                  />
                ))}
              </div>
              <button className="ob-skip" type="button" onClick={() => goto(4)}>건너뛰기 →</button>
            </div>

            <div className="ob-stage">
              <div className={`ob-slide${obIdx === 1 ? " active" : ""}`}>
                <div className="ob-illust">
                  <span className="ring" />
                  <svg viewBox="0 0 220 220" fill="none">
                    <circle cx="110" cy="110" r="82" fill={`url(#${uid}-electric)`} opacity="0.15" />
                    <circle cx="110" cy="110" r="66" fill="none" stroke={`url(#${uid}-electric)`} strokeWidth="2.5" strokeDasharray="4 6" />
                    <circle cx="110" cy="110" r="52" fill={`url(#${uid}-electric)`} />
                    <path d="M96 86l38 24-38 24V86z" fill="#0A0A0A" />
                  </svg>
                </div>
                <h2 className="ob-head">영상을 보면서 배워요</h2>
                <p className="ob-sub">원하는 시점에 멈추고, 되돌리고, 다시 보세요.<br />교수자는 단 한 번만 설명하면 됩니다.</p>
              </div>

              <div className={`ob-slide${obIdx === 2 ? " active" : ""}`}>
                <div className="ob-illust">
                  <span className="ring" />
                  <svg viewBox="0 0 220 220" fill="none">
                    <path d="M44 70a16 16 0 0 1 16-16h82a16 16 0 0 1 16 16v52a16 16 0 0 1-16 16H92l-24 20v-20H60a16 16 0 0 1-16-16V70z" fill={`url(#${uid}-violet)`} opacity="0.85" />
                    <path d="M112 86a16 16 0 0 1 16-16h32a16 16 0 0 1 16 16v40a16 16 0 0 1-16 16h-8l16 18-26-18h-14a16 16 0 0 1-16-16V86z" fill={`url(#${uid}-cyan)`} opacity="0.85" />
                    <circle cx="82" cy="96" r="4" fill="#FFFFFF" />
                    <circle cx="100" cy="96" r="4" fill="#FFFFFF" />
                    <circle cx="118" cy="96" r="4" fill="#FFFFFF" />
                  </svg>
                </div>
                <h2 className="ob-head">궁금한 건 물어보세요</h2>
                <p className="ob-sub">AI 도우미가 강의 자료 범위 안에서<br />정확한 소스를 함께 답해줘요.</p>
              </div>

              <div className={`ob-slide${obIdx === 3 ? " active" : ""}`}>
                <div className="ob-illust">
                  <span className="ring" />
                  <svg viewBox="0 0 220 220" fill="none">
                    <ellipse cx="110" cy="126" rx="58" ry="68" fill="#BFB39A" />
                    <ellipse cx="110" cy="94" rx="56" ry="52" fill="#A99B7E" />
                    <path d="M62 60c2-12 12-20 22-20s14 8 14 20l-4 12-32-12z" fill="#8C7E63" />
                    <path d="M158 60c-2-12-12-20-22-20s-14 8-14 20l4 12 32-12z" fill="#8C7E63" />
                    <circle cx="88" cy="96" r="14" fill="#FFFFFF" />
                    <circle cx="132" cy="96" r="14" fill="#FFFFFF" />
                    <circle cx="88" cy="102" r="6" fill="#0A0A0A" />
                    <circle cx="132" cy="102" r="6" fill="#0A0A0A" />
                    <path d="M104 124l6 6 6-6" stroke="#5C5141" strokeWidth="3" strokeLinecap="round" fill="none" />
                    <path d="M96 144q14 -8 28 0" stroke="#5C5141" strokeWidth="2.6" strokeLinecap="round" fill="none" />
                    <text x="170" y="58" fontFamily="sans-serif" fontSize="32" fontWeight="800" fill="#FFB627">?</text>
                  </svg>
                </div>
                <h2 className="ob-head">가끔 퀴즈가 나와요</h2>
                <p className="ob-sub">잠깐 이해도를 확인하는 시간이에요.<br />틀려도 괜찮아요 — 다시 볼 수 있어요.</p>
              </div>

              <div className={`ob-slide${obIdx === 4 ? " active" : ""}`}>
                <div className="ob-illust">
                  <span className="ring" />
                  <svg viewBox="0 0 220 220" fill="none">
                    <circle cx="110" cy="110" r="82" fill={`url(#${uid}-success)`} opacity="0.18" />
                    <circle cx="110" cy="110" r="62" fill={`url(#${uid}-success)`} />
                    <path d="M82 110l22 22 38-44" stroke="#0A0A0A" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                  </svg>
                </div>
                <h2 className="ob-head">이해했나요?</h2>
                <p className="ob-sub">이제 함께 공부해볼 시간이에요.</p>
                <button className="ob-cta" type="button" onClick={() => goto(4)}>
                  영상 시작하기
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="13 6 19 12 13 18" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="ob-bottom">
              <button
                className="ob-arrow"
                type="button"
                onClick={() => obShow(obIdx - 1)}
                aria-label="이전"
                disabled={obIdx === 1}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <span className="ob-count"><span>{obIdx}</span> / 4</span>
              <button
                className="ob-arrow"
                type="button"
                onClick={() => obShow(obIdx + 1)}
                aria-label="다음"
                disabled={obIdx === 4}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          </div>
        </section>

        {/* ───── SCREEN 4 · video viewer ───── */}
        <section className={`screen${screen === 4 ? " active" : ""}`}>
          <div className="v4">
            <header className="v4-bar">
              <div className="v4-course">
                <span className="crumb">3주차 · 수업 중</span>
                <span className="title">
                  <span className="han">把자문</span>(把字句) 입문 · 이해와 활용 · 3주차
                </span>
              </div>
              <div className="v4-user">
                <button type="button" aria-label="설정">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
                  </svg>
                </button>
                <div className="info">
                  <span className="name">홍길동</span>
                  <span className="school">경기대학교 · 중어중문 3학년</span>
                </div>
                <div className="avatar" aria-hidden="true">홍</div>
              </div>
            </header>

            <div className="v4-body">
              <div className="v4-stage">
                <div className="v4-video">
                  <div className="v4-video-placeholder">
                    <div className="play-orb">
                      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M7 4.5v15a1 1 0 0 0 1.55.83l11-7.5a1 1 0 0 0 0-1.66l-11-7.5A1 1 0 0 0 7 4.5z" />
                      </svg>
                    </div>
                    <span className="label">강의 영상 · 12:34</span>
                  </div>
                </div>

                <div className="v4-controls">
                  <div className="v4-progress">
                    <div className="v4-progress-buffer" />
                    <div className="v4-progress-fill" />
                  </div>
                  <div className="v4-controls-row">
                    <div className="left">
                      <button className="v4-ctrl play" type="button" aria-label="재생/일시정지">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                          <rect x="6" y="5" width="4" height="14" rx="1" />
                          <rect x="14" y="5" width="4" height="14" rx="1" />
                        </svg>
                      </button>
                      <button className="v4-ctrl" type="button" aria-label="10초 뒤로">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 17l-5-5 5-5" />
                          <path d="M6 12h8a6 6 0 1 1 0 12h-2" />
                        </svg>
                      </button>
                      <button className="v4-ctrl" type="button" aria-label="10초 앞으로">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M13 17l5-5-5-5" />
                          <path d="M18 12h-8a6 6 0 1 0 0 12h2" />
                        </svg>
                      </button>
                      <span className="v4-time">2:54 / 12:34</span>
                    </div>
                    <div className="reacts" role="group" aria-label="익명 반응">
                      <button className={`v4-react${bumpIdx === 0 ? " bumping" : ""}`} type="button" aria-label="좋아요" onClick={() => bumpReact(0)}>
                        <svg viewBox="0 0 24 24" fill={`url(#${uid}-electric)`} stroke="none">
                          <path d="M7 22V11l5-8a2 2 0 0 1 3 2l-1 6h4a3 3 0 0 1 3 3l-2 7a3 3 0 0 1-3 2h-9z" />
                        </svg>
                        <span className="count">{reacts[0]}</span>
                      </button>
                      <button className={`v4-react${bumpIdx === 1 ? " bumping" : ""}`} type="button" aria-label="궁금해요" onClick={() => bumpReact(1)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke={`url(#${uid}-violet)`} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="9" />
                          <path d="M9.5 9a2.5 2.5 0 1 1 4.5 1.6c-1 .8-1.5 1.2-1.5 2.4" />
                          <circle cx="12" cy="17" r="0.6" fill="currentColor" />
                        </svg>
                        <span className="count">{reacts[1]}</span>
                      </button>
                      <button className={`v4-react${bumpIdx === 2 ? " bumping" : ""}`} type="button" aria-label="재미있어요" onClick={() => bumpReact(2)}>
                        <svg viewBox="0 0 24 24" fill={`url(#${uid}-success)`} stroke="none">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M8 14q4 4 8 0" stroke="#0A0A0A" strokeWidth="1.8" fill="none" strokeLinecap="round" />
                          <circle cx="9" cy="10" r="1.2" fill="#0A0A0A" />
                          <circle cx="15" cy="10" r="1.2" fill="#0A0A0A" />
                        </svg>
                        <span className="count">{reacts[2]}</span>
                      </button>
                      <button className={`v4-react${bumpIdx === 3 ? " bumping" : ""}`} type="button" aria-label="아하—그렇구나" onClick={() => bumpReact(3)}>
                        <svg viewBox="0 0 24 24" fill="none">
                          <path d="M12 3l1.5 4 4 .4-3 2.8.9 4-3.4-2-3.4 2 .9-4-3-2.8 4-.4z" fill={`url(#${uid}-electric)`} />
                          <path d="M12 14v6" stroke={`url(#${uid}-electric)`} strokeWidth="2.2" strokeLinecap="round" />
                        </svg>
                        <span className="count">{reacts[3]}</span>
                      </button>
                    </div>
                    <div className="right">
                      <button className="v4-quiz-trigger" type="button" onClick={openQuiz}>DEMO · 퀴즈 트리거</button>
                      <button className="v4-ctrl" type="button" aria-label="자막">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="5" width="18" height="14" rx="2" />
                          <line x1="7" y1="11" x2="11" y2="11" />
                          <line x1="7" y1="15" x2="15" y2="15" />
                        </svg>
                      </button>
                      <button className="v4-ctrl" type="button" aria-label="전체화면">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <aside className="v4-qa" aria-label="Q&amp;A 패널">
                <div className="v4-qa-head">
                  <h3>강의 Q&amp;A</h3>
                  <span className="ask-pill">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    질문하기
                  </span>
                </div>
                <div className="v4-qa-quota">
                  <span className="pill">편당 23 / 100</span>
                  <span>· 오늘 12 / 30</span>
                </div>
                <div className="v4-qa-body" ref={qaBodyRef}>
                  {qaMsgs.map((m) => (
                    <div key={m.id} className={`v4-msg ${m.role}`}>
                      <span className="av">{m.role === "bot" ? "AI" : "나"}</span>
                      <div>
                        <div className="v4-bubble">{m.text}</div>
                        {m.source ? (
                          <span className="v4-source">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 22s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12z" />
                            </svg>
                            {m.source}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="v4-suggest">
                  <span className="lbl">추천 질문</span>
                  <button className="v4-chip" type="button" onClick={() => pushQuestion("把자문은 언제 사용하나요?")}>
                    把자문은 언제 사용하나요?
                  </button>
                  <button className="v4-chip" type="button" onClick={() => pushQuestion("일반 어순과 어떻게 다른가요?")}>
                    일반 어순과 어떻게 다른가요?
                  </button>
                </div>
                <form className="v4-input" onSubmit={onAskSubmit}>
                  <button
                    type="button"
                    className={`mic-btn${micOn ? " on" : ""}`}
                    onClick={() => setMicOn((v) => !v)}
                    aria-label="음성으로 질문하기"
                    aria-pressed={micOn}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="3" width="6" height="12" rx="3" />
                      <path d="M5 11a7 7 0 0 0 14 0" />
                      <line x1="12" y1="18" x2="12" y2="22" />
                      <line x1="8" y1="22" x2="16" y2="22" />
                    </svg>
                  </button>
                  <div className="ip-wrap">
                    <input ref={qaInputRef} type="text" placeholder="강의 내용을 물어보세요…" />
                  </div>
                  <button className="send" type="submit" aria-label="보내기">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" />
                    </svg>
                  </button>
                </form>
              </aside>
            </div>

            <div className={`v4-quiz${quizOpen ? " show" : ""}`} role="dialog" aria-modal="true">
              <div className="v4-quiz-card">
                <div className="v4-quiz-top">
                  <span className="badge">잠깐 퀴즈</span>
                  <span className="timer">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="9" />
                      <polyline points="12 7 12 12 15 14" />
                    </svg>
                    <span>{quizSecs}</span>초
                  </span>
                </div>
                <h3 className="v4-quiz-q">把자문에서 把 뒤에 오는 명사는 어떤 의미를 가질까요?</h3>
                <div className="v4-quiz-opts">
                  {[
                    { k: "a", t: "동작의 주체", correct: false },
                    { k: "b", t: "동작의 대상", correct: true },
                    { k: "c", t: "동작의 장소", correct: false },
                    { k: "d", t: "동작의 시간", correct: false },
                  ].map((o) => (
                    <button
                      key={o.k}
                      className={optClass(o.k, o.correct)}
                      type="button"
                      onClick={() => answerQuiz(o.k)}
                    >
                      <span className="letter">{o.k.toUpperCase()}</span>
                      <span>{o.t}</span>
                    </button>
                  ))}
                </div>
                <div className="v4-quiz-foot">
                  <div className="v4-quiz-mascot">
                    <span className="av">
                      <svg viewBox="0 0 32 32" fill="currentColor">
                        <ellipse cx="16" cy="19" rx="9" ry="10" />
                        <ellipse cx="16" cy="13" rx="8" ry="7" fill="#A99B7E" />
                        <circle cx="12" cy="13" r="2" fill="#FFFFFF" />
                        <circle cx="20" cy="13" r="2" fill="#FFFFFF" />
                        <circle cx="12" cy="14" r="0.9" fill="#0A0A0A" />
                        <circle cx="20" cy="14" r="0.9" fill="#0A0A0A" />
                      </svg>
                    </span>
                    <span className="says">잠깐 생각해볼까요?<br />틀려도 괜찮아요.</span>
                  </div>
                  <button
                    className="ob-skip"
                    type="button"
                    onClick={closeQuiz}
                    style={{ color: "rgba(255,255,255,0.45)" }}
                  >
                    닫기
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <nav className="demo-nav" aria-label="화면 데모 네비게이션">
        <div className="demo-nav-head">
          <span className="label">Demo Navigation</span>
          <span className="pill">Dev</span>
        </div>
        <div className="demo-nav-list">
          {NAV.map((n) => (
            <button
              key={n.go}
              className={`demo-nav-btn${screen === n.go ? " active" : ""}`}
              type="button"
              onClick={() => goto(n.go)}
            >
              <span className="num">{n.num}</span>
              <span>{n.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
