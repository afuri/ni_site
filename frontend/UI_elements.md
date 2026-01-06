# UI elements — Главная страница

Этот файл описывает элементы главной страницы и где править контент/стили.

## 1) Верхнее меню (Sticky header)
- Что это: фиксированное меню сверху при скролле.
- Состав: логотип + название, навигация по якорям, кнопки «Войти» и «Регистрация».
- Код: `frontend/apps/main/src/pages/HomePage.tsx`
- Стили: `frontend/apps/main/src/styles/home.css`
  - Основные классы: `.home-page .layout-header`, `.home-page .layout-header-inner`, `.home-logo`, `.home-header-actions`, `.home-page .layout-nav`
- Где менять:
  - Цвет/прозрачность/высоту: `.home-page .layout-header`
  - Размер/кадрирование логотипа: `.home-logo`, `.home-logo img`
  - Тексты кнопок: `HomePage.tsx` (props у `Button`)

## 2) Hero с фоновым баннером
- Что это: главный баннер с фоном `main_banner_3.png` и заголовком.
- Код: `frontend/apps/main/src/pages/HomePage.tsx`
- Стили: `frontend/apps/main/src/styles/home.css`
  - Классы: `.home-hero`, `.home-hero::before`, `.home-hero::after`, `.home-hero-inner`, `.home-hero-title`, `.home-hero-title h1`
- Где менять:
  - Фон: `HomePage.tsx` (inline style `backgroundImage`) и файл `frontend/apps/main/src/assets/main_banner_3.png`
  - Позицию/цвет/тень заголовка: `.home-hero-title h1`
  - Перетекание в белый: `.home-hero::after`

## 3) Блок «Ближайшая олимпиада через» + таймер
- Что это: панель внутри hero с таймером и кнопкой «Принять участие».
- Код:
  - Разметка панели: `frontend/apps/main/src/pages/HomePage.tsx`
  - Таймер: `frontend/apps/main/src/components/Countdown.tsx`
- Стили: `frontend/apps/main/src/styles/home.css`
  - Классы: `.home-hero-panel`, `.home-hero-panel-title`, `.countdown`, `.countdown-timer`
- Где менять:
  - Текст заголовка панели: `HomePage.tsx` (строка «Ближайшая олимпиада через»)
  - Дата таймера: `HomePage.tsx` (константа `TARGET_DATE`)
  - Прозрачность/ширина/цвет панели: `.home-hero-panel`
  - Центрирование таймера: `.countdown`, `.countdown-timer`

## 4) Раздел «Об олимпиаде»
- Что это: описание, партнёры, документы.
- Код: `frontend/apps/main/src/pages/HomePage.tsx`
- Стили: `frontend/apps/main/src/styles/home.css`
  - Классы: `.home-section`, `.home-about-grid`, `.home-logo-grid`, `.home-docs`, `.home-doc-link`
- Где менять:
  - Текст описания: `HomePage.tsx` (абзац после заголовка)
  - Список партнеров: `HomePage.tsx` (элементы внутри `.home-logo-grid`)
  - Ссылки на PDF: `HomePage.tsx` (блок `.home-docs`)

## 5) Раздел «Новости» (карусель)
- Что это: горизонтальная карусель из карточек с новостями.
- Код: `frontend/apps/main/src/pages/HomePage.tsx` (массив `NEWS_ITEMS`)
- Стили: `frontend/apps/main/src/styles/home.css`
  - Классы: `.home-section-alt`, `.home-carousel`
- Где менять:
  - Контент новостей: `NEWS_ITEMS` в `HomePage.tsx`
  - Отступы/скролл: `.home-carousel`

## 6) Раздел «Расписание олимпиад» (список)
- Что это: список кликабельных элементов.
- Код: `frontend/apps/main/src/pages/HomePage.tsx` (массив `SCHEDULE_ITEMS`)
- Стили: `frontend/apps/main/src/styles/home.css`
  - Классы: `.home-schedule`, `.home-schedule-item`
- Где менять:
  - Список дат/названий: `SCHEDULE_ITEMS`
  - Внешний вид строк: `.home-schedule-item`
  - Переход на заглушку: ссылка `to="/olympiad"`

## 7) Раздел «Результаты» (карусель)
- Что это: карточки с короткими итогами.
- Код: `frontend/apps/main/src/pages/HomePage.tsx` (массив `RESULTS_ITEMS`)
- Стили: `frontend/apps/main/src/styles/home.css`
  - Классы: `.home-carousel`
- Где менять:
  - Тексты результатов: `RESULTS_ITEMS`

## 8) Раздел «Статьи» (details)
- Что это: список заголовков, раскрывающихся по клику.
- Код: `frontend/apps/main/src/pages/HomePage.tsx` (массив `ARTICLE_ITEMS`)
- Стили: `frontend/apps/main/src/styles/home.css`
  - Классы: `.home-articles`
- Где менять:
  - Заголовки статей: `ARTICLE_ITEMS`
  - Текст внутри: `<p>` в `HomePage.tsx`

## 9) Раздел «Часто задаваемые вопросы» (FAQ)
- Что это: раскрывающиеся вопросы.
- Код: `frontend/apps/main/src/pages/HomePage.tsx` (массив `FAQ_ITEMS`)
- Стили: `frontend/apps/main/src/styles/home.css`
  - Классы: `.home-faq`
- Где менять:
  - Вопросы/ответы: `FAQ_ITEMS`

## 10) Раздел «Контакты»
- Что это: контактные данные.
- Код: `frontend/apps/main/src/pages/HomePage.tsx`
- Стили: `frontend/apps/main/src/styles/home.css`
  - Классы: `.home-section`, `.home-text`

## 11) Footer
- Что это: нижняя полоса с копирайтом.
- Код: `frontend/apps/main/src/pages/HomePage.tsx`
- Стили: `frontend/apps/main/src/styles/home.css`
  - Классы: `.home-footer`, `.home-page .layout-footer`

## 12) Страница-заглушка «Прохождение олимпиады»
- Что это: заглушка с таймером для маршрута `/olympiad`.
- Код: `frontend/apps/main/src/pages/ParticipationPlaceholder.tsx`
- Стили: `frontend/apps/main/src/styles/placeholder.css`
- Таймер: `frontend/apps/main/src/components/Countdown.tsx`
- Где менять:
  - Дата старта: `ParticipationPlaceholder.tsx` (константа `TARGET_DATE`)

## Полезные ссылки на компоненты UI
- Кнопки: `frontend/packages/ui/src/components/Button.tsx`
- Карточки: `frontend/packages/ui/src/components/Card.tsx`
- Лэйаут: `frontend/packages/ui/src/components/LayoutShell.tsx`
- Общие стили UI: `frontend/packages/ui/src/styles/components.css`
- Глобальные стили: `frontend/packages/ui/src/styles/global.css`
- Токены (цвета/шрифты): `frontend/packages/ui/src/styles/tokens.css`
