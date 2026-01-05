import React from "react";
import { Button, Card, LayoutShell } from "@ui";
import heroImage from "../assets/main_picture.jpg";
import "../styles/home.css";

export function HomePage() {
  return (
    <div className="home-page">
      <LayoutShell
        logo={<span>Невский интеграл</span>}
        nav={
          <>
            <a href="#top">Главная</a>
            <a href="#about">Об олимпиаде</a>
            <a href="#format">Формат и задания</a>
            <a href="#results">Результаты</a>
            <a href="#contacts">Контакты</a>
          </>
        }
        actions={<Button variant="outline">Регистрация</Button>}
        footer={<div className="home-footer">© 2025 Олимпиада «Невский интеграл»</div>}
      >
        <section
          id="top"
          className="home-hero"
          data-testid="home-hero"
          style={{ backgroundImage: `url(${heroImage})` }}
        >
          <div className="home-hero-content">
            <h1>Олимпиада «Невский интеграл»</h1>
            <p className="home-hero-subtitle">
              Математика. Логика. Мышление.<br />Для учеников 1–7 классов
            </p>
            <p className="home-hero-quote">«Думать глубже. Расти сильнее.»</p>
            <div className="home-hero-actions">
              <Button>Принять участие</Button>
              <div className="home-hero-links">
                <a href="#about">Об олимпиаде</a>
                <a href="#parents">Для родителей</a>
                <a href="#teachers">Для учителей</a>
              </div>
            </div>
          </div>
        </section>

        <section id="about" className="home-audience">
          <div className="container">
            <div className="home-audience-grid">
              <Card title="Для учеников">
                <ul>
                  <li>Интересные задачи</li>
                  <li>Без стресса</li>
                  <li>Попробуй себя</li>
                </ul>
              </Card>
              <div id="parents">
                <Card title="Для родителей">
                  <ul>
                    <li>Развитие мышления</li>
                    <li>Прозрачные условия</li>
                    <li>Понятные результаты</li>
                  </ul>
                </Card>
              </div>
              <div id="teachers">
                <Card title="Для школ и учителей">
                  <ul>
                    <li>Готовый инструмент</li>
                    <li>Методическая ценность</li>
                    <li>Сертификаты и дипломы</li>
                  </ul>
                </Card>
              </div>
            </div>
          </div>
        </section>

        <section id="format" className="home-section">
          <div className="container">
            <h2>Формат и задания</h2>
            <p>
              Олимпиада проходит онлайн. Задания построены так, чтобы развивать
              логику и внимательность, а результат фиксируется сразу после
              завершения попытки.
            </p>
          </div>
        </section>

        <section id="results" className="home-section">
          <div className="container">
            <h2>Результаты</h2>
            <p>
              Ученики и родители видят итоговый процент и время прохождения, а
              учителя получают удобную сводку по классу.
            </p>
          </div>
        </section>

        <section id="contacts" className="home-section">
          <div className="container">
            <h2>Контакты</h2>
            <p>Пишите на support@nevsky-integral.ru или звоните +7 (812) 000‑00‑00.</p>
          </div>
        </section>
      </LayoutShell>
    </div>
  );
}
