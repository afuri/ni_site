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
import mathLogo from "../assets/math_logo.svg";
import csLogo from "../assets/cs_logo.svg";
import studentAgreement from "../../../../students_agreement.txt?raw";
import teacherAgreement from "../../../../teacher_agreement.txt?raw";
import "../styles/home.css";

const TARGET_DATE = "2026-02-02T00:00:00+03:00";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";
const registerClient = createApiClient({ baseUrl: API_BASE_URL });
const publicClient = createApiClient({ baseUrl: API_BASE_URL });

const LOGIN_REGEX = /^[A-Za-z][A-Za-z0-9]{4,}$/;
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
  const [activeResultsId, setActiveResultsId] = useState<string | null>(null);
  const [selectedOlympiad, setSelectedOlympiad] = useState<Record<string, string>>(
    INITIAL_RESULTS_SELECTION
  );
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
    if (form.fatherName && !RU_NAME_REGEX.test(form.fatherName)) {
      errors.fatherName = "Только русские буквы, первая заглавная.";
    }
    if (!form.country) {
      errors.country = "Введите страну.";
    } else if (!RU_NAME_REGEX.test(form.country)) {
      errors.country = "Только русские буквы, первая заглавная.";
    }
    if (!form.gender) {
      errors.gender = "Выберите пол.";
    }
    if (!form.city) {
      errors.city = "Введите город.";
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
