import React from "react";

export type ModalProps = {
  isOpen: boolean;
  title?: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  backdropClassName?: string;
  closeOnBackdrop?: boolean;
  onClose: () => void;
};

export function Modal({
  isOpen,
  title,
  description,
  children,
  footer,
  className,
  backdropClassName,
  closeOnBackdrop = true,
  onClose
}: ModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className={`modal-backdrop ${backdropClassName ?? ""}`.trim()}
      role="presentation"
      onClick={() => {
        if (closeOnBackdrop) {
          onClose();
        }
      }}
    >
      <div
        className={`modal ${className ?? ""}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? "modal-title" : undefined}
        aria-describedby={description ? "modal-description" : undefined}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            {title ? (
              <h2 className="modal-title" id="modal-title">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="modal-description" id="modal-description">
                {description}
              </p>
            ) : null}
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close modal">
            ×
          </button>
        </header>
        {children ? <div className="modal-body">{children}</div> : null}
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}
