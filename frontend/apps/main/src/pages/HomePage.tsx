import React, { useMemo, useState } from "react";
import { Button, Card, LayoutShell, Modal, TextInput, useAuth } from "@ui";
import { createApiClient } from "@api";
import { Link, useNavigate } from "react-router-dom";
import { Countdown } from "../components/Countdown";
import bannerImage from "../assets/main_banner_3.png";
import logoImage from "../assets/logo2.png";
import catImage from "../assets/cat.png";
import vkLink from "../assets/vk_link.png";
import minprosImage from "../assets/minpros.webp";
import mathLogo from "../assets/math_logo.svg";
import csLogo from "../assets/cs_logo.svg";
import studentAgreement from "../../../../students_agreement.txt?raw";
import teacherAgreement from "../../../../teacher_agreement.txt?raw";
import "../styles/home.css";

const TARGET_DATE = "2026-02-02T00:00:00+03:00";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1";
const registerClient = createApiClient({ baseUrl: API_BASE_URL });

const LOGIN_REGEX = /^[A-Za-z][A-Za-z0-9]*$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RU_NAME_REGEX = /^[А-ЯЁ][а-яё]+$/;
const RU_TEXT_REGEX = /^[А-ЯЁа-яё]+$/;

const ROLE_OPTIONS = [
  { value: "student", label: "Ученик" },
  { value: "teacher", label: "Учитель/Родитель" }
];

const CLASS_GRADES = Array.from({ length: 12 }, (_, index) => String(index));

const NEWS_ITEMS = [
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed quis aliquet massa.",
  "Pellentesque habitant morbi tristique senectus et netus et malesuada fames.",
  "Integer ut erat sed justo aliquet fermentum. Vestibulum euismod odio ut risus.",
  "Mauris tincidunt, arcu nec facilisis aliquam, nunc leo tempor erat.",
  "Donec volutpat lorem at suscipit gravida. Nulla facilisi in varius."
];

const RESULTS_SECTIONS = [
  {
    id: "math",
    title: "Математика",
    subtitle: "Очно и дистанционно, 1-7 классы",
    summary:
      "Итоги сезонов, протоколы, задания прошлых лет и аналитика по уровням сложности.",
    logo: mathLogo,
    olympiads: [
      {
        value: "2025",
        label: "2025/26 учебный год",
        results: ["Участников: 1280", "Средний балл: 78%", "Победителей: 120"]
      },
      {
        value: "2024",
        label: "2024/25 учебный год",
        results: ["Участников: 1120", "Средний балл: 74%", "Победителей: 98"]
      },
      {
        value: "2023",
        label: "2023/24 учебный год",
        results: ["Участников: 980", "Средний балл: 71%", "Победителей: 86"]
      }
    ],
    tasks: ["Задания 2025/26", "Задания 2024/25", "Задания 2023/24"],
    tips: [
      "Разберите типовые задачи по темам 5-7 классов.",
      "Тренируйте скорость вычислений и аккуратность оформления.",
      "Проведите пробный тур с лимитом времени."
    ],
    analytics: [
      "Рост участников: +14% к прошлому году",
      "Доля победителей: 9%",
      "Среднее время решения: 42 минуты"
    ]
  },
  {
    id: "informatics",
    title: "Информатика",
    subtitle: "Алгоритмы и логика, 3-7 классы",
    summary:
      "Результаты по уровням, подборка задач и советы по подготовке к очному туру.",
    logo: csLogo,
    olympiads: [
      {
        value: "2025",
        label: "2025/26 учебный год",
        results: ["Участников: 860", "Средний балл: 72%", "Победителей: 64"]
      },
      {
        value: "2024",
        label: "2024/25 учебный год",
        results: ["Участников: 790", "Средний балл: 70%", "Победителей: 58"]
      },
      {
        value: "2023",
        label: "2023/24 учебный год",
        results: ["Участников: 720", "Средний балл: 68%", "Победителей: 52"]
      }
    ],
    tasks: ["Задания 2025/26", "Задания 2024/25", "Задания 2023/24"],
    tips: [
      "Повторите базовые конструкции и команды Scratch/Python.",
      "Решайте задачи на таблицы, логические цепочки и алгоритмы.",
      "Потренируйтесь работать с ограничением по времени."
    ],
    analytics: ["Рост участников: +9%", "Доля победителей: 7%", "Среднее время решения: 38 минут"]
  }
];

