import React from "react";

export type CardProps = {
  title?: string;
  subtitle?: string;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
};

export function Card({ title, subtitle, footer, children, className }: CardProps) {
  return (
    <section className={`card ${className ?? ""}`.trim()}>
      {(title || subtitle) && (
        <header className="card-header">
          {title ? <h3 className="card-title">{title}</h3> : null}
          {subtitle ? <p className="card-subtitle">{subtitle}</p> : null}
        </header>
      )}
      {children ? <div className="card-body">{children}</div> : null}
      {footer ? <footer className="card-footer">{footer}</footer> : null}
    </section>
  );
}
