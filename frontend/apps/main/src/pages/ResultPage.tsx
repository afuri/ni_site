import React, { useState } from "react";
import { Button, LayoutShell, useAuth } from "@ui";
import { Link } from "react-router-dom";
import logoImage from "../assets/logo2.png";
import vkLink from "../assets/vk_link.png";
import "../styles/home.css";
import "../styles/results-archive.css";

const OPEN_LOGIN_STORAGE_KEY = "ni_open_login";
const LOGIN_REDIRECT_KEY = "ni_login_redirect";

const NAV_ITEMS = [
  { label: "Об олимпиаде", href: "/#about" },
  { label: "Расписание", href: "/#schedule" },
  { label: "Результаты", href: "/results" },
  { label: "Архив заданий", href: "/archive" }
] as const;

const GEO_POINTS = [
  { city: "Санкт-Петербург", place: "ГБОУ лицей № 344 Невского района Санкт-Петербурга" },
  { city: "Астрахань", place: "МБОУ г. Астрахани «Лицей № 1»" },
  { city: "Пермь", place: "МАОУ «Лицей № 4» г. Перми" },
  { city: "Стерлитамак", place: "МАОУ «ПМ гимназия № 1»" },
  { city: "Люберцы", place: "МОУ «Инженерно-технологический лицей»" },
  { city: "Зеленодольск", place: "МБОУ «Гимназия № 3 ЗМР РТ»" },
  { city: "Екатеринбург", place: "МАОУ лицей № 180" },
  { city: "Иваново", place: "МБОУ «Лицей № 33»" },
  { city: "Красноярск", place: "СОШ № 144" },
  { city: "Воронеж", place: "ОЦ «Содружество»" },
  { city: "Кемерово", place: "МАОУ СОШ № 85" },
  { city: "Салехард", place: "МАОУ СОШ № 1" }
] as const;

const CHARTS = [
  {
    src: "/docs/results/final_statistic/charts/chart-1-dynamics.png",
    alt: "Диаграмма динамики участия по этапам Олимпиады",
    caption: "Диаграмма 1. Динамика участия по этапам Олимпиады"
  },
  {
    src: "/docs/results/final_statistic/charts/chart-2-subjects.png",
    alt: "Диаграмма распределения участников очного этапа по предметным трекам",
    caption: "Диаграмма 2. Распределение участников очного этапа по предметным трекам"
  },
  {
    src: "/docs/results/final_statistic/charts/chart-3-results.png",
    alt: "Диаграмма структуры результатов очного этапа",
    caption: "Диаграмма 3. Структура результатов очного этапа"
  }
] as const;

