import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import logoImage from "../assets/logo2.png";
import { PlatformIcon, type PlatformIconName } from "./PlatformIcon";

export type PlatformSection = "home" | "results" | "profile" | "notifications";

const navigation: Array<{ id: Exclude<PlatformSection, "notifications">; label: string; mobileLabel?: string; icon: PlatformIconName }> = [
  { id: "home", label: "Главная", icon: "home" },
  { id: "results", label: "Результаты и дипломы", mobileLabel: "Результаты", icon: "results" },
  { id: "profile", label: "Профиль", icon: "profile" }
];

const sectionHref = (section: PlatformSection) =>
  section === "home" ? "/platform" : `/platform/${section}`;

type PlatformShellProps = {
  activeSection: PlatformSection;
  userName: string;
  login: string;
  classGrade: number | null;
  notificationCount: number;
  coinsContent?: React.ReactNode;
  onSignOut: () => Promise<void> | void;
  children: React.ReactNode;
};

export function PlatformShell({
  activeSection,
  userName,
  login,
  classGrade,
  notificationCount,
  coinsContent,
  onSignOut,
  children
}: PlatformShellProps) {
  const displayName = userName || login;
  const [logoutOpen, setLogoutOpen] = useState(false);
  const userMenu = useRef<HTMLDivElement>(null);
  const profileLink = useRef<HTMLAnchorElement>(null);

  useEffect(() => { setLogoutOpen(false); }, [activeSection]);
  useEffect(() => {
    if (!logoutOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!userMenu.current?.contains(event.target as Node)) setLogoutOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLogoutOpen(false);
        profileLink.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [logoutOpen]);

  return (
    <div className="student-platform-shell">
      <a className="student-skip-link" href="#student-main-content">К основному содержимому</a>
      <aside className="student-sidebar">
        <Link className="student-brand" to="/" aria-label="На главную страницу">
          <img src={logoImage} alt="Невский интеграл" />
        </Link>
        <nav aria-label="Разделы кабинета ученика">
          {navigation.map((item) => (
            <Link
              key={item.id}
              to={sectionHref(item.id)}
              className={activeSection === item.id ? "is-active" : undefined}
              aria-current={activeSection === item.id ? "page" : undefined}
            >
              <PlatformIcon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="student-sidebar-bottom">
          <a href="/docs/instruction.pdf" target="_blank" rel="noreferrer"><PlatformIcon name="help" /><span>Помощь</span></a>
          <a href="/#about"><PlatformIcon name="info" /><span>О платформе</span></a>
          <button type="button" onClick={() => void onSignOut()}>
            <PlatformIcon name="logout" size={20} />
            <span>Выйти</span>
          </button>
        </div>
      </aside>

      <div className="student-workspace">
        <header className="student-topbar">
          <Link className="student-mobile-brand" to="/" aria-label="На главную страницу">
            <img src={logoImage} alt="Невский интеграл" />
          </Link>
          <div className="student-topbar-spacer" />
          {coinsContent}
          <Link
            className="student-notifications"
            to="/platform/notifications"
            aria-label={`Уведомления: ${notificationCount}`}
            aria-current={activeSection === "notifications" ? "page" : undefined}
          >
            <PlatformIcon name="notifications" size={23} />
            {notificationCount > 0 ? <b>{notificationCount}</b> : null}
          </Link>
          <div className="student-user-menu" ref={userMenu}>
          <Link ref={profileLink} className="student-user" to="/platform/profile" aria-label="Открыть профиль" aria-current={activeSection === "profile" ? "page" : undefined}
            aria-expanded={activeSection === "profile" ? logoutOpen : undefined}
            aria-controls={logoutOpen ? "student-user-logout" : undefined}
            onClick={(event) => {
              if (activeSection === "profile") {
                event.preventDefault();
                setLogoutOpen((open) => !open);
              }
            }}>
            <i aria-hidden="true">{displayName.slice(0, 1).toUpperCase()}</i>
            <span>
              <strong>{displayName}</strong>
              <small>{classGrade === 0 ? "Дошкольник" : classGrade ? `${classGrade} класс` : login}</small>
            </span>
            <span className="student-user-arrow" aria-hidden="true">⌄</span>
          </Link>
          {logoutOpen ? <div className="student-user-popover" id="student-user-logout">
            <button type="button" onClick={() => { setLogoutOpen(false); void onSignOut(); }}><PlatformIcon name="logout" size={18} />Выйти</button>
          </div> : null}
          </div>
        </header>

        <main className="student-main" id="student-main-content" tabIndex={-1}>{children}</main>
        <footer className="student-footer"><div className="student-mobile-support"><a href="/docs/instruction.pdf" target="_blank" rel="noreferrer">Помощь</a><a href="/#about">О платформе</a><button type="button" onClick={() => void onSignOut()}>Выйти</button></div>© {new Date().getFullYear()} Олимпиада «Невский интеграл»</footer>
      </div>

      <nav className="student-mobile-nav" aria-label="Основные разделы">
        {navigation.map((item) => (
          <Link
            key={item.id}
            to={sectionHref(item.id)}
            className={activeSection === item.id ? "is-active" : undefined}
            aria-current={activeSection === item.id ? "page" : undefined}
          >
            <PlatformIcon name={item.icon} />
            <span>{item.mobileLabel ?? item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
