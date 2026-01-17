import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, LayoutShell, Modal, TextInput, useAuth } from "@ui";
import { createApiClient } from "@api";
import { createAuthStorage } from "@utils";
import { Link, useNavigate } from "react-router-dom";
import { Countdown } from "../components/Countdown";
import bannerImage from "../assets/main_banner_3.png";
import logoImage from "../assets/logo2.png";
import catImage from "../assets/cat.png";
import vkLink from "../assets/vk_link.png";
import minprosImage from "../assets/minpros.webp";
import studentAgreement from "../../../../students_agreement.txt?raw";
import teacherAgreement from "../../../../teacher_agreement.txt?raw";
import "../styles/home.css";

const TARGET_DATE = "2026-02-02T00:00:00+03:00";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";
const registerClient = createApiClient({ baseUrl: API_BASE_URL });
const publicClient = createApiClient({ baseUrl: API_BASE_URL });

const LOGIN_REGEX = /^[A-Za-z][A-Za-z0-9]{4,}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RU_NAME_REGEX = /^[А-ЯЁ][А-ЯЁа-яё -]+$/;
const RU_TEXT_REGEX = /^[А-ЯЁа-яё]+$/;
const RU_CITY_REGEX = /^[А-ЯЁ][А-ЯЁа-яё -]+$/;
const FATHER_NAME_REGEX = /^[А-ЯЁ][А-ЯЁа-яё-]*(?: [А-ЯЁ][А-ЯЁа-яё-]*)*$/;

const ROLE_OPTIONS = [
  { value: "student", label: "Ученик" },
  { value: "teacher", label: "Учитель/Родитель" }
];

const CLASS_GRADES = Array.from({ length: 12 }, (_, index) => String(index));

type ContentItem = {
  id: number;
  content_type: "news" | "article";
  title: string;
  body: string;
  published_at: string | null;
};

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
  gender: "" | "male" | "female";
  subscription: number;
  email: string;
  password: string;
  passwordConfirm: string;
  surname: string;
  name: string;
  fatherName: string;
  country: string;
  city: string;
  school: string;
  classGrade: string;
  subject: string;
  consent: boolean;
};

type RegisterErrors = Partial<Record<keyof RegisterFormState, string>>;

type PublicOlympiad = {
  id: number;
  title: string;
  age_group: string;
  available_from: string;
  available_to: string;
  duration_sec: number;
  is_published: boolean;
};

