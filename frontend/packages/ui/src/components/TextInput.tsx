import React from "react";

export type TextInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  helperText?: string;
  error?: string;
};

export function TextInput({
  label,
  helperText,
  error,
  id,
  className,
  ...rest
}: TextInputProps) {
  const fieldId = id ?? rest.name ?? undefined;
  const hasError = Boolean(error);
  const message = error ?? helperText;

  return (
    <label className={`field ${className ?? ""}`.trim()} htmlFor={fieldId}>
      {label ? <span className="field-label">{label}</span> : null}
      <input
        id={fieldId}
        className={`field-input ${hasError ? "field-input-error" : ""}`.trim()}
        aria-invalid={hasError || undefined}
        {...rest}
      />
      {message ? (
        <span className={`field-helper ${hasError ? "field-helper-error" : ""}`.trim()}>
          {message}
        </span>
      ) : null}
    </label>
  );
}
