import React from "react";

export type LayoutShellProps = {
  logo?: React.ReactNode;
  nav?: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
};

export function LayoutShell({ logo, nav, actions, footer, children }: LayoutShellProps) {
  return (
    <div className="layout-shell">
      <header className="layout-header">
        <div className="layout-header-inner">
          {logo ? <div className="layout-logo">{logo}</div> : null}
          {nav ? <nav className="layout-nav">{nav}</nav> : null}
          {actions ? <div className="layout-actions">{actions}</div> : null}
        </div>
      </header>
      <main className="layout-main">{children}</main>
      {footer ? <footer className="layout-footer">{footer}</footer> : null}
    </div>
  );
}
