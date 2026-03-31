"use client";

interface Props {
  warningLevel: number;
  onResume: () => void;
}

const WARNINGS = [
  { bg: "", message: "" },
  { bg: "from-amber-500/90 to-amber-600/90", message: "집중해 주세요!" },
  { bg: "from-orange-500/90 to-orange-600/90", message: "대면 수업 때 혼나요!" },
  { bg: "from-red-500/90 to-red-600/90", message: "이러면 점수 드릴 수가 없어요" },
];

export default function AttentionPauseOverlay({ warningLevel, onResume }: Props) {
  const level = Math.min(warningLevel, 3);
  const { bg, message } = WARNINGS[level] || WARNINGS[3];

  return (
    <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br ${bg}`}>
      <div className="text-center text-white space-y-6">
        <div className="text-6xl">
          {level === 1 ? "😐" : level === 2 ? "😅" : "😢"}
        </div>
        <h2 className="text-2xl font-bold">{message}</h2>
        <p className="text-white/80 text-sm">영상이 일시정지되었습니다</p>

        <div className="flex gap-2 justify-center">
          {[1, 2, 3].map((i) => (
            <div key={i} className={`w-3 h-3 rounded-full ${i <= level ? "bg-white" : "bg-white/30"}`} />
          ))}
        </div>

        <button
          onClick={onResume}
          className="mt-4 bg-white text-gray-900 font-semibold rounded-xl px-8 py-3 shadow-lg hover:bg-gray-100 transition"
        >
          영상 재개하기
        </button>
      </div>
    </div>
  );
}
