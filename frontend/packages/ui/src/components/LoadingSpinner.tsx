import React from "react";

export type LoadingSpinnerProps = {
  label?: string;
  size?: "sm" | "md" | "lg";
};

export function LoadingSpinner({ label = "Loading", size = "md" }: LoadingSpinnerProps) {
  return (
    <div className={`spinner spinner-${size}`} role="status" aria-live="polite">
      <span className="spinner-circle" aria-hidden="true" />
      <span className="spinner-label">{label}</span>
    </div>
  );
}
