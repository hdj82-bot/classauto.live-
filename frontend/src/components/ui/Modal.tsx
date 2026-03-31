"use client";

import { useEffect } from "react";

interface Props {
  open: boolean;
  onClose?: () => void;
  closable?: boolean;
  children: React.ReactNode;
  title?: string;
}

export default function Modal({ open, onClose, closable = true, children, title }: Props) {
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closable ? onClose : undefined} />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        {(title || closable) && (
          <div className="flex items-center justify-between px-6 pt-5 pb-2">
            {title && <h3 className="text-lg font-semibold text-gray-900">{title}</h3>}
            {closable && onClose && (
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            )}
          </div>
        )}
        <div className="px-6 pb-6">{children}</div>
      </div>
    </div>
  );
}
