import React, { useMemo, useState } from "react";
import { Button, LayoutShell, useAuth } from "@ui";
import { Link } from "react-router-dom";
import logoImage from "../assets/logo2.png";
import vkLink from "../assets/vk_link.png";
import "../styles/home.css";
import "../styles/results-archive.css";

type YearEntry = {
  label: string;
  startYear: number;
  endYear: number;
};

const OPEN_LOGIN_STORAGE_KEY = "ni_open_login";
const LOGIN_REDIRECT_KEY = "ni_login_redirect";

const NAV_ITEMS = [
  { label: "Об олимпиаде", href: "/#about" },
  { label: "Новости", href: "/#news" },
  { label: "Расписание", href: "/#schedule" },
  { label: "Результаты", href: "/results" },
  { label: "Статьи", href: "/#articles" }
];

const buildYears = (): YearEntry[] => {
  const entries: YearEntry[] = [];
  for (let start = 2025; start >= 2013; start -= 1) {
    const end = start + 1;
    entries.push({
      label: `${start}-${end}`,
      startYear: start,
      endYear: end
    });
  }
  return entries;
};

const buildDocPath = (subject: "math" | "cs", stage: "first" | "second" | "final", year: YearEntry) =>
  `/docs/results/${subject}_${stage}_${year.startYear}_${year.endYear}.pdf`;

export function ResultsArchivePage() {
  const { status, user, signOut } = useAuth();
  const isAuthenticated = status === "authenticated" && Boolean(user);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const years = useMemo(() => buildYears(), []);

  const requestLogin = () => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(OPEN_LOGIN_STORAGE_KEY, "1");
    window.localStorage.setItem(LOGIN_REDIRECT_KEY, "/results");
    window.location.href = "/";
  };

  const handleLogout = async () => {
    await signOut();
  };

  return (
    <div className="home-page">
      <LayoutShell
        logo={
          <a href="/" className="home-logo">
            <img src={logoImage} alt="Невский интеграл" />
            <span>
              НЕВСКИЙ
              <br />
              ИНТЕГРАЛ
            </span>
          </a>
        }
        nav={
          <div className="home-nav">
            <div className="home-nav-links">
              {NAV_ITEMS.map((item) => (
                <a key={item.href} href={item.href}>
                  {item.label}
                </a>
              ))}
            </div>
            <button
              type="button"
              className="home-nav-toggle"
              aria-label="Меню"
              aria-expanded={isMenuOpen}
              onClick={() => setIsMenuOpen((prev) => !prev)}
            >
              меню
            </button>
            {isMenuOpen ? (
              <div className="home-nav-dropdown" role="menu">
                {NAV_ITEMS.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        }
        actions={
          <div className="home-header-actions">
            <a href="https://vk.com/nevsky.integral" target="_blank" className="home-vk-link" aria-label="ВК Олимпиада">
              <img src={vkLink} alt="ВК" />
            </a>
            {isAuthenticated && user ? (
              <div className="home-user-menu">
                <Link to="/cabinet" className="home-user-link">
                  {user.login}
                </Link>
                <Button type="button" onClick={handleLogout}>
                  Выйти
                </Button>
              </div>
            ) : (
              <>
                <Button onClick={requestLogin}>Войти</Button>
                <a href="/" className="home-register-link">
                  <Button>Регистрация</Button>
                </a>
              </>
            )}
          </div>
        }
        footer={<div className="home-footer">© 2026 Олимпиада «Невский интеграл»</div>}
      >
        <section className="home-section">
          <div className="container">
            <div className="home-section-heading">
              <h2>Результаты олимпиады и разбор заданий</h2>
            </div>
            <div className="results-archive">
              {years.map((year) => (
                <details key={year.label} className="results-year" open={year.startYear === 2025}>
                  <summary className="results-year-summary">{year.label}</summary>
                  <div className="results-year-body">
                    <p className="home-text">
                      Статистика проведения олимпиады в {year.label} году
                    </p>
                    <h3>Задания и решения</h3>
                    <h4>Математика</h4>
                    <ul className="results-links">
                      <li>
                        <a href={buildDocPath("math", "first", year)} target="_blank" rel="noreferrer">
                          Задания и решения первого дистанционного тура по математике
                        </a>
                      </li>
                      <li>
                        <a href={buildDocPath("math", "second", year)} target="_blank" rel="noreferrer">
                          Задания и решения второго отборочного дистанционного тура по математике
                        </a>
                      </li>
                      <li>
                        <a href={buildDocPath("math", "final", year)} target="_blank" rel="noreferrer">
                          Задания и решения заключительного очного тура по математике
                        </a>
                      </li>
                    </ul>
                    <h4>Информатика</h4>
                    <ul className="results-links">
                      <li>
                        <a href={buildDocPath("cs", "first", year)} target="_blank" rel="noreferrer">
                          Задания и решения первого дистанционного тура по информатике
                        </a>
                      </li>
                      <li>
                        <a href={buildDocPath("cs", "second", year)} target="_blank" rel="noreferrer">
                          Задания и решения второго отборочного дистанционного тура по информатике
                        </a>
                      </li>
                      <li>
                        <a href={buildDocPath("cs", "final", year)} target="_blank" rel="noreferrer">
                          Задания и решения заключительного очного тура по информатике
                        </a>
                      </li>
                    </ul>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>
      </LayoutShell>
      {isMenuOpen ? (
        <button
          type="button"
          className="home-nav-overlay"
          aria-label="Закрыть меню"
          onClick={() => setIsMenuOpen(false)}
        />
      ) : null}
    </div>
  );
}
