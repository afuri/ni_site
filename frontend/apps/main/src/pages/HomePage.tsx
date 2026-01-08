import React, { useState } from "react";
import { Button, Card, LayoutShell } from "@ui";
import { Link, useNavigate } from "react-router-dom";
import { Countdown } from "../components/Countdown";
import bannerImage from "../assets/main_banner_3.png";
import logoImage from "../assets/logo2.png";
import catImage from "../assets/cat.png";
import "../styles/home.css";

const TARGET_DATE = "2026-02-02T00:00:00+03:00";

const NEWS_ITEMS = [
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed quis aliquet massa.",
  "Pellentesque habitant morbi tristique senectus et netus et malesuada fames.",
  "Integer ut erat sed justo aliquet fermentum. Vestibulum euismod odio ut risus.",
  "Mauris tincidunt, arcu nec facilisis aliquam, nunc leo tempor erat.",
  "Donec volutpat lorem at suscipit gravida. Nulla facilisi in varius."
];

const RESULTS_ITEMS = [
  "Итоги олимпиады по математике 1 класс: средний балл 78%.",
  "Итоги олимпиады по математике 3-4 класс: средний балл 73%.",
  "Итоги олимпиады по информатике 5-6 класс: средний балл 69%.",
  "Итоги олимпиады по информатике 7 класс: средний балл 74%."
];

const SCHEDULE_ITEMS = [
  "02.02.2026 олимпиада по математике «Невский интеграл» 1 класс",
  "03.02.2026 олимпиада по математике «Невский интеграл» 2 класс",
  "04.02.2026 олимпиада по математике «Невский интеграл» 3 класс",
  "05.02.2026 олимпиада по математике «Невский интеграл» 4 класс",
  "06.02.2026 олимпиада по математике «Невский интеграл» 5-6 класс",
  "07.02.2026 олимпиада по математике «Невский интеграл» 7 класс",
  "08.02.2026 олимпиада по информатике «Невский интеграл» 3-4 класс",
  "09.02.2026 олимпиада по информатике «Невский интеграл» 5-6 класс",
  "10.02.2026 олимпиада по информатике «Невский интеграл» 7 класс",
  "01.04.2026 / очный этап"
];

const ARTICLE_ITEMS = [
  "Как подготовиться к олимпиаде за 2 недели",
  "Лучшие практики для учителей при организации участия",
  "Почему логические задачи важны в начальной школе",
  "Секреты успешного прохождения олимпиад",
  "Как поддерживать мотивацию ребенка"
];

const FAQ_ITEMS = [
  {
    question: "Как долго длится олимпиада?",
    answer: "Время зависит от уровня и класса, обычно от 30 до 75 минут."
  },
  {
    question: "Можно ли пройти олимпиаду повторно?",
    answer: "Для каждого ученика доступна одна попытка, результаты фиксируются сразу."
  },
  {
    question: "Как получить диплом?",
    answer: "Диплом доступен в личном кабинете после проверки результатов."
  }
];

