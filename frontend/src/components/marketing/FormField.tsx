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
    "w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-[#0A0A0A] placeholder-[rgba(10,10,10,0.35)] outline-none transition motion-reduce:transition-none focus:ring-2 focus:ring-[rgba(255,182,39,0.30)]";
  const borderClasses = props.error
    ? "border-[#EF4444] focus:border-[#EF4444]"
    : "border-[rgba(10,10,10,0.12)] focus:border-[#B88308]";

  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-medium text-[#0A0A0A] mb-1.5"
      >
        {props.label}
        {props.required && (
          <span className="text-[#B88308] ml-0.5 font-bold" aria-hidden="true">
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
          <option value="" disabled>
            —
          </option>
          {props.options.map((o) => (
            <option key={o.value} value={o.value}>
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
          className="mt-1 text-xs text-[#DC2626] leading-relaxed"
        >
          {props.error}
        </p>
      ) : props.hint ? (
        <p id={hintId} className="mt-1 text-xs text-[rgba(10,10,10,0.55)] leading-relaxed">
          {props.hint}
        </p>
      ) : null}
    </div>
  );
}
