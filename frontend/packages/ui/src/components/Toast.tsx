import React from "react";

export type ToastVariant = "info" | "success" | "warning" | "danger";

export type ToastProps = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  onClose?: () => void;
};

export function Toast({ title, description, variant = "info", onClose }: ToastProps) {
  return (
    <div className={`toast toast-${variant}`} role="status">
      <div className="toast-content">
        <div className="toast-title">{title}</div>
        {description ? <div className="toast-description">{description}</div> : null}
      </div>
      {onClose ? (
        <button type="button" className="toast-close" onClick={onClose} aria-label="Dismiss toast">
          ×
        </button>
      ) : null}
    </div>
  );
}
