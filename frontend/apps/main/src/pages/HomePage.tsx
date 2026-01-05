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
        <section id="top" className="home-hero">
          <div className="container home-hero-grid">
            <div className="home-hero-content">
              <h1>Олимпиада «Невский интеграл»</h1>
              <p className="home-hero-subtitle">
                Развиваем логику и математическое мышление у учеников 1-7 классов.
                Онлайн-формат, честные результаты, удобные кабинеты.
              </p>
              <p className="home-hero-quote">«Думать глубже. Расти сильнее.»</p>
              <div className="home-hero-actions">
                <Button>Принять участие</Button>
                <Button variant="outline">Смотреть программы</Button>
                <div className="home-hero-links">
                  <a href="#about">Об олимпиаде</a>
                  <a href="#parents">Для родителей</a>
                  <a href="#teachers">Для учителей</a>
                </div>
              </div>
            </div>
            <div className="home-hero-media" data-testid="hero-media">
              <img
                src={heroImage}
                alt="Невский интеграл над Невой"
                className="home-hero-image"
              />
            </div>
          </div>
        </section>

        <section className="home-promo" aria-label="Промо">
          <div className="container home-promo-inner">
            <div>
              <h2>Зимний набор открыт</h2>
              <p>Скидка на участие для классов и школьных команд до конца месяца.</p>
            </div>
            <Button variant="outline">Узнать условия</Button>
          </div>
        </section>

        <section id="about" className="home-section">
          <div className="container">
            <div className="home-section-heading">
              <h2>Стартуйте, развивайтесь, подтверждайте результат</h2>
              <p>Выберите маршрут участия - от первой олимпиады до устойчивых достижений.</p>
            </div>
            <div className="home-card-grid">
              <Card title="Старт в олимпиадах">
                <p>Первые шаги в математических и инженерных задачах без стресса.</p>
                <ul>
                  <li>Интересные задачи</li>
                  <li>Без стресса</li>
                  <li>Попробуй себя</li>
                </ul>
              </Card>
              <div id="parents">
                <Card title="Развитие мышления">
                  <p>Прозрачные условия и понятные результаты для семей.</p>
                  <ul>
                    <li>Развитие мышления</li>
                    <li>Прозрачные условия</li>
                    <li>Понятные результаты</li>
                  </ul>
                </Card>
              </div>
              <div id="teachers">
                <Card title="Инструмент для школы">
                  <p>Готовые форматы, методическая поддержка и дипломы.</p>
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

        <section className="home-section-alt" aria-label="Партнеры">
          <div className="container">
            <h2>Партнеры и поддержка</h2>
            <div className="home-logo-grid">
              <span>ИТМО</span>
              <span>СПбГУ</span>
              <span>Политех</span>
              <span>ФТШ</span>
              <span>Кванториум</span>
              <span>ЦОПП</span>
            </div>
          </div>
        </section>

        <section id="format" className="home-section">
          <div className="container">
            <div className="home-section-heading">
              <h2>Популярные олимпиады</h2>
              <p>Подберите формат по классу и уровню сложности.</p>
            </div>
            <div className="home-slider">
              <Card title="Логика и мышление">
                <p>Для 1-2 классов, 30 минут.</p>
              </Card>
              <Card title="Математика 3-4">
                <p>Для 3-4 классов, 45 минут.</p>
              </Card>
              <Card title="Инженерный старт">
                <p>Для 5-6 классов, 60 минут.</p>
              </Card>
              <Card title="Глубокая математика">
                <p>Для 7-8 классов, 75 минут.</p>
              </Card>
            </div>
          </div>
        </section>

        <section className="home-section-alt" aria-label="Категории">
          <div className="container">
            <div className="home-section-heading">
              <h2>Категории заданий</h2>
              <p>Разделы охватывают логику, математику, моделирование и инженерные задачи.</p>
            </div>
            <div className="home-category-grid">
              <Card title="Логика" />
              <Card title="Комбинаторика" />
              <Card title="Геометрия" />
              <Card title="Теория чисел" />
              <Card title="Моделирование" />
              <Card title="Информатика" />
            </div>
          </div>
        </section>

        <section className="home-section" aria-label="Сценарии">
          <div className="container home-split">
            <div>
              <h2>Что вы хотите сделать сегодня?</h2>
              <p>
                Выберите сценарий - мы подскажем подходящую олимпиаду и формат участия.
              </p>
            </div>
            <div className="home-split-actions">
              <Button variant="outline">Записать класс</Button>
              <Button variant="outline">Подготовить ребенка</Button>
              <Button variant="outline">Проверить уровень</Button>
            </div>
          </div>
        </section>

        <section id="results" className="home-section">
          <div className="container">
            <div className="home-section-heading">
              <h2>Почему выбирают «Невский интеграл»</h2>
              <p>Прозрачность, надежность и понятная аналитика для каждой роли.</p>
            </div>
            <div className="home-card-grid">
              <Card title="10 000+ участников">
                <p>Масштабируемая платформа и честные проверки.</p>
              </Card>
              <Card title="Отчетность для учителей">
                <p>Сводки по классу и динамике результатов.</p>
              </Card>
              <Card title="Понятные итоги">
                <p>Ученик видит процент и время, без лишнего стресса.</p>
              </Card>
            </div>
          </div>
        </section>

        <section className="home-section-alt" aria-label="FAQ">
          <div className="container">
            <div className="home-section-heading">
              <h2>Частые вопросы</h2>
            </div>
            <div className="home-faq">
              <details>
                <summary>Как долго длится олимпиада?</summary>
                <p>Время зависит от уровня и класса, обычно от 30 до 75 минут.</p>
              </details>
              <details>
                <summary>Можно ли пройти олимпиаду повторно?</summary>
                <p>Для каждого ученика доступна одна попытка, результаты фиксируются сразу.</p>
              </details>
              <details>
                <summary>Как получить диплом?</summary>
                <p>Диплом доступен в личном кабинете после проверки результатов.</p>
              </details>
            </div>
          </div>
        </section>

        <section id="contacts" className="home-section">
          <div className="container">
            <h2>Контакты</h2>
            <p>Пишите на support@nevsky-integral.ru или звоните +7 (812) 000-00-00.</p>
          </div>
        </section>
      </LayoutShell>
    </div>
  );
}