export function HomePage() {
  const { signIn, signOut, user, status } = useAuth();
  const navigate = useNavigate();
  const authStorage = useMemo(
    () => createAuthStorage({ tokensKey: "ni_main_tokens", userKey: "ni_main_user" }),
    []
  );
  const authedClient = useMemo(
    () =>
      createApiClient({
        baseUrl: API_BASE_URL,
        storage: authStorage,
        onAuthError: signOut
      }),
    [authStorage, signOut]
  );
  const [isQuoteOpen, setIsQuoteOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isRecoveryOpen, setIsRecoveryOpen] = useState(false);
  const [isAgreementOpen, setIsAgreementOpen] = useState(false);
  const [agreementRole, setAgreementRole] = useState<RoleValue>("student");
  const [newsItems, setNewsItems] = useState<ContentItem[]>([]);
  const [articleItems, setArticleItems] = useState<ContentItem[]>([]);
  const [registerForm, setRegisterForm] = useState<RegisterFormState>({
    role: "student",
    login: "",
    gender: "",
    subscription: 0,
    email: "",
    password: "",
    passwordConfirm: "",
    surname: "",
    name: "",
    fatherName: "",
    country: "",
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
  const [publicOlympiads, setPublicOlympiads] = useState<PublicOlympiad[]>([]);
  const [publicOlympiadsStatus, setPublicOlympiadsStatus] = useState<"idle" | "loading" | "error">("idle");
  const [publicOlympiadsError, setPublicOlympiadsError] = useState<string | null>(null);
  const [selectedPublicOlympiadId, setSelectedPublicOlympiadId] = useState("");
  const [startError, setStartError] = useState<string | null>(null);
  const [isInstructionOpen, setIsInstructionOpen] = useState(false);
  const [pendingOlympiad, setPendingOlympiad] = useState<PublicOlympiad | null>(null);
  const [startStatus, setStartStatus] = useState<"idle" | "loading" | "error">("idle");

  const selectedPublicOlympiad = useMemo(
    () => publicOlympiads.find((item) => String(item.id) === selectedPublicOlympiadId) ?? null,
    [publicOlympiads, selectedPublicOlympiadId]
  );

  const parseAgeGroup = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }
    if (trimmed.includes(",")) {
      return trimmed
        .split(",")
        .map((part) => Number(part.trim()))
        .filter((grade) => Number.isFinite(grade));
    }
    if (trimmed.includes("-")) {
      const [startRaw, endRaw] = trimmed.split("-", 2);
      const start = Number(startRaw);
      const end = Number(endRaw);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
        return [];
      }
      return Array.from({ length: end - start + 1 }, (_, index) => start + index);
    }
    const single = Number(trimmed);
    return Number.isFinite(single) ? [single] : [];
  };

  const isWithinAvailability = (olympiad: PublicOlympiad) => {
    const start = new Date(olympiad.available_from).getTime();
    const end = new Date(olympiad.available_to).getTime();
    const now = Date.now();
    if (Number.isNaN(start) || Number.isNaN(end)) {
      return false;
    }
    return now >= start && now <= end;
  };

  const isClassAllowed = (olympiad: PublicOlympiad, classGrade: number | null) => {
    if (!classGrade) {
      return false;
    }
    const grades = parseAgeGroup(olympiad.age_group);
    return grades.includes(classGrade);
  };

  const formatDateShort = (value: string) =>
    new Date(value).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });

  const agreementText = useMemo(
    () => (agreementRole === "student" ? studentAgreement : teacherAgreement),
    [agreementRole]
  );

  useEffect(() => {
    if (!isUserMenuOpen) {
      return;
    }
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isUserMenuOpen]);

  useEffect(() => {
    let isMounted = true;
    const loadOlympiads = async () => {
      setPublicOlympiadsStatus("loading");
      setPublicOlympiadsError(null);
      try {
        const data = await publicClient.request<PublicOlympiad[]>({
          path: "/olympiads",
          method: "GET",
          auth: false
        });
        if (!isMounted) {
          return;
        }
        setPublicOlympiads(data ?? []);
        if (data?.length) {
          setSelectedPublicOlympiadId(String(data[0].id));
        }
        setPublicOlympiadsStatus("idle");
      } catch {
        if (!isMounted) {
          return;
        }
        setPublicOlympiadsStatus("error");
        setPublicOlympiadsError("Не удалось загрузить список олимпиад.");
      }
    };
    void loadOlympiads();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const loadContent = async () => {
      try {
        const [news, articles] = await Promise.all([
          publicClient.request<ContentItem[]>({
            path: "/content?content_type=news",
            method: "GET",
            auth: false
          }),
          publicClient.request<ContentItem[]>({
            path: "/content?content_type=article",
            method: "GET",
            auth: false
          })
        ]);
        if (!isMounted) {
          return;
        }
        setNewsItems(news ?? []);
        setArticleItems(articles ?? []);
      } catch {
        if (!isMounted) {
          return;
        }
        setNewsItems([]);
        setArticleItems([]);
      }
    };
    void loadContent();
    return () => {
      isMounted = false;
    };
  }, []);

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
      errors.login = "Логин: латинские буквы/цифры, от 5 символов, начинается с буквы.";
    }
    if (!form.email) {
      errors.email = "Введите email.";
    } else if (!EMAIL_REGEX.test(form.email)) {
      errors.email = "Введите корректный email.";
    }
    if (!form.password) {
      errors.password = "Введите пароль.";
    } else if (form.password.length < 8) {
      errors.password = "Пароль должен быть не короче 8 символов.";
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
    if (form.fatherName && !FATHER_NAME_REGEX.test(form.fatherName)) {
      errors.fatherName = "Только русские буквы, каждая часть с заглавной, можно пробел.";
    }
    if (!form.country) {
      errors.country = "Введите страну.";
    } else if (!RU_NAME_REGEX.test(form.country)) {
      errors.country = "Первая буква заглавная, можно пробел и дефис.";
    }
    if (!form.gender) {
      errors.gender = "Выберите пол.";
    }
    if (!form.city) {
      errors.city = "Введите город.";
    } else if (!RU_CITY_REGEX.test(form.city)) {
      errors.city = "Первая буква заглавная, можно пробел и дефис.";
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

  const passwordsFilled =
    registerForm.password.trim().length > 0 && registerForm.passwordConfirm.trim().length > 0;
  const passwordsMatch =
    passwordsFilled && registerForm.password.trim() === registerForm.passwordConfirm.trim();

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

  const handleUserMenuToggle = () => {
    setIsUserMenuOpen((prev) => !prev);
  };

  const handleUserMenuClose = () => {
    setIsUserMenuOpen(false);
  };

  const handleLogout = async () => {
    try {
      await signOut();
    } finally {
      setIsUserMenuOpen(false);
    }
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
        gender: registerForm.gender as "male" | "female",
        subscription: registerForm.subscription,
        surname: registerForm.surname.trim(),
        name: registerForm.name.trim(),
        father_name: registerForm.fatherName ? registerForm.fatherName.trim() : null,
        country: registerForm.country.trim(),
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

  const handleStartOlympiad = () => {
    setStartError(null);
    if (!selectedPublicOlympiad) {
      setStartError("Выберите олимпиаду.");
      return;
    }
    if (status !== "authenticated" || !user) {
      openLogin();
      return;
    }
    if (user.role !== "student") {
      setStartError("Начать олимпиаду могут только ученики.");
      return;
    }
    if (!user.is_email_verified) {
      setStartError("Подтвердите email, чтобы участвовать в олимпиаде.");
      return;
    }
    if (!isClassAllowed(selectedPublicOlympiad, user.class_grade)) {
      setStartError("Олимпиада недоступна для вашего класса.");
      return;
    }
    if (!isWithinAvailability(selectedPublicOlympiad)) {
      setStartError("Сейчас олимпиада недоступна по времени.");
      return;
    }
    setPendingOlympiad(selectedPublicOlympiad);
    setIsInstructionOpen(true);
  };

  const handleConfirmStart = async () => {
    if (!pendingOlympiad) {
      return;
    }
    setStartStatus("loading");
    try {
      const attempt = await authedClient.request<{ id: number }>({
        path: "/attempts/start",
        method: "POST",
        body: { olympiad_id: pendingOlympiad.id }
      });
      setIsInstructionOpen(false);
      setPendingOlympiad(null);
      setStartStatus("idle");
      navigate(`/olympiad?attemptId=${attempt.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось начать олимпиаду.";
      setStartError(message);
      setStartStatus("error");
      setIsInstructionOpen(false);
    }
  };

  const hasNews = newsItems.length > 0;
  const hasArticles = articleItems.length > 0;
  const navItems = [
    { label: "Об олимпиаде", href: "#about" },
    ...(hasNews ? [{ label: "Новости", href: "#news" }] : []),
    { label: "Расписание", href: "#schedule" },
    ...(hasArticles ? [{ label: "Статьи", href: "#articles" }] : [])
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
              <div className="home-user-menu" ref={userMenuRef}>
                <button
                  type="button"
                  className="home-user-link"
                  onClick={handleUserMenuToggle}
                  aria-haspopup="menu"
                  aria-expanded={isUserMenuOpen}
                >
                  {user.login}
                </button>
                {isUserMenuOpen ? (
                  <div className="home-user-popup" role="menu">
                    <Link to="/cabinet" role="menuitem" onClick={handleUserMenuClose}>
                      Войти
                    </Link>
                    <button type="button" onClick={handleLogout} role="menuitem">
                      Выйти
                    </button>
                  </div>
                ) : null}
              </div>
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

        <section id="choose" className="home-section-alt">
          <div className="container">
            <div className="home-section-heading">
              <h2>Выбрать олимпиаду</h2>
            </div>
            <div className="home-olympiad-select">
              <label className="field">
                <span className="field-label">Опубликованные олимпиады</span>
                <select
                  className="field-input"
                  value={selectedPublicOlympiadId}
                  onChange={(event) => {
                    setSelectedPublicOlympiadId(event.target.value);
                    setStartError(null);
                  }}
                >
                  <option value="">Выберите олимпиаду</option>
                  {publicOlympiads.map((item) => (
                    <option key={item.id} value={String(item.id)}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </label>
              {publicOlympiadsStatus === "loading" ? (
                <p className="home-text">Загружаем список олимпиад...</p>
              ) : null}
              {publicOlympiadsStatus === "error" && publicOlympiadsError ? (
                <p className="home-error">{publicOlympiadsError}</p>
              ) : null}
              {selectedPublicOlympiad ? (
                <div className="home-olympiad-meta">
                  <div>
                    <strong>Классы:</strong> {selectedPublicOlympiad.age_group}
                  </div>
                  <div>
                    <strong>Доступно:</strong>{" "}
                    {formatDateShort(selectedPublicOlympiad.available_from)} —{" "}
                    {formatDateShort(selectedPublicOlympiad.available_to)}
                  </div>
                </div>
              ) : null}
              {startError ? <p className="home-error">{startError}</p> : null}
              <div className="home-olympiad-actions">
                <Button
                  onClick={handleStartOlympiad}
                  disabled={!selectedPublicOlympiadId || publicOlympiadsStatus === "loading"}
                >
                  Начать олимпиаду
                </Button>
              </div>
            </div>
          </div>
        </section>

        {hasNews ? (
          <section id="news" className="home-section-alt">
            <div className="container">
              <div className="home-section-heading">
                <h2>Новости</h2>
              </div>
              <div className="home-carousel">
                {newsItems.map((item) => (
                  <Card key={item.id} title={item.title}>
                    <p>{item.body}</p>
                  </Card>
                ))}
              </div>
            </div>
          </section>
        ) : null}

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

        <section id="results" className="home-section-alt home-section-hidden">
          <div className="container">
            <div className="home-section-heading">
              <h2>Результаты</h2>
            </div>
          </div>
        </section>

        {hasArticles ? (
          <section id="articles" className="home-section">
            <div className="container">
              <div className="home-section-heading">
                <h2>Статьи</h2>
              </div>
              <div className="home-articles">
                {articleItems.map((item) => (
                  <details key={item.id}>
                    <summary>{item.title}</summary>
                    <p>{item.body}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>
        ) : null}

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
          isOpen={isInstructionOpen}
          onClose={() => setIsInstructionOpen(false)}
          title="Инструкция перед началом"
          className="home-instruction-modal"
        >
          <div className="home-instruction">
            <p>
              Вы собираетесь начать олимпиаду{" "}
              <strong>{pendingOlympiad?.title ?? "Невский интеграл"}</strong>.
            </p>
            <ul>
              <li>Время прохождения: {pendingOlympiad ? Math.round(pendingOlympiad.duration_sec / 60) : 0} минут.</li>
              <li>Таймер запускается сразу после нажатия кнопки «Начать».</li>
              <li>Не обновляйте страницу и не закрывайте вкладку до завершения.</li>
              <li>Ответы сохраняются автоматически при переходе между заданиями.</li>
              <li>По завершении нажмите «Отправить», чтобы зафиксировать результат.</li>
            </ul>
            <div className="home-instruction-actions">
              <Button type="button" variant="outline" onClick={() => setIsInstructionOpen(false)}>
                Отмена
              </Button>
              <Button type="button" onClick={handleConfirmStart} isLoading={startStatus === "loading"}>
                Начать
              </Button>
            </div>
          </div>
        </Modal>

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
                helperText="Не менее 5 символов. Только английские буквы и цифры. Начинаться должен с буквы."
              />
              <TextInput
                label="Email"
                name="email"
                type="email"
                autoComplete="email"
                value={registerForm.email}
                onChange={(event) => updateRegisterField("email", event.target.value)}
                error={registerErrors.email}
                helperText="Используйте действующий email — понадобится для входа и восстановления."
              />
              <TextInput
                label="Пароль"
                name="password"
                type="password"
                autoComplete="new-password"
                value={registerForm.password}
                onChange={(event) => updateRegisterField("password", event.target.value)}
                error={registerErrors.password}
                helperText="От 8 до 128 символов."
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
              {passwordsFilled ? (
                <span className={`field-helper ${passwordsMatch ? "auth-pass-match" : "auth-pass-mismatch"}`}>
                  {passwordsMatch ? "Пароли совпадают" : "Пароли не совпадают"}
                </span>
              ) : null}
              <TextInput
                label="Фамилия"
                name="surname"
                value={registerForm.surname}
                onChange={(event) => updateRegisterField("surname", event.target.value)}
                error={registerErrors.surname}
                helperText="Первая буква заглавная, можно пробел и дефис."
              />
              <TextInput
                label="Имя"
                name="name"
                value={registerForm.name}
                onChange={(event) => updateRegisterField("name", event.target.value)}
                error={registerErrors.name}
                helperText="Первая буква заглавная, можно пробел и дефис."
              />
              <TextInput
                label="Отчество"
                name="fatherName"
                value={registerForm.fatherName}
                onChange={(event) => updateRegisterField("fatherName", event.target.value)}
                error={registerErrors.fatherName}
                helperText="Русские буквы, каждая часть с заглавной, можно пробел и дефис."
              />
              <div className="field">
                <span className="field-label">Пол</span>
                <div className="auth-radio-group" role="radiogroup" aria-label="Пол">
                  <label className="auth-radio">
                    <input
                      type="radio"
                      name="gender"
                      value="male"
                      checked={registerForm.gender === "male"}
                      onChange={(event) => updateRegisterField("gender", event.target.value as "male" | "female")}
                    />
                    <span>Муж</span>
                  </label>
                  <label className="auth-radio">
                    <input
                      type="radio"
                      name="gender"
                      value="female"
                      checked={registerForm.gender === "female"}
                      onChange={(event) => updateRegisterField("gender", event.target.value as "male" | "female")}
                    />
                    <span>Жен</span>
                  </label>
                </div>
                {registerErrors.gender ? (
                  <span className="field-helper field-helper-error">{registerErrors.gender}</span>
                ) : null}
              </div>
              <TextInput
                label="Страна"
                name="country"
                value={registerForm.country}
                onChange={(event) => updateRegisterField("country", event.target.value)}
                error={registerErrors.country}
                helperText="Первая буква заглавная, можно пробел и дефис."
              />
              <TextInput
                label="Город"
                name="city"
                value={registerForm.city}
                onChange={(event) => updateRegisterField("city", event.target.value)}
                error={registerErrors.city}
                helperText="Первая буква заглавная, можно пробел и дефис."
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
                  ) : (
                    <span className="field-helper">Обязательно для ученика.</span>
                  )}
                </label>
              ) : null}
              {registerForm.role === "teacher" ? (
                <TextInput
                  label="Предмет"
                  name="subject"
                  value={registerForm.subject}
                  onChange={(event) => updateRegisterField("subject", event.target.value)}
                  error={registerErrors.subject}
                  helperText="Только русские буквы."
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