export function HomePage() {
  const navigate = useNavigate();
  const [isQuoteOpen, setIsQuoteOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const navItems = [
    { label: "Об олимпиаде", href: "#about" },
    { label: "Новости", href: "#news" },
    { label: "Расписание", href: "#schedule" },
    { label: "Результаты", href: "#results" },
    { label: "Статьи", href: "#articles" }
  ];

  return (
    <div className="home-page">
      <LayoutShell
        logo={
          <a href="/" className="home-logo">
            <img src={logoImage} alt="Невский интеграл" />
            <span>НЕВСКИЙ<br />ИНТЕГРАЛ</span>
          </a>
        }
        nav={
          <div className="home-nav">
            <div className="home-nav-links">
              {navItems.map((item) => (
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
                {navItems.map((item) => (
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
            <Button>Войти</Button>
            <Button>Регистрация</Button>
          </div>
        }
        footer={<div className="home-footer">© 2026 Олимпиада «Невский интеграл»</div>}
      >
        <section
          id="top"
          className="home-hero"
          data-testid="home-hero"
          style={{ backgroundImage: `url(${bannerImage})` }}
        >
          <div className="container home-hero-inner">
            <div className="home-hero-title">
              <h1>
                Олимпиада
                <br />
                Невский интеграл
              </h1>
            </div>
            <div className="home-hero-panel">
              <div className="home-hero-panel-title">Ближайшая олимпиада через</div>
              <Countdown targetIso={TARGET_DATE} />
              <Button onClick={() => navigate("/olympiad")}>Принять участие</Button>
            </div>
          </div>
        </section>

        <section id="about" className="home-section">
          <div className="container">
            <h2>Об олимпиаде</h2>
            <p className="home-text">
              «Невский интеграл» - онлайн-олимпиада по математике и информатике
              для учеников 1-7 классов. Мы развиваем мышление и формируем привычку
              к инженерному подходу.
            </p>
            <div className="home-about-grid">
              <div>
                <h3>Партнеры</h3>
                <div className="home-logo-grid">
                  <span>ИТМО</span>
                  <span>СПбГУ</span>
                  <span>Политех</span>
                  <span>ФТШ</span>
                </div>
              </div>
              <div>
                <h3>Документы</h3>
                <div className="home-docs">
                  <a href="#" className="home-doc-link">Положение (PDF)</a>
                  <a href="#" className="home-doc-link">Перечень (PDF)</a>
                  <a href="#" className="home-doc-link">Важная информация (PDF)</a>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="news" className="home-section-alt">
          <div className="container">
            <div className="home-section-heading">
              <h2>Новости</h2>
            </div>
            <div className="home-carousel">
              {NEWS_ITEMS.map((item, index) => (
                <Card key={index} title={`Новость ${index + 1}`}>
                  <p>{item}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section id="schedule" className="home-section">
          <div className="container">
            <div className="home-section-heading">
              <h2>Расписание олимпиад</h2>
            </div>
            <div className="home-schedule">
              {SCHEDULE_ITEMS.map((item) => (
                <Link key={item} to="/olympiad" className="home-schedule-item">
                  {item}
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section id="results" className="home-section-alt">
          <div className="container">
            <div className="home-section-heading">
              <h2>Результаты</h2>
            </div>
            <div className="home-carousel">
              {RESULTS_ITEMS.map((item, index) => (
                <Card key={index} title={`Результат ${index + 1}`}>
                  <p>{item}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section id="articles" className="home-section">
          <div className="container">
            <div className="home-section-heading">
              <h2>Статьи</h2>
            </div>
            <div className="home-articles">
              {ARTICLE_ITEMS.map((item) => (
                <details key={item}>
                  <summary>{item}</summary>
                  <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="home-section-alt">
          <div className="container">
            <div className="home-section-heading">
              <h2>Часто задаваемые вопросы</h2>
            </div>
            <div className="home-faq">
              {FAQ_ITEMS.map((item) => (
                <details key={item.question}>
                  <summary>{item.question}</summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section id="contacts" className="home-section">
          <div className="container">
            <h2>Контакты</h2>
            <p className="home-text">support@nevsky-integral.ru · +7 (812) 000-00-00</p>
          </div>
        </section>

        {isMenuOpen ? (
          <div
            className="home-nav-overlay"
            onClick={() => setIsMenuOpen(false)}
            aria-hidden="true"
            data-testid="nav-overlay"
          />
        ) : null}

        {isQuoteOpen ? (
          <div
            className="cat-overlay"
            onClick={() => setIsQuoteOpen(false)}
            data-testid="cat-overlay"
            aria-hidden="true"
          />
        ) : null}

        <div className="cat-widget">
          {isQuoteOpen ? (
            <div className="cat-quote" role="dialog" aria-label="Цитата" id="cat-quote">
              <p>«Математика — царица наук»</p>
              <span>Карл Фридрих Гаусс</span>
            </div>
          ) : null}
          <button
            type="button"
            className="cat-button"
            onClick={() => setIsQuoteOpen((prev) => !prev)}
            aria-expanded={isQuoteOpen}
            aria-controls="cat-quote"
          >
            <img src={catImage} alt="Кот" />
          </button>
        </div>
      </LayoutShell>
    </div>
  );
}