export function ResultPage() {
  const { status, user, signOut } = useAuth();
  const isAuthenticated = status === "authenticated" && Boolean(user);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

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
              <h2>Результаты олимпиады "Невский интеграл" 2025-2026</h2>
            </div>
            <article className="results-report">
              <div className="results-report-prose">
                <img
                    src="/docs/results/statistic.png"
                    alt="Статистика 2025-2026"
                    className="results-stat-image"
                />
                <p className="results-report-text">
                  В 2025-2026 учебном году Олимпиада «Невский интеграл» продемонстрировала значительный рост по ключевым показателям и укрепила свои позиции как одной из востребованных олимпиад для обучающихся начальной и основной школы.
                </p>
                <p className="results-report-text">
                  По сравнению с предыдущим учебным годом количество участников значительно выросло как на
                  дистанционном, так и на очном этапах. Это отражает рост интереса к Олимпиаде, расширение
                  ее географии и повышение узнаваемости среди образовательных организаций.
                </p>

                <h3 className="results-report-title">Динамика участия</h3>
                <p className="results-report-text">
                  Сопоставление данных с предыдущим учебным годом показывает кратный рост по всем этапам.
                </p>

                <figure className="results-report-chart">
                  <img src={CHARTS[0].src} alt={CHARTS[0].alt} loading="lazy" />
                </figure>

                <p className="results-report-text">
                  Число участников дистанционного этапа выросло более чем в 6 раз, а очного почти в 3 раза.
                  Это говорит о переходе Олимпиады в фазу активного масштабирования, при котором количественный
                  рост сопровождается усилением очной части.
                </p>

                <h3 className="results-report-title">Очный этап</h3>
                <p className="results-report-text">
                  Очный этап прошел в апреле 2026 года и объединил 745 участников, успешно прошедших
                  предыдущие этапы. Это ключевой этап Олимпиады, где участники демонстрируют не только
                  знания, но и умение мыслить нестандартно, работать в условиях ограниченного времени
                  и находить решения сложных задач.
                </p>
                <p className="results-report-text">
                  Распределение участников по трекам подтверждает ведущую роль математического направления:
                  680 участников (91%) выполняли задания по математике и 65 участников (9%) по информатике.
                  Такая структура отражает фундаментальную роль математики в олимпиадной подготовке и
                  одновременно показывает устойчивый интерес к информатике.
                </p>

                <div className="results-report-chart-grid">
                  <figure className="results-report-chart">
                    <img src={CHARTS[1].src} alt={CHARTS[1].alt} loading="lazy" />
                  </figure>

                  <figure className="results-report-chart">
                    <img src={CHARTS[2].src} alt={CHARTS[2].alt} loading="lazy" />
                  </figure>
                </div>

                <p className="results-report-text">
                  Всего победителями стали 22 участника, призерами 62. Таким образом, наградной контур
                  охватывает 84 человека, что составляет около 11% от общего числа участников.
                </p>

                <h3 className="results-report-title">География очного этапа</h3>
                <p className="results-report-text">
                  Очный этап прошел на 12 площадках, расположенных в разных регионах России от
                  Санкт-Петербурга до Салехарда.
                </p>

                <div className="results-geo-grid">
                  {GEO_POINTS.map((point) => (
                    <div key={point.city} className="results-geo-card">
                      <h3>{point.city}</h3>
                      <p>{point.place}</p>
                    </div>
                  ))}
                </div>

                <p className="results-report-text">
                  Такая модель проведения делает Олимпиаду более доступной и формирует единое образовательное
                  пространство.
                </p>

                <h3 className="results-report-title">Итоги</h3>
                <p className="results-report-text">
                  Итоги 2025-2026 учебного года показывают, что Олимпиада «Невский интеграл» уверенно
                  развивается и становится все более востребованной среди школьников и образовательных
                  организаций.
                </p>
                <p className="results-report-text">
                  За этот год сформировалась эффективная модель, сочетающая массовый дистанционный этап и
                  сильный очный тур. Это позволяет одновременно расширять охват участников и поддерживать
                  высокий уровень финального этапа.
                </p>
                <p className="results-report-text">
                  Олимпиада это не только соревнование, но и пространство развития. Участие в ней помогает
                  формировать интерес к математике и информатике, развивать мышление и делать первые шаги
                  в олимпиадном движении.
                </p>
                <p className="results-report-text">
                  По отзывам родителей и самих участников, участие в Олимпиаде воспринимается как полезный
                  и мотивирующий опыт, который поддерживает интерес к обучению и развитию.
                </p>
                <p className="results-report-text">
                  Отдельное внимание команда уделяет содержанию заданий: авторский коллектив стремится делать
                  их не только соответствующими уровню подготовки участников, но и интересными, развивающими
                  и мотивирующими к дальнейшему изучению предметов.
                </p>

                <h3 className="results-report-title">Принципы команды</h3>
                <p className="results-report-text">
                  Мы стремимся создавать комфортную и поддерживающую среду для обучающихся, родителей,
                  педагогов и организаторов площадок.
                </p>
                <p className="results-report-text">
                  Для нас важно, чтобы каждый участник чувствовал себя включенным, значимым и поддержанным
                  вне зависимости от результата.
                </p>
              </div>
            </article>
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