const INITIAL_RESULTS_SELECTION = RESULTS_SECTIONS.reduce<Record<string, string>>((acc, section) => {
  acc[section.id] = section.olympiads[0]?.value ?? "";
  return acc;
}, {});

const SCHEDULE_ITEMS = [
  { date: "02.02.2026", title: "Олимпиада по математике «Невский интеграл» 1 класс" },
  { date: "03.02.2026", title: "Олимпиада по математике «Невский интеграл» 2 класс" },
  { date: "04.02.2026", title: "Олимпиада по математике «Невский интеграл» 3 класс" },
  { date: "05.02.2026", title: "Олимпиада по математике «Невский интеграл» 4 класс" },
  { date: "06.02.2026", title: "Олимпиада по математике «Невский интеграл» 5-6 класс" },
  { date: "07.02.2026", title: "Олимпиада по математике «Невский интеграл» 7 класс" },
  { date: "08.02.2026", title: "Олимпиада по информатике «Невский интеграл» 3-4 класс" },
  { date: "09.02.2026", title: "Олимпиада по информатике «Невский интеграл» 5-6 класс" },
  { date: "10.02.2026", title: "Олимпиада по информатике «Невский интеграл» 7 класс" },
  { date: "01.04.2026", title: "Очный этап" }
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

type RoleValue = "student" | "teacher";

type RegisterFormState = {
  role: RoleValue;
  login: string;
  email: string;
  password: string;
  passwordConfirm: string;
  surname: string;
  name: string;
  fatherName: string;
  city: string;
  school: string;
  classGrade: string;
  subject: string;
  consent: boolean;
};

type RegisterErrors = Partial<Record<keyof RegisterFormState, string>>;

export function HomePage() {
  const { signIn, user, status } = useAuth();
  const navigate = useNavigate();
  const [isQuoteOpen, setIsQuoteOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isRecoveryOpen, setIsRecoveryOpen] = useState(false);
  const [isAgreementOpen, setIsAgreementOpen] = useState(false);
  const [agreementRole, setAgreementRole] = useState<RoleValue>("student");
  const [activeResultsId, setActiveResultsId] = useState<string | null>(null);
  const [selectedOlympiad, setSelectedOlympiad] = useState<Record<string, string>>(
    INITIAL_RESULTS_SELECTION
  );
  const [registerForm, setRegisterForm] = useState<RegisterFormState>({
    role: "student",
    login: "",
    email: "",
    password: "",
    passwordConfirm: "",
    surname: "",
    name: "",
    fatherName: "",
    city: "",
    school: "",
    classGrade: "",
    subject: "",
    consent: false
  });
  const [registerErrors, setRegisterErrors] = useState<RegisterErrors>({});
  const [registerStatus, setRegisterStatus] = useState<"idle" | "loading" | "error">("idle");
  const [registerErrorMessage, setRegisterErrorMessage] = useState<string | null>(null);
  const [loginForm, setLoginForm] = useState({
    login: "",
    password: "",
    remember: false
  });
  const [loginStatus, setLoginStatus] = useState<"idle" | "loading" | "error">("idle");
  const [loginErrorMessage, setLoginErrorMessage] = useState<string | null>(null);
  const [recoveryEmail, setRecoveryEmail] = useState("");

  const activeResultsSection = RESULTS_SECTIONS.find((section) => section.id === activeResultsId);
  const activeOlympiad = activeResultsSection
    ? activeResultsSection.olympiads.find(
        (olympiad) => olympiad.value === selectedOlympiad[activeResultsSection.id]
      ) ?? activeResultsSection.olympiads[0]
    : null;
  const activeSelectId = activeResultsSection
    ? `results-select-${activeResultsSection.id}`
    : "results-select";

  const handleOlympiadChange = (sectionId: string, value: string) => {
    setSelectedOlympiad((prev) => ({
      ...prev,
      [sectionId]: value
    }));
  };

  const agreementText = useMemo(
    () => (agreementRole === "student" ? studentAgreement : teacherAgreement),
    [agreementRole]
  );

  const updateRegisterField = <K extends keyof RegisterFormState>(field: K, value: RegisterFormState[K]) => {
    setRegisterForm((prev) => ({
      ...prev,
      [field]: value
    }));
    if (registerErrors[field]) {
      setRegisterErrors((prev) => ({
        ...prev,
        [field]: undefined
      }));
    }
  };

  const handleRoleChange = (value: RoleValue) => {
    setRegisterForm((prev) => ({
      ...prev,
      role: value,
      classGrade: value === "student" ? prev.classGrade : "",
      subject: value === "teacher" ? prev.subject : ""
    }));
    setRegisterErrors((prev) => ({
      ...prev,
      classGrade: undefined,
      subject: undefined
    }));
  };

  const validateRegister = (form: RegisterFormState) => {
    const errors: RegisterErrors = {};

    if (!form.role) {
      errors.role = "Укажите роль.";
    }
    if (!form.login) {
      errors.login = "Введите логин.";
    } else if (!LOGIN_REGEX.test(form.login)) {
      errors.login = "Логин: латинские буквы/цифры, начинается с буквы.";
    }
    if (!form.email) {
      errors.email = "Введите email.";
    } else if (!EMAIL_REGEX.test(form.email)) {
      errors.email = "Введите корректный email.";
    }
    if (!form.password) {
      errors.password = "Введите пароль.";
    }
    if (!form.passwordConfirm) {
      errors.passwordConfirm = "Повторите пароль.";
    } else if (form.password !== form.passwordConfirm) {
      errors.passwordConfirm = "Пароли не совпадают.";
    }
    if (!form.surname) {
      errors.surname = "Введите фамилию.";
    } else if (!RU_NAME_REGEX.test(form.surname)) {
      errors.surname = "Только русские буквы, первая заглавная.";
    }
    if (!form.name) {
      errors.name = "Введите имя.";
    } else if (!RU_NAME_REGEX.test(form.name)) {
      errors.name = "Только русские буквы, первая заглавная.";
    }
    if (form.fatherName && !RU_NAME_REGEX.test(form.fatherName)) {
      errors.fatherName = "Только русские буквы, первая заглавная.";
    }
    if (!form.city) {
      errors.city = "Введите город.";
    } else if (!RU_NAME_REGEX.test(form.city)) {
      errors.city = "Только русские буквы, первая заглавная.";
    }
    if (!form.school) {
      errors.school = "Введите школу.";
    }
    if (form.role === "student") {
      if (!form.classGrade) {
        errors.classGrade = "Выберите класс.";
      }
    }
    if (form.role === "teacher") {
      if (!form.subject) {
        errors.subject = "Введите предмет.";
      } else if (!RU_TEXT_REGEX.test(form.subject)) {
        errors.subject = "Только русские буквы.";
      }
    }
    if (!form.consent) {
      errors.consent = "Необходимо согласие.";
    }

    return errors;
  };

  const isAuthenticated = status === "authenticated" && Boolean(user);

  const openLogin = () => {
    setIsRegisterOpen(false);
    setIsRecoveryOpen(false);
    setRegisterErrors({});
    setRegisterErrorMessage(null);
    setLoginErrorMessage(null);
    setIsLoginOpen(true);
  };

  const openRegister = () => {
    setIsLoginOpen(false);
    setIsRecoveryOpen(false);
    setLoginErrorMessage(null);
    setRegisterErrorMessage(null);
    setRegisterErrors({});
    setIsRegisterOpen(true);
  };

  const openRecovery = () => {
    setIsLoginOpen(false);
    setIsRegisterOpen(false);
    setIsRecoveryOpen(true);
  };

  const handleRegisterSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRegisterErrorMessage(null);
    const errors = validateRegister(registerForm);
    if (Object.keys(errors).length > 0) {
      setRegisterErrors(errors);
      return;
    }

    setRegisterStatus("loading");
    try {
      await registerClient.auth.register({
        login: registerForm.login.trim(),
        password: registerForm.password,
        role: registerForm.role,
        email: registerForm.email.trim(),
        surname: registerForm.surname.trim(),
        name: registerForm.name.trim(),
        father_name: registerForm.fatherName ? registerForm.fatherName.trim() : null,
        country: "Россия",
        city: registerForm.city.trim(),
        school: registerForm.school.trim(),
        class_grade: registerForm.role === "student" ? Number(registerForm.classGrade) : null,
        subject: registerForm.role === "teacher" ? registerForm.subject.trim() : null
      });
      setRegisterStatus("idle");
      setIsRegisterOpen(false);
      setLoginForm((prev) => ({
        ...prev,
        login: registerForm.login,
        password: ""
      }));
      setIsLoginOpen(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось зарегистрироваться.";
      setRegisterErrorMessage(message);
      setRegisterStatus("error");
    }
  };

  const handleLoginSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginErrorMessage(null);
    if (!loginForm.login || !loginForm.password) {
      setLoginErrorMessage("Введите логин и пароль.");
      return;
    }
    setLoginStatus("loading");
    try {
      await signIn({ login: loginForm.login, password: loginForm.password });
      setLoginStatus("idle");
      setIsLoginOpen(false);
      navigate("/cabinet");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ошибка входа.";
      setLoginErrorMessage(message);
      setLoginStatus("error");
    }
  };

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
            <a href="https://vk.ru/olymp344" className="home-vk-link" aria-label="ВК Олимпиада">
              <img src={vkLink} alt="ВК" />
            </a>
            {isAuthenticated && user ? (
              <Link to="/cabinet" className="home-user-link">
                {user.login}
              </Link>
            ) : (
              <>
                <Button onClick={openLogin}>Войти</Button>
                <Button onClick={openRegister}>Регистрация</Button>
              </>
            )}
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
            <div className="home-about-grid">
              <div>
                <p className="home-text">
                  Олимпиада «Невский интеграл» проводится с 2012 года и возникла как
                  образовательная инициатива, созданная ко Дню рождения ГБОУ лицея №
                  344 Невского района Санкт-Петербурга. Со временем эта идея переросла
                  в самостоятельный и значимый проект, объединяющий школьников,
                  увлечённых математикой и информатикой.
                </p>
                <p className="home-text">
                  Олимпиада предоставляет участникам возможность выйти за рамки
                  школьной программы, обратиться к нестандартным задачам, требующим
                  логики, точности и вдумчивой работы с информацией, и объединяет
                  учащихся из разных регионов, формируя общее интеллектуальное
                  пространство.
                </p>
                <p className="home-text">
                  Олимпиада «Невский интеграл» включена в перечень олимпиад и иных
                  интеллектуальных конкурсов на 2025/26 учебный год, утвержденный
                  приказом Министерства просвещения РФ от 31.08.2025 № 639.
                </p>
                <img src={minprosImage} alt="Министерство просвещения РФ" className="home-minpros" />
              </div>
              <div>
                <h3>Документы</h3>
                <div className="home-docs">
                  <a href="#" className="home-doc-link">Положение (PDF)</a>
                  <a href="#" className="home-doc-link">Перечень (PDF)</a>
                  <a href="#" className="home-doc-link">Важная информация (PDF)</a>
                  <a href="#" className="home-doc-link">Регламент проведения очного тура (PDF)</a>
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
            <div className="home-schedule-scroll">
              <div className="home-schedule-track">
                {SCHEDULE_ITEMS.map((item, index) => (
                  <div
                    key={`${item.date}-${item.title}`}
                    className={`home-schedule-item ${index % 2 === 0 ? "top" : "bottom"}`}
                  >
                    <span className="home-schedule-dot" aria-hidden="true" />
                    <Link to="/olympiad" className="home-schedule-card">
                      <div className="home-schedule-date">{item.date}</div>
                      <div className="home-schedule-title">{item.title}</div>
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="results" className="home-section-alt">
          <div className="container">
            <div className="home-section-heading">
              <h2>Результаты</h2>
            </div>
            <div className="home-results-grid">
              {RESULTS_SECTIONS.map((section) => (
                <Card key={section.id} title={section.title} subtitle={section.subtitle} className="home-results-card">
                  <div className="home-results-card-body">
                    <img src={section.logo} alt={`${section.title} логотип`} />
                    <p>{section.summary}</p>
                  </div>
                  <div className="home-results-card-footer">
                    <Button
                      size="sm"
                      onClick={() => setActiveResultsId(section.id)}
                      aria-label={`Открыть результаты: ${section.title}`}
                    >
                      Открыть результаты
                    </Button>
                  </div>
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

        <section className="home-section">
          <div className="container">
            <div className="home-section-heading">
              <h2>Организраторы и партнеры</h2>
            </div>
            <div className="home-carousel">
              <Card title="ИТМО" />
              <Card title="СПбГУ" />
              <Card title="Политех" />
              <Card title="ФТШ" />
              <Card title="Кванториум" />
            </div>
          </div>
        </section>

        <section id="contacts" className="home-section-alt">
          <div className="container">
            <h2>Контакты</h2>
            <p className="home-text">support@nevsky-integral.ru · +7 (812) 000-00-00</p>
          </div>
        </section>

        <Modal
          isOpen={isRegisterOpen}
          onClose={() => setIsRegisterOpen(false)}
          title="Регистрация"
          className="auth-modal"
        >
          <form className="auth-form" onSubmit={handleRegisterSubmit}>
            <div className="auth-grid">
              <label className="field">
                <span className="field-label">Роль</span>
                <select
                  id="register-role"
                  className={`field-input ${registerErrors.role ? "field-input-error" : ""}`.trim()}
                  value={registerForm.role}
                  onChange={(event) => handleRoleChange(event.target.value as RoleValue)}
                >
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {registerErrors.role ? (
                  <span className="field-helper field-helper-error">{registerErrors.role}</span>
                ) : null}
              </label>
              <TextInput
                label="Логин"
                name="login"
                autoComplete="username"
                value={registerForm.login}
                onChange={(event) => updateRegisterField("login", event.target.value)}
                error={registerErrors.login}
              />
              <TextInput
                label="Email"
                name="email"
                type="email"
                autoComplete="email"
                value={registerForm.email}
                onChange={(event) => updateRegisterField("email", event.target.value)}
                error={registerErrors.email}
              />
              <TextInput
                label="Пароль"
                name="password"
                type="password"
                autoComplete="new-password"
                value={registerForm.password}
                onChange={(event) => updateRegisterField("password", event.target.value)}
                error={registerErrors.password}
              />
              <TextInput
                label="Повтор пароля"
                name="passwordConfirm"
                type="password"
                autoComplete="new-password"
                value={registerForm.passwordConfirm}
                onChange={(event) => updateRegisterField("passwordConfirm", event.target.value)}
                error={registerErrors.passwordConfirm}
              />
              <TextInput
                label="Фамилия"
                name="surname"
                value={registerForm.surname}
                onChange={(event) => updateRegisterField("surname", event.target.value)}
                error={registerErrors.surname}
              />
              <TextInput
                label="Имя"
                name="name"
                value={registerForm.name}
                onChange={(event) => updateRegisterField("name", event.target.value)}
                error={registerErrors.name}
              />
              <TextInput
                label="Отчество"
                name="fatherName"
                value={registerForm.fatherName}
                onChange={(event) => updateRegisterField("fatherName", event.target.value)}
                error={registerErrors.fatherName}
              />
              <TextInput
                label="Город"
                name="city"
                value={registerForm.city}
                onChange={(event) => updateRegisterField("city", event.target.value)}
                error={registerErrors.city}
              />
              <TextInput
                label="Школа"
                name="school"
                value={registerForm.school}
                onChange={(event) => updateRegisterField("school", event.target.value)}
                error={registerErrors.school}
              />
              {registerForm.role === "student" ? (
                <label className="field">
                  <span className="field-label">Класс</span>
                  <select
                    id="register-class"
                    className={`field-input ${registerErrors.classGrade ? "field-input-error" : ""}`.trim()}
                    value={registerForm.classGrade}
                    onChange={(event) => updateRegisterField("classGrade", event.target.value)}
                  >
                    <option value="">Выберите класс</option>
                    {CLASS_GRADES.map((grade) => (
                      <option key={grade} value={grade}>
                        {grade}
                      </option>
                    ))}
                  </select>
                  {registerErrors.classGrade ? (
                    <span className="field-helper field-helper-error">{registerErrors.classGrade}</span>
                  ) : null}
                </label>
              ) : null}
              {registerForm.role === "teacher" ? (
                <TextInput
                  label="Предмет"
                  name="subject"
                  value={registerForm.subject}
                  onChange={(event) => updateRegisterField("subject", event.target.value)}
                  error={registerErrors.subject}
                />
              ) : null}
            </div>

            <div className="auth-consent">
              <label className="auth-checkbox">
                <input
                  type="checkbox"
                  checked={registerForm.consent}
                  onChange={(event) => updateRegisterField("consent", event.target.checked)}
                />
                <span>
                  Даю{" "}
                  <button
                    type="button"
                    className="auth-link"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setAgreementRole(registerForm.role);
                      setIsAgreementOpen(true);
                    }}
                  >
                    согласие на обработку персональных данных и информирование
                  </button>
                </span>
              </label>
              {registerErrors.consent ? (
                <span className="auth-error">{registerErrors.consent}</span>
              ) : null}
            </div>

            {registerErrorMessage ? (
              <div className="auth-alert" role="alert">
                {registerErrorMessage}
              </div>
            ) : null}

            <div className="auth-actions">
              <Button
                type="submit"
                isLoading={registerStatus === "loading"}
                className="auth-primary-button"
              >
                Зарегистрироваться
              </Button>
              <button type="button" className="auth-link" onClick={openLogin}>
                Уже есть аккаунт? Войти
              </button>
            </div>
          </form>
        </Modal>

        <Modal
          isOpen={isLoginOpen}
          onClose={() => setIsLoginOpen(false)}
          title="Вход"
          className="auth-modal"
        >
          <form className="auth-form" onSubmit={handleLoginSubmit}>
            <div className="auth-grid auth-grid-single">
              <TextInput
                label="Логин"
                name="login"
                autoComplete="username"
                value={loginForm.login}
                onChange={(event) => setLoginForm((prev) => ({ ...prev, login: event.target.value }))}
              />
              <TextInput
                label="Пароль"
                name="password"
                type="password"
                autoComplete="current-password"
                value={loginForm.password}
                onChange={(event) => setLoginForm((prev) => ({ ...prev, password: event.target.value }))}
              />
            </div>

            <label className="auth-checkbox">
              <input
                type="checkbox"
                checked={loginForm.remember}
                onChange={(event) => setLoginForm((prev) => ({ ...prev, remember: event.target.checked }))}
              />
              <span>Запомнить меня</span>
            </label>

            {loginErrorMessage ? (
              <div className="auth-alert" role="alert">
                {loginErrorMessage}
              </div>
            ) : null}

            <div className="auth-actions">
              <Button
                type="submit"
                isLoading={loginStatus === "loading"}
                className="auth-primary-button"
              >
                Войти
              </Button>
              <div className="auth-links">
                <button type="button" className="auth-link" onClick={openRegister}>
                  Регистрация
                </button>
                <button type="button" className="auth-link" onClick={openRecovery}>
                  Восстановить пароль
                </button>
              </div>
            </div>
          </form>
        </Modal>

        <Modal
          isOpen={isRecoveryOpen}
          onClose={() => setIsRecoveryOpen(false)}
          title="Восстановление пароля"
          className="auth-modal"
        >
          <form className="auth-form">
            <div className="auth-grid auth-grid-single">
              <TextInput
                label="Email или логин"
                name="recovery"
                value={recoveryEmail}
                onChange={(event) => setRecoveryEmail(event.target.value)}
              />
            </div>
            <div className="auth-actions">
              <Button type="button" disabled>
                Отправить инструкцию
              </Button>
              <button type="button" className="auth-link" onClick={openLogin}>
                Назад к входу
              </button>
            </div>
          </form>
        </Modal>

        <Modal
          isOpen={isAgreementOpen}
          onClose={() => setIsAgreementOpen(false)}
          title="Согласие на обработку персональных данных"
          className="agreement-modal"
        >
          <div className="agreement-body">
            <pre>{agreementText}</pre>
          </div>
        </Modal>

        {activeResultsSection ? (
          <Modal
            isOpen
            onClose={() => setActiveResultsId(null)}
            title={`Результаты: ${activeResultsSection.title}`}
            description="Выберите олимпиаду, чтобы посмотреть итоги и материалы."
            className="home-results-modal"
          >
            <div className="home-results-modal-body">
              <div className="home-results-modal-top">
                <img
                  className="home-results-modal-logo"
                  src={activeResultsSection.logo}
                  alt={`${activeResultsSection.title} логотип`}
                />
                <div className="home-results-modal-summary">
                  <p>{activeResultsSection.summary}</p>
                  <label htmlFor={activeSelectId}>Выберите олимпиаду</label>
                  <select
                    id={activeSelectId}
                    value={selectedOlympiad[activeResultsSection.id]}
                    onChange={(event) => handleOlympiadChange(activeResultsSection.id, event.target.value)}
                  >
                    {activeResultsSection.olympiads.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="home-results-modal-grid">
                <div className="home-results-modal-section">
                  <h3>Результаты</h3>
                  <ul className="home-results-list">
                    {activeOlympiad?.results.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="home-results-modal-section">
                  <h3>Задания прошлых лет</h3>
                  <ul className="home-results-list">
                    {activeResultsSection.tasks.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="home-results-modal-section">
                  <h3>Советы по подготовке</h3>
                  <ul className="home-results-list">
                    {activeResultsSection.tips.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="home-results-modal-section">
                  <h3>Аналитика</h3>
                  <div className="home-results-analytics">
                    {activeResultsSection.analytics.map((item) => (
                      <div key={item} className="home-results-stat">
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Modal>
        ) : null}

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
