"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

type ToastType = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, type: ToastType = "info") => {
    const id = ++nextId;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  // api.ts에서 발행하는 글로벌 에러 이벤트 수신
  useEffect(() => {
    const handler = (e: Event) => toast((e as CustomEvent).detail, "error");
    window.addEventListener("api-error", handler);
    return () => window.removeEventListener("api-error", handler);
  }, [toast]);

  const remove = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  const colors: Record<ToastType, string> = {
    success: "bg-green-600",
    error: "bg-red-600",
    warning: "bg-amber-500",
    info: "bg-gray-800",
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            onClick={() => remove(t.id)}
            className={`${colors[t.type]} text-white px-4 py-3 rounded-xl shadow-lg text-sm cursor-pointer animate-slide-in`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
