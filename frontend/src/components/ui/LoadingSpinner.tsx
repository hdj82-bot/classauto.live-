"use client";

interface Props {
  size?: "sm" | "md" | "lg";
  label?: string;
  fullScreen?: boolean;
}

const sizes = { sm: "h-4 w-4", md: "h-8 w-8", lg: "h-12 w-12" };

export default function LoadingSpinner({ size = "md", label, fullScreen }: Props) {
  const spinner = (
    <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
      <svg className={`animate-spin text-indigo-600 ${sizes[size]}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
      {label && <p className="text-sm text-gray-500">{label}</p>}
      {!label && <span className="sr-only">Loading</span>}
    </div>
  );

  if (fullScreen) {
    return <div className="min-h-screen flex items-center justify-center">{spinner}</div>;
  }
  return spinner;
}
