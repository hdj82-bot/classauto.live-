"use client";

import { useId, type HTMLInputAutoCompleteAttribute } from "react";

interface CommonProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  autoComplete?: HTMLInputAutoCompleteAttribute;
  inputMode?: "numeric" | "email" | "tel" | "text";
}

interface InputProps extends CommonProps {
  variant?: "input";
  type?: "text" | "email" | "tel";
}

interface TextareaProps extends CommonProps {
  variant: "textarea";
  rows?: number;
}

interface SelectProps extends Omit<CommonProps, "placeholder" | "inputMode" | "autoComplete"> {
  variant: "select";
  options: Array<{ value: string; label: string }>;
}

type Props = InputProps | TextareaProps | SelectProps;

/**
 * Dark-base form field shared by /beta-apply and /contact. Carries the
 * label, required marker, error message (with role="alert"), and a hint
 * line for soft validation (e.g. "school email recommended").
 */
export default function FormField(props: Props) {
  const reactId = useId();
  const id = `mkt-${reactId}`;
  const errId = `${id}-error`;
  const hintId = `${id}-hint`;

  const baseClasses =
    "w-full rounded-xl border bg-white/[0.04] px-3.5 py-2.5 text-sm text-white placeholder-white/30 outline-none transition focus:ring-2 focus:ring-amber-400/30";
  const borderClasses = props.error
    ? "border-red-400/60 focus:border-red-400"
    : "border-white/10 focus:border-amber-400/60";

  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-medium text-white/80 mb-1.5"
      >
        {props.label}
        {props.required && (
          <span className="text-amber-400 ml-0.5" aria-hidden="true">
            *
          </span>
        )}
      </label>

      {props.variant === "textarea" ? (
        <textarea
          id={id}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          onBlur={props.onBlur}
          placeholder={props.placeholder}
          rows={props.rows ?? 4}
          aria-invalid={props.error ? "true" : undefined}
          aria-describedby={
            props.error ? errId : props.hint ? hintId : undefined
          }
          className={`${baseClasses} ${borderClasses} resize-y`}
        />
      ) : props.variant === "select" ? (
        <select
          id={id}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          onBlur={props.onBlur}
          aria-invalid={props.error ? "true" : undefined}
          aria-describedby={
            props.error ? errId : props.hint ? hintId : undefined
          }
          className={`${baseClasses} ${borderClasses}`}
        >
          <option value="" disabled className="bg-gray-900">
            —
          </option>
          {props.options.map((o) => (
            <option key={o.value} value={o.value} className="bg-gray-900">
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          type={props.type ?? "text"}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          onBlur={props.onBlur}
          placeholder={props.placeholder}
          autoComplete={props.autoComplete}
          inputMode={props.inputMode}
          aria-invalid={props.error ? "true" : undefined}
          aria-describedby={
            props.error ? errId : props.hint ? hintId : undefined
          }
          className={`${baseClasses} ${borderClasses}`}
        />
      )}

      {props.error ? (
        <p
          id={errId}
          role="alert"
          className="mt-1 text-xs text-red-300 leading-relaxed"
        >
          {props.error}
        </p>
      ) : props.hint ? (
        <p id={hintId} className="mt-1 text-xs text-white/40 leading-relaxed">
          {props.hint}
        </p>
      ) : null}
    </div>
  );
}
