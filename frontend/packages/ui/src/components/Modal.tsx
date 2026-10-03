import React, { useEffect, useId, useRef } from "react";

export type ModalProps = {
  isOpen: boolean;
  title?: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  backdropClassName?: string;
  closeOnBackdrop?: boolean;
  showCloseButton?: boolean;
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
  showCloseButton = true,
  onClose
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const descriptionId = useId();
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const initialFocus = closeButtonRef.current ?? dialogRef.current?.querySelector<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'
    ) ?? dialogRef.current;
    initialFocus?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && closeOnBackdrop) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) ?? []).filter((element) => !element.hasAttribute("hidden"));
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [closeOnBackdrop, isOpen]);

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
        ref={dialogRef}
        className={`modal ${className ?? ""}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            {title ? (
              <h2 className="modal-title" id={titleId}>
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="modal-description" id={descriptionId}>
                {description}
              </p>
            ) : null}
          </div>
          {showCloseButton ? <button ref={closeButtonRef} type="button" className="modal-close" onClick={onClose} aria-label="Закрыть модальное окно">
            ×
          </button> : null}
        </header>
        {children ? <div className="modal-body">{children}</div> : null}
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}
