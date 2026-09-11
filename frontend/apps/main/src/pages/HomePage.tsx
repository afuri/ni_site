import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, LayoutShell, Modal, TextInput, useAuth } from "@ui";
import { createApiClient, type ApiError } from "@api";
import { createMainAuthStorage } from "../utils/authStorage";
import { Link, useNavigate } from "react-router-dom";
import { Countdown } from "../components/Countdown";
import bannerImage from "../assets/main_banner_3.png";
import logoImage from "../assets/logo2.png";
import catImage from "../assets/cat.png";
import vkLink from "../assets/vk_link.png";
import minprosImage from "../assets/minpros.png";
import lyc344Logo from "../assets/lyc344.png";
import SMLogo from "../assets/sm.png";
import consorciumLogo from "../assets/consorcium.png";
import herzenLogo from "../assets/herzen.png";
import spassSciLogo from "../assets/spass_sci.png";
import bloxLogo from "../assets/bloxel.png";
import itLogo from "../assets/liceyIT.png";
import znanieLogo from "../assets/prosv.png";
import prosvLogo from "../assets/znanie.png";
import studentAgreement from "../../../../students_agreement.txt?raw";
import teacherAgreement from "../../../../teacher_agreement.txt?raw";
import "../styles/home.css";

const TARGET_DATE = "2026-10-05T08:00:00+03:00";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";
const registerClient = createApiClient({ baseUrl: API_BASE_URL });
const publicClient = createApiClient({ baseUrl: API_BASE_URL });
const TESTING_CODE_OFFSET = 1_000_000;

const LOGIN_REGEX = /^[A-Za-z][A-Za-z0-9]{4,}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RU_NAME_REGEX = /^[А-ЯЁ][А-ЯЁа-яё -]+$/;
const RU_CITY_REGEX = /^[А-ЯЁ][А-ЯЁа-яё -]+$/;
const FATHER_NAME_REGEX = /^[А-ЯЁ][А-ЯЁа-яё-]*(?: [А-ЯЁ][А-ЯЁа-яё-]*)*$/;
const OPEN_LOGIN_STORAGE_KEY = "ni_open_login";
const LOGIN_REDIRECT_KEY = "ni_login_redirect";
const VERIFY_SUCCESS_STORAGE_KEY = "ni_email_verified_success";
const RESET_TOKEN_STORAGE_KEY = "ni_password_reset_token";

const normalizeRegisterForm = (form: RegisterFormState): RegisterFormState => ({
  ...form,
  login: form.login.trim(),
  email: form.email.trim(),
  surname: form.surname.trim(),
  name: form.name.trim(),
  fatherName: form.fatherName.trim(),
  country: form.country.trim(),
  city: form.city.trim(),
  school: form.school.trim(),
  subject: form.subject.trim()
});

const joinWithAnd = (items: string[]): string => {
  if (items.length === 0) {
    return "";
  }
  if (items.length === 1) {
    return items[0];
  }
  if (items.length === 2) {
    return `${items[0]} и ${items[1]}`;
  }
  return `${items.slice(0, -1).join(", ")} и ${items[items.length - 1]}`;
};

const buildPasswordRequirementMessage = (password: string): string => {
  const parts: string[] = [];
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /[0-9]/.test(password);

  if (password.length < 8) {
    parts.push("не менее 8 символов");
  }
  if (!hasUpper) {
    parts.push("хотя бы одну заглавную букву");
  }
  if (!hasLower) {
    parts.push("хотя бы одну строчную букву");
  }
  if (!hasDigit) {
    parts.push("хотя бы одну цифру");
  }

  if (parts.length === 0) {
    return "Пароль не соответствует требованиям безопасности.";
  }

  const lengthNote = password.length < 8;
  const requirements = joinWithAnd(parts.filter((item) => item !== "не менее 8 символов"));
  if (lengthNote && requirements) {
    return `Пароль должен быть не короче 8 символов и содержать ${requirements}.`;
  }
  if (lengthNote) {
    return "Пароль должен быть не короче 8 символов.";
  }
  return `Пароль должен содержать ${requirements}.`;
};

const getRegisterErrorMessage = (error: unknown, password: string): string => {
  if (error && typeof error === "object" && "code" in error) {
    const { code, message } = error as ApiError;
    if (code === "login_taken") {
      return "Логин уже зарегистрирован. Укажите другой логин.";
    }
    if (code === "email_taken") {
      return "Этот email уже зарегистрирован. Укажите другой email.";
    }
    if (code === "weak_password") {
      return buildPasswordRequirementMessage(password);
    }
    if (message) {
      return message;
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Не удалось зарегистрироваться. Проверьте введенные данные.";
};

const ROLE_OPTIONS = [
  { value: "student", label: "Ученик" },
  { value: "teacher", label: "Учитель" }
];

type SubjectValue = "math" | "cs" | "trial";

const SUBJECT_OPTIONS: { value: SubjectValue; label: string }[] = [
  { value: "math", label: "Математика" },
  { value: "cs", label: "Информатика" },
  //{ value: "trial", label: "Пробная олимпиада" }
];

const getStartErrorMessage = (error: unknown): string => {
  if (error && typeof error === "object" && "code" in error) {
    const { code, message } = error as ApiError;
    if (code === "olympiad_pool_not_active") {
      return "По выбранному предмету нет активной олимпиады.";
    }
    if (code === "olympiad_pool_empty") {
      return "Для выбранного предмета пока нет доступных олимпиад.";
    }
    if (code === "invalid_subject") {
      return "Неверный предмет для олимпиады.";
    }
    if (code === "olympiad_age_group_mismatch") {
      return "Олимпиада недоступна для вашего класса.";
    }
    if (code === "olympiad_not_available") {
      return "Сейчас олимпиада недоступна по времени.";
    }
    if (code === "olympiad_not_published") {
      return "Олимпиада ещё не опубликована.";
    }
    if (message) {
      return message;
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Не удалось начать олимпиаду.";
};

const CLASS_GRADES = Array.from({ length: 12 }, (_, index) => String(index));

type ContentItem = {
  id: number;
  content_type: "news" | "article";
  title: string;
  body: string;
  published_at: string | null;
};

const SCHEDULE_ITEMS = [
  { date: "05.10.2026 - 10.10.2026", title: "Олимпиада по математике «Невский интеграл» Дошкольники" },
  { date: "06.10.2026", title: "Олимпиада по математике «Невский интеграл» 1 класс" },
  { date: "07.10.2026", title: "Олимпиада по математике «Невский интеграл» 2 класс" },
  { date: "08.10.2026", title: "Олимпиада по математике «Невский интеграл» 3 класс" },
  { date: "09.10.2026", title: "Олимпиада по математике «Невский интеграл» 4 класс" },
  { date: "10.10.2026", title: "Олимпиада по математике «Невский интеграл» 5 класс" },
  { date: "11.10.2026", title: "Олимпиада по математике «Невский интеграл» 6-7 класс" },
];

const FAQ_ITEMS = [
  {
    question: "Кто может участвовать в олимпиаде?",
    answer: (
      <>
        <p>
          В олимпиаде «Невский интеграл» могут участвовать обучающиеся <strong>1–7 классов</strong>{" "}
          независимо от региона проживания и образовательной организации.
        </p>
        <p>Для дошкольников в рамках проекта проводится отдельное математическое мероприятие.</p>
      </>
    )
  },
  {
    question: "Как зарегистрироваться на олимпиаду?",
    answer: (
      <>
        <p>Для участия необходимо зарегистрироваться на сайте и создать личный кабинет.</p>
        <p>
          После регистрации подтвердите адрес электронной почты по ссылке из письма. Дополнительная регистрация
          перед каждым туром олимпиады не требуется.
        </p>
      </>
    )
  },
  {
    question: "Нужно ли регистрироваться заново, если я уже участвовал в «Невском интеграле»?",
    answer: (
      <>
        <p>Нет. Если у вас уже есть личный кабинет, используйте существующий аккаунт.</p>
        <p>
          Если вы забыли пароль, воспользуйтесь функцией <strong>«Восстановить пароль»</strong>.
        </p>
        <p>Перед участием рекомендуем проверить данные в личном кабинете.</p>
      </>
    )
  },
  {
    question: "Не получается зарегистрироваться. Что делать?",
    answer: (
      <>
        <p>Проверьте, что все обязательные поля заполнены и адрес электронной почты указан правильно.</p>
        <p>
          Если зарегистрироваться по-прежнему не удаётся, напишите в техническую поддержку:{" "}
          <strong>nevsky-integral@mail.ru</strong>.
        </p>
      </>
    )
  },
  {
    question: "Не пришло письмо для подтверждения электронной почты. Что делать?",
    answer: (
      <>
        <p>
          Проверьте правильность указанного при регистрации адреса, а также папки <strong>«Спам»</strong> и{" "}
          <strong>«Рассылки»</strong>. Письмо может прийти с небольшой задержкой.
        </p>
        <p>
          Если адрес электронной почты был указан с ошибкой, зарегистрируйтесь повторно, используя правильный
          адрес. Если по-прежнему не удаётся, напишите в техническую поддержку:{" "}
          <strong>nevsky-integral@mail.ru</strong>.
        </p>
      </>
    )
  },
  {
    question: "Не получается войти в личный кабинет. Что делать?",
    answer: (
      <>
        <p>В качестве логина используется адрес электронной почты, указанный при регистрации.</p>
        <p>
          Проверьте правильность логина и пароля. Если вы забыли пароль, воспользуйтесь функцией{" "}
          <strong>«Восстановить пароль»</strong>.
        </p>
        <p>Если проблема сохраняется, обратитесь в техническую поддержку.</p>
      </>
    )
  },
  {
    question: "Где посмотреть дату проведения олимпиады для моего класса?",
    answer: (
      <>
        <p>Для каждой возрастной группы устанавливается свой день проведения олимпиады.</p>
        <p>
          Актуальные даты доступны в разделе <strong>«Расписание»</strong> на сайте.
        </p>
      </>
    )
  },
  {
    question: "Как начать олимпиаду?",
    answer: (
      <>
        <p>
          В день проведения тура войдите в личный кабинет. Когда олимпиада станет доступна, появится кнопка{" "}
          <strong>«Начать олимпиаду»</strong>.
        </p>
        <p>После начала попытки запускается отсчёт времени.</p>
      </>
    )
  },
  {
    question: "Можно ли начать олимпиаду в любое время в течение дня?",
    answer: (
      <>
        <p>
          Да. В день проведения осеннего тура задания доступны{" "}
          <strong>с 08:00 до 21:00 по московскому времени</strong>.
        </p>
        <p>
          Начать выполнение можно в удобное время в пределах указанного периода. Учитывайте продолжительность
          олимпиады: начать попытку необходимо так, чтобы успеть завершить её до окончания установленного времени
          доступа.
        </p>
      </>
    )
  },
  {
    question: "Сколько времени даётся на выполнение заданий?",
    answer: (
      <>
        <p>Продолжительность олимпиады зависит от класса участника.</p>
        <p>Точное время отображается перед началом попытки.</p>
        <p>После начала олимпиады запускается таймер.</p>
      </>
    )
  },
  {
    question: "Можно ли пройти олимпиаду повторно?",
    answer: (
      <>
        <p>
          Нет. Для каждого участника предусмотрена <strong>одна попытка</strong>.
        </p>
        <p>
          Перед началом рекомендуем убедиться, что у вас достаточно времени для выполнения заданий и стабильное
          подключение к интернету.
        </p>
      </>
    )
  },
  {
    question: "Что делать, если во время олимпиады пропал интернет или случайно закрылась страница?",
    answer: (
      <>
        <p>
          Снова войдите в личный кабинет и откройте текущую попытку. Ранее сохранённые ответы останутся доступны.
        </p>
        <p>
          Обратите внимание:{" "}
          <strong>таймер олимпиады при выходе из личного кабинета или закрытии страницы не останавливается</strong>.
        </p>
        <p>
          Если продолжить выполнение не удаётся из-за технической ошибки платформы, обратитесь в техническую
          поддержку.
        </p>
      </>
    )
  },
  {
    question: "Когда будут опубликованы результаты?",
    answer: (
      <>
        <p>Результаты публикуются после завершения этапа и подведения итогов.</p>
        <p>
          Информация о сроках публикации размещается на сайте и в официальной группе «Невского интеграла»
          ВКонтакте.
        </p>
      </>
    )
  },
  {
    question: "Где посмотреть результаты?",
    answer: (
      <>
        <p>
          Индивидуальные результаты доступны в <strong>личном кабинете участника</strong> после подведения итогов.
        </p>
        <p>
          Общая информация об итогах олимпиады размещается в разделе <strong>«Результаты»</strong>.
        </p>
      </>
    )
  },
  {
    question: "Где скачать диплом или сертификат?",
    answer: (
      <>
        <p>
          После подведения итогов доступные участнику наградные документы появляются в{" "}
          <strong>личном кабинете</strong>.
        </p>
        <p>Диплом или сертификат можно скачать в электронном виде.</p>
      </>
    )
  },
  {
    question: "Кого пригласят на очный тур олимпиады?",
    answer: (
      <>
        <p>Участники очного тура определяются в соответствии с Положением об олимпиаде.</p>
        <p>
          Конкретные критерии приглашения устанавливаются по итогам дистанционных этапов и публикуются на
          официальном сайте олимпиады.
        </p>
      </>
    )
  },
  {
    question: "Как добавить учителя или ученика в сопровождение?",
    answer: (
      <>
        <p>В личном кабинете можно связать аккаунты ученика и учителя.</p>
        <p>
          Для этого отправьте запрос на сопровождение, указав логин нужного пользователя. При следующем входе
          пользователь сможет подтвердить или отклонить запрос.
        </p>
        <p>Ученик также может указать своего учителя в личном кабинете.</p>
      </>
    )
  },
  {
    question: "Не нашли ответ?",
    answer: (
      <>
        <p>Если возник вопрос о регистрации, работе личного кабинета или прохождении олимпиады, напишите нам:</p>
        <p>
          <strong>nevsky-integral@mail.ru</strong>
        </p>
        <p>Мы постараемся помочь разобраться.</p>
      </>
    )
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
type ResetErrors = {
  password?: string;
  passwordConfirm?: string;
  form?: string;
};

type PublicOlympiad = {
  id: number;
  title: string;
  description?: string | null;
  age_group: string;
  attempts_limit?: number;
  available_from: string;
  available_to: string;
  duration_sec: number;
  pass_percent?: number;
  is_published: boolean;
  results_released?: boolean;
};

const parseOlympiadIdFromTestingCode = (value: string): number | null => {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    return null;
  }
  const code = Number(normalized);
  if (!Number.isSafeInteger(code)) {
    return null;
  }
  const olympiadId = code - TESTING_CODE_OFFSET;
  if (!Number.isSafeInteger(olympiadId) || olympiadId <= 0) {
    return null;
  }
  return olympiadId;
};

const isOlympiadAvailableNow = (olympiad: PublicOlympiad): boolean => {
  const from = Date.parse(olympiad.available_from);
  const to = Date.parse(olympiad.available_to);
  if (Number.isNaN(from) || Number.isNaN(to)) {
    return false;
  }
  const now = Date.now();
  return now >= from && now <= to;
};

const formatOlympiadDateRange = (olympiad: PublicOlympiad): string => {
  const from = new Date(olympiad.available_from);
  const to = new Date(olympiad.available_to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return "Дата не указана";
  }
  const format: Intl.DateTimeFormatOptions = {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  };
  const fromDate = from.toLocaleDateString("ru-RU", format);
  const toDate = to.toLocaleDateString("ru-RU", format);
  return fromDate === toDate ? fromDate : `${fromDate} — ${toDate}`;
};

export function HomePage() {
  const { signIn, signOut, user, status } = useAuth();
  const navigate = useNavigate();
  const authStorage = useMemo(() => createMainAuthStorage(), []);
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
  const cityLookupTimer = useRef<number | null>(null);
  const schoolLookupTimer = useRef<number | null>(null);
  const testingCodeLookupTimer = useRef<number | null>(null);
  const testingCodeLookupRequestId = useRef(0);
  const cachedPublishedOlympiads = useRef<PublicOlympiad[] | null>(null);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isRegisterSuccessOpen, setIsRegisterSuccessOpen] = useState(false);
  const [isVerifySuccessOpen, setIsVerifySuccessOpen] = useState(false);
  const [isRecoveryOpen, setIsRecoveryOpen] = useState(false);
  const [isRecoverySentOpen, setIsRecoverySentOpen] = useState(false);
  const [isRecoveryNotFoundOpen, setIsRecoveryNotFoundOpen] = useState(false);
  const [isResetOpen, setIsResetOpen] = useState(false);
  const [isResetSuccessOpen, setIsResetSuccessOpen] = useState(false);
  const [isAgreementOpen, setIsAgreementOpen] = useState(false);
  const [agreementRole, setAgreementRole] = useState<RoleValue>("student");
  const [newsItems, setNewsItems] = useState<ContentItem[]>([]);
  const [articleItems, setArticleItems] = useState<ContentItem[]>([]);
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [schoolSuggestions, setSchoolSuggestions] = useState<string[]>([]);
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
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [recoveryStatus, setRecoveryStatus] = useState<"idle" | "loading" | "error">("idle");
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState("");
  const [resetErrors, setResetErrors] = useState<ResetErrors>({});
  const [resetStatus, setResetStatus] = useState<"idle" | "loading" | "error">("idle");
  const [startError, setStartError] = useState<string | null>(null);
  const [isInstructionOpen, setIsInstructionOpen] = useState(false);
  const [isNotFoundOpen, setIsNotFoundOpen] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [scheduleTargetIso, setScheduleTargetIso] = useState<string | null>(null);
  const [pendingOlympiad, setPendingOlympiad] = useState<PublicOlympiad | null>(null);
  const [startStatus, setStartStatus] = useState<"idle" | "loading" | "error">("idle");
  const [assignStatus, setAssignStatus] = useState<"idle" | "loading" | "error">("idle");
  const [testingCode, setTestingCode] = useState("");
  const [testingCodeOlympiad, setTestingCodeOlympiad] = useState<PublicOlympiad | null>(null);
  const [testingCodeStatus, setTestingCodeStatus] = useState<"idle" | "loading" | "error">("idle");
  const [testingCodeStartStatus, setTestingCodeStartStatus] = useState<"idle" | "loading" | "error">("idle");
  const [testingCodeError, setTestingCodeError] = useState<string | null>(null);
  const [isFaqOpen, setIsFaqOpen] = useState(false);

  const formatDateShort = (value: string) =>
    new Date(value).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });

  const toScheduleIso = (value: string) => {
    const [dayRaw, monthRaw, yearRaw] = value.split(".");
    const day = Number(dayRaw);
    const month = Number(monthRaw);
    const year = Number(yearRaw);
    if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) {
      return null;
    }
    const isoMonth = String(month).padStart(2, "0");
    const isoDay = String(day).padStart(2, "0");
    return `${year}-${isoMonth}-${isoDay}T00:00:00`;
  };

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

  useEffect(() => {
    if (!isRegisterOpen) {
      setCitySuggestions([]);
      setSchoolSuggestions([]);
      return;
    }
    const query = registerForm.city.trim();
    if (cityLookupTimer.current !== null) {
      window.clearTimeout(cityLookupTimer.current);
    }
    if (!query) {
      setCitySuggestions([]);
      setSchoolSuggestions([]);
      return;
    }
    cityLookupTimer.current = window.setTimeout(async () => {
      try {
        const cities = await publicClient.lookup.cities({ query, limit: 20 });
        setCitySuggestions(cities);
      } catch {
        setCitySuggestions([]);
      }
    }, 250);
    return () => {
      if (cityLookupTimer.current !== null) {
        window.clearTimeout(cityLookupTimer.current);
      }
    };
  }, [isRegisterOpen, registerForm.city]);

  useEffect(() => {
    if (!isRegisterOpen) {
      return;
    }
    const cityValue = registerForm.city.trim();
    const query = registerForm.school.trim();
    if (schoolLookupTimer.current !== null) {
      window.clearTimeout(schoolLookupTimer.current);
    }
    if (!cityValue) {
      setSchoolSuggestions([]);
      return;
    }
    schoolLookupTimer.current = window.setTimeout(async () => {
      try {
        const schools = await publicClient.lookup.schools({
          city: cityValue,
          query,
          limit: 50
        });
        setSchoolSuggestions(schools);
      } catch {
        setSchoolSuggestions([]);
      }
    }, 250);
    return () => {
      if (schoolLookupTimer.current !== null) {
        window.clearTimeout(schoolLookupTimer.current);
      }
    };
  }, [isRegisterOpen, registerForm.city, registerForm.school]);

  useEffect(() => {
    if (testingCodeLookupTimer.current !== null) {
      window.clearTimeout(testingCodeLookupTimer.current);
      testingCodeLookupTimer.current = null;
    }
    testingCodeLookupRequestId.current += 1;
    const requestId = testingCodeLookupRequestId.current;
    const normalizedCode = testingCode.trim();

    setTestingCodeError(null);
    setTestingCodeOlympiad(null);

    if (!normalizedCode) {
      setTestingCodeStatus("idle");
      return;
    }

    const olympiadId = parseOlympiadIdFromTestingCode(normalizedCode);
    if (olympiadId === null) {
      setTestingCodeStatus("error");
      setTestingCodeError("Введите корректный код тестирования.");
      return;
    }

    setTestingCodeStatus("loading");
    testingCodeLookupTimer.current = window.setTimeout(async () => {
      try {
        if (cachedPublishedOlympiads.current === null) {
          const olympiads = await publicClient.request<PublicOlympiad[]>({
            path: "/olympiads?limit=500&offset=0",
            method: "GET",
            auth: false
          });
          cachedPublishedOlympiads.current = olympiads ?? [];
        }

        if (requestId !== testingCodeLookupRequestId.current) {
          return;
        }

        const publishedOlympiads = cachedPublishedOlympiads.current ?? [];
        const candidate = publishedOlympiads.find((item) => item.id === olympiadId);
        if (!candidate) {
          setTestingCodeStatus("error");
          setTestingCodeError("Олимпиада по этому коду не найдена.");
          return;
        }
        if (!isOlympiadAvailableNow(candidate)) {
          setTestingCodeStatus("error");
          setTestingCodeError("Олимпиада по этому коду сейчас недоступна.");
          return;
        }

        setTestingCodeOlympiad(candidate);
        setTestingCodeStatus("idle");
      } catch {
        if (requestId !== testingCodeLookupRequestId.current) {
          return;
        }
        setTestingCodeStatus("error");
        setTestingCodeError("Не удалось проверить код тестирования.");
      }
    }, 250);

    return () => {
      if (testingCodeLookupTimer.current !== null) {
        window.clearTimeout(testingCodeLookupTimer.current);
        testingCodeLookupTimer.current = null;
      }
    };
  }, [testingCode]);

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
      }
    }
    if (!form.consent) {
      errors.consent = "Необходимо согласие.";
    }

    return errors;
  };

  const validateResetPassword = () => {
    const errors: ResetErrors = {};
    if (!resetPassword) {
      errors.password = "Введите пароль.";
    } else if (resetPassword.length < 8) {
      errors.password = "Пароль должен быть не короче 8 символов.";
    }
    if (!resetPasswordConfirm) {
      errors.passwordConfirm = "Повторите пароль.";
    } else if (resetPassword !== resetPasswordConfirm) {
      errors.passwordConfirm = "Пароли не совпадают.";
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
    setIsResetOpen(false);
    setRegisterErrors({});
    setRegisterErrorMessage(null);
    setLoginErrorMessage(null);
    setResetErrors({});
    setIsLoginOpen(true);
  };

  const openRegister = () => {
    setIsLoginOpen(false);
    setIsRecoveryOpen(false);
    setIsResetOpen(false);
    setLoginErrorMessage(null);
    setRegisterErrorMessage(null);
    setRegisterErrors({});
    setIsRegisterOpen(true);
  };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (isAuthenticated) {
      window.localStorage.removeItem(OPEN_LOGIN_STORAGE_KEY);
      return;
    }
    const flag = window.localStorage.getItem(OPEN_LOGIN_STORAGE_KEY);
    if (!flag) {
      return;
    }
    window.localStorage.removeItem(OPEN_LOGIN_STORAGE_KEY);
    openLogin();
  }, [isAuthenticated, openLogin]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (isAuthenticated) {
      return;
    }
    const flag = window.localStorage.getItem(VERIFY_SUCCESS_STORAGE_KEY);
    if (!flag) {
      return;
    }
    window.localStorage.removeItem(VERIFY_SUCCESS_STORAGE_KEY);
    setIsVerifySuccessOpen(true);
  }, [isAuthenticated]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const token = window.localStorage.getItem(RESET_TOKEN_STORAGE_KEY);
    if (!token) {
      return;
    }
    window.localStorage.removeItem(RESET_TOKEN_STORAGE_KEY);
    setResetToken(token);
    setResetErrors({});
    setResetPassword("");
    setResetPasswordConfirm("");
    setIsResetOpen(true);
  }, []);

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
    setRecoveryError(null);
    setRecoveryStatus("idle");
    setRecoveryEmail("");
    setIsRecoverySentOpen(false);
    setIsRecoveryNotFoundOpen(false);
    setIsRecoveryOpen(true);
  };

  const handleRecoverySubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRecoveryError(null);
    const trimmedEmail = recoveryEmail.trim();
    setRecoveryEmail(trimmedEmail);
    if (!trimmedEmail) {
      setRecoveryError("Введите email.");
      return;
    }
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setRecoveryError("Введите корректный email.");
      return;
    }

    setRecoveryStatus("loading");
    try {
      await publicClient.request({
        path: "/auth/password/reset/request",
        method: "POST",
        body: { email: trimmedEmail },
        auth: false
      });
      setRecoveryStatus("idle");
      setIsRecoveryOpen(false);
      setIsRecoverySentOpen(true);
    } catch (error) {
      const apiError = error as ApiError;
      if (apiError?.code === "user_not_found") {
        setRecoveryStatus("idle");
        setIsRecoveryOpen(false);
        setIsRecoveryNotFoundOpen(true);
        return;
      }
      setRecoveryStatus("error");
      setRecoveryError("Не удалось отправить письмо. Попробуйте позже.");
    }
  };

  const handleResetSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setResetErrors({});
    if (!resetToken) {
      setResetErrors({ form: "Ссылка для восстановления недействительна." });
      return;
    }
    const errors = validateResetPassword();
    if (Object.keys(errors).length > 0) {
      setResetErrors(errors);
      return;
    }

    setResetStatus("loading");
    try {
      await publicClient.request({
        path: "/auth/password/reset/confirm",
        method: "POST",
        body: { token: resetToken, new_password: resetPassword },
        auth: false
      });
      setResetStatus("idle");
      setIsResetOpen(false);
      setIsResetSuccessOpen(true);
      setResetToken(null);
      setResetPassword("");
      setResetPasswordConfirm("");
    } catch (error) {
      const apiError = error as ApiError;
      if (apiError?.code === "weak_password") {
        setResetErrors({ password: buildPasswordRequirementMessage(resetPassword) });
      } else if (apiError?.code === "invalid_token") {
        setResetErrors({ form: "Ссылка для восстановления недействительна или устарела." });
      } else {
        setResetErrors({ form: "Не удалось изменить пароль. Попробуйте позже." });
      }
      setResetStatus("error");
    }
  };

  const handleRegisterSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRegisterErrorMessage(null);
    const normalizedRegisterForm = normalizeRegisterForm(registerForm);
    setRegisterForm(normalizedRegisterForm);
    const errors = validateRegister(normalizedRegisterForm);
    if (Object.keys(errors).length > 0) {
      setRegisterErrors(errors);
      return;
    }

    setRegisterStatus("loading");
    try {
      await registerClient.auth.register({
        login: normalizedRegisterForm.login,
        password: normalizedRegisterForm.password,
        role: normalizedRegisterForm.role,
        email: normalizedRegisterForm.email,
        gender: normalizedRegisterForm.gender as "male" | "female",
        subscription: normalizedRegisterForm.subscription,
        surname: normalizedRegisterForm.surname,
        name: normalizedRegisterForm.name,
        father_name: normalizedRegisterForm.fatherName ? normalizedRegisterForm.fatherName : null,
        country: normalizedRegisterForm.country,
        city: normalizedRegisterForm.city,
        school: normalizedRegisterForm.school,
        class_grade: normalizedRegisterForm.role === "student" ? Number(normalizedRegisterForm.classGrade) : null,
        subject: normalizedRegisterForm.role === "teacher" ? normalizedRegisterForm.subject : null
      });
      setRegisterStatus("idle");
      setIsRegisterOpen(false);
      setIsRegisterSuccessOpen(true);
      setLoginForm((prev) => ({
        ...prev,
        login: registerForm.login,
        password: ""
      }));
      setIsLoginOpen(false);
    } catch (error) {
      setRegisterErrorMessage(getRegisterErrorMessage(error, registerForm.password));
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
      if (typeof window !== "undefined") {
        const redirectPath = window.localStorage.getItem(LOGIN_REDIRECT_KEY);
        if (redirectPath) {
          window.localStorage.removeItem(LOGIN_REDIRECT_KEY);
          navigate(redirectPath, { replace: true });
          return;
        }
      }
      navigate("/cabinet");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ошибка входа.";
      setLoginErrorMessage(message);
      setLoginStatus("error");
    }
  };

  const handleStartSubject = async (subject: SubjectValue) => {
    setStartError(null);
    setIsNotFoundOpen(false);
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
    setAssignStatus("loading");
    try {
      const olympiad = await authedClient.request<PublicOlympiad>({
        path: "/olympiads/assign",
        method: "POST",
        body: { subject }
      });
      setPendingOlympiad(olympiad);
      setIsInstructionOpen(true);
      setAssignStatus("idle");
    } catch (error) {
      setStartError(getStartErrorMessage(error));
      setAssignStatus("error");
    }
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
      const message = getStartErrorMessage(error);
      setStartError(message);
      setStartStatus("error");
      setIsInstructionOpen(false);
    }
  };

  const handleTestingCodeStart = async () => {
    setTestingCodeError(null);
    if (status !== "authenticated" || !user) {
      openLogin();
      return;
    }
    if (user.role !== "student") {
      setTestingCodeError("Начать олимпиаду могут только ученики.");
      return;
    }
    if (!user.is_email_verified) {
      setTestingCodeError("Подтвердите email, чтобы участвовать в олимпиаде.");
      return;
    }
    if (!testingCodeOlympiad) {
      setTestingCodeError("Введите корректный код тестирования.");
      return;
    }

    setTestingCodeStartStatus("loading");
    try {
      const attempt = await authedClient.request<{ id: number }>({
        path: "/attempts/start",
        method: "POST",
        body: { olympiad_id: testingCodeOlympiad.id }
      });
      setTestingCodeStartStatus("idle");
      navigate(`/olympiad?attemptId=${attempt.id}`);
    } catch (error) {
      setTestingCodeError(getStartErrorMessage(error));
      setTestingCodeStartStatus("error");
    }
  };

  const hasNews = newsItems.length > 0;
  const hasArticles = articleItems.length > 0;
  const navItems = [
    { label: "Об олимпиаде", href: "#about" },
    { label: "Расписание", href: "#schedule" },
    { label: "Результаты", href: "/results" },
    { label: "Архив заданий", href: "/archive" },
    ...(hasNews ? [{ label: "Новости", href: "#news" }] : []),
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
            <a href="https://vk.com/nevsky.integral" target="_blank" className="home-vk-link" aria-label="ВК Олимпиада">
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
        >
          <img
            className="home-hero-image"
            src={bannerImage}
            alt=""
            aria-hidden="true"
            decoding="async"
            loading="eager"
            fetchPriority="high"
            width={1536}
            height={664}
          />
          <div className="container home-hero-inner">
            <div className="home-hero-title">
              <h1>
                Олимпиада
                <br />
                Невский интеграл
              </h1>
              <div className="home-hero-message">
               <h2>До старта нового сезона:</h2>
               <br />
               <Countdown targetIso={TARGET_DATE} className="home-hero-countdown"/>
              </div>
            </div>
          </div>
        </section>

        <section id="choose" className="home-section-alt" hidden>
          <div className="container">
            <div className="home-section-heading">
              <h2>Начать олимпиаду</h2>
              <p className="home-text-2">Выберите предмет, система назначит вариант автоматически.</p>
            </div>
            <div className="home-olympiad-select">
              <div className="home-subject-actions">
                {SUBJECT_OPTIONS.map((subject) => (
                  <Button
                    key={subject.value}
                    type="button"
                    onClick={() => handleStartSubject(subject.value)}
                    isLoading={assignStatus === "loading"}
                    disabled={assignStatus === "loading"}
                  >
                    {subject.label}
                  </Button>
                ))}
              </div>
              {assignStatus === "loading" ? <p className="home-text">Подбираем олимпиаду...</p> : null}
              {startError ? <p className="home-error">{startError}</p> : null}
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
                  интеллектуальных конкурсов на 2026/27 учебный год, утвержденный
                  проектом приказом Министерства просвещения РФ от 16.07.2026.
                </p>
                <a href="https://base.garant.ru/57060592/" target="_blank" rel="noreferrer">
                  <img src={minprosImage} alt="Министерство просвещения РФ" className="home-minpros" />
                </a>
              </div>
              <div>
                <h3>Документы</h3>
                <div className="home-docs">
                  <a href="/docs/polozhenie.pdf" target="_blank" rel="noreferrer" className="home-doc-link">
                    Положение (PDF)
                  </a>
                  <a href="https://base.garant.ru/57060592/" target="_blank" rel="noreferrer" className="home-doc-link">
                    Перечень (PDF)
                  </a>
                  <a href="/docs/instruction.pdf" target="_blank" rel="noreferrer" className="home-doc-link">
                    Инструкция по регистрации (PDF)
                  </a>
                  <a href="/docs/poster.pdf" target="_blank" rel="noreferrer" className="home-doc-link">
                    Презентационный плакат (PDF)
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="contacts" className="home-section-alt">
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
                    <button
                      type="button"
                      className="home-schedule-card"
                      onClick={() => {
                        setScheduleTargetIso(toScheduleIso(item.date));
                        setIsScheduleOpen(true);
                      }}
                    >
                      <div className="home-schedule-date">{item.date}</div>
                      <div className="home-schedule-title">{item.title}</div>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="results" className="home-section-alt home-section-hidden">
          <div className="container">
            <div className="home-section-heading">
              <h2>Архив заданий</h2>
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
              <button
                type="button"
                className="home-faq-toggle"
                onClick={() => setIsFaqOpen((prev) => !prev)}
              >
                Часто задаваемые вопросы
              </button>
            </div>
            {isFaqOpen ? (
              <div className="home-faq">
                {FAQ_ITEMS.map((item) => (
                  <details key={item.question}>
                    <summary>{item.question}</summary>
                    <div className="home-faq-answer">{item.answer}</div>
                  </details>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <section className="home-section">
          <div className="container">
            <div className="home-section-heading">
              <h2>Организаторы и партнеры</h2>
            </div>
            <div className="home-carousel">
              <a href="https://licey344spb.ru/" target="_blank" rel="noreferrer" className="home-partner-card">
                <img src={lyc344Logo} alt="Лицей 344" />
              </a>
              <a href="https://power-m.ru/" target="_blank" rel="noreferrer" className="home-partner-card">
                <img src={SMLogo} alt="Силовые Машины" />
              </a>
              <a href="https://bloxels.ru/?utm_campaign=nevsky_integral" target="_blank" rel="noreferrer" className="home-partner-card">
                <img src={bloxLogo} alt="Блоксели" />
              </a>
              <a href="https://znanierussia.ru" target="_blank" rel="noreferrer" className="home-partner-card">
                <img src={znanieLogo} alt="Знание" />
              </a>
              <a href="https://ingtech.info/news" target="_blank" rel="noreferrer" className="home-partner-card">
                <img src={consorciumLogo} alt="Инженерно-технологический консорциум" />
              </a>
              <a href="https://prosv.ru" target="_blank" rel="noreferrer" className="home-partner-card">
                <img src={prosvLogo} alt="Просвещение" />
              </a>
              <a href="https://lyceum-it.ru" target="_blank" rel="noreferrer" className="home-partner-card">
                <img src={itLogo} alt="Лицей ИТ" />
              </a>
              <a href="https://www.herzen.spb.ru/" target="_blank" rel="noreferrer" className="home-partner-card">
                <img src={herzenLogo} alt="РГПУ им. А. И. Герцена" />
              </a>
              <a href="http://www.spass-sci.ru/" target="_blank" rel="noreferrer" className="home-partner-card">
                <img src={spassSciLogo} alt="СПб АППО" />
              </a>
            </div>
          </div>
        </section>

        <section className="home-section-alt">
          <div className="container">
            <div className="home-section-heading">
            </div>
            <div className="home-code-testing">
              <div className="home-code-controls">
                <input
                  type="text"
                  name="testing-code"
                  className="home-code-input"
                  placeholder="Промокод"
                  value={testingCode}
                  onChange={(event) => setTestingCode(event.target.value)}
                  inputMode="numeric"
                  autoComplete="off"
                  aria-label="Промокод"
                />
                <Button
                  type="button"
                  onClick={handleTestingCodeStart}
                  isLoading={testingCodeStartStatus === "loading"}
                  disabled={
                    testingCodeStatus === "loading" ||
                    testingCodeStartStatus === "loading" ||
                    !testingCodeOlympiad
                  }
                >
                  ok
                </Button>
              </div>
              {testingCodeStatus === "loading" ? <p className="home-text">Проверяем код...</p> : null}
              {testingCodeOlympiad ? (
                <div className="home-code-meta">
                  <p className="home-code-title">{testingCodeOlympiad.title}</p>
                  <p>Класс: {testingCodeOlympiad.age_group}</p>
                  <p>Дата проведения: {formatOlympiadDateRange(testingCodeOlympiad)}</p>
                  <p>Длительность: {Math.round(testingCodeOlympiad.duration_sec / 60)} минут</p>
                </div>
              ) : null}
              {testingCodeError ? <p className="home-error">{testingCodeError}</p> : null}
            </div>
          </div>
        </section>

        <section id="contacts" className="home-section-alt">
          <div className="container">
            <h2>Контакты</h2>
            <p className="home-text-2">nevsky-integral@mail.ru</p>
          </div>
        </section>

        <Modal
          isOpen={isInstructionOpen}
          onClose={() => setIsInstructionOpen(false)}
          title="Инструкция перед началом"
          className="home-instruction-modal"
          closeOnBackdrop={false}
        >
          <div className="home-instruction">
            <p>
              Вы собираетесь начать олимпиаду{" "}
              <strong>{pendingOlympiad?.title ?? "Невский интеграл"}</strong>.
            </p>
            <ul>
              <li>Время прохождения: {pendingOlympiad ? Math.round(pendingOlympiad.duration_sec / 60) : 0} минут.</li>
              <li>Таймер запускается сразу после нажатия кнопки «Начать».</li>
              <li>За 5 минут до окончания времени олимпиады появится уведомление.</li>
              <li>Олимпиаду пройти повторно нельзя, дается только 1 попытка.</li>
              <li>Ответы сохраняются автоматически при переходе между заданиями.</li>
              <li>Можно досрочно закончить олимпиаду по кнопке "Завершить".</li>
              <li>Если случайно вышли из олимпиады, вы можете продолжить, осуществив повторное подключение.</li>
              <li>Результаты и дипломы будут доступны после завершения всего второго отборочного тура.</li>
              <li>Внимательно читайте условие заданий.</li>
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
          isOpen={isNotFoundOpen}
          onClose={() => setIsNotFoundOpen(false)}
          title="Олимпиада не найдена"
        >
          <p>Олимпиада не найдена.</p>
        </Modal>
        <Modal isOpen={isScheduleOpen} onClose={() => setIsScheduleOpen(false)}>
          <div className="home-schedule-modal-body">
            <p>До олимпиады осталось</p>
            {scheduleTargetIso ? <Countdown targetIso={scheduleTargetIso} /> : null}
          </div>
        </Modal>

        <Modal
          isOpen={isRegisterOpen}
          onClose={() => setIsRegisterOpen(false)}
          title="Регистрация"
          className="auth-modal"
          closeOnBackdrop={false}
        >
          <form className="auth-form" onSubmit={handleRegisterSubmit}>
            <div className="auth-instruction-link">
              <a href="/docs/instruction.pdf" target="_blank" rel="noreferrer">
                инструкция
              </a>
            </div>
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
                placeholder="например, popov12"
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
                placeholder="например, popov12@mail.ru"
                helperText="Используйте действующий email — понадобится для входа и восстановления пароля."
              />
              <TextInput
                label="Пароль"
                name="password"
                type="password"
                autoComplete="new-password"
                value={registerForm.password}
                onChange={(event) => updateRegisterField("password", event.target.value)}
                error={registerErrors.password}
                placeholder="например, Password2012"
                helperText="Длина минимум 8 символов. Используйте минимум одну цифру, одну большую и одну маленькую буквы."
              />
              <TextInput
                label="Повтор пароля"
                name="passwordConfirm"
                type="password"
                autoComplete="new-password"
                value={registerForm.passwordConfirm}
                onChange={(event) => updateRegisterField("passwordConfirm", event.target.value)}
                error={registerErrors.passwordConfirm}
                placeholder="например, Password2012"
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
                placeholder="например, Попов"
                helperText="С заглавной буквы на русском языке."
              />
              <TextInput
                label="Имя"
                name="name"
                value={registerForm.name}
                onChange={(event) => updateRegisterField("name", event.target.value)}
                error={registerErrors.name}
                placeholder="например, Иван"
                helperText="С заглавной буквы на русском языке."
              />
              <TextInput
                label="Отчество"
                name="fatherName"
                value={registerForm.fatherName}
                onChange={(event) => updateRegisterField("fatherName", event.target.value)}
                error={registerErrors.fatherName}
                placeholder="например, Иванович"
                helperText="С заглавной буквы на русском языке."
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
                placeholder="например, Россия"
                helperText="С заглавной буквы на русском языке."
              />
              <TextInput
                label="Город"
                name="city"
                value={registerForm.city}
                onChange={(event) => updateRegisterField("city", event.target.value)}
                error={registerErrors.city}
                helperText="С заглавной буквы на русском языке."
                list="register-city-suggestions"
              />
              <datalist id="register-city-suggestions">
                {citySuggestions.map((city) => (
                  <option key={city} value={city} />
                ))}
              </datalist>
              <TextInput
                label="Школа"
                name="school"
                value={registerForm.school}
                onChange={(event) => updateRegisterField("school", event.target.value)}
                error={registerErrors.school}
                helperText="Если школы нет в списке, добавьте самостоятельно. Пример: ГБОУ СОШ №3"
                list="register-school-suggestions"
              />
              <datalist id="register-school-suggestions">
                {schoolSuggestions.map((school) => (
                  <option key={school} value={school} />
                ))}
              </datalist>
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
                  placeholder="например, Математика"
                  helperText="С заглавной буквы на русском языке."
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
          isOpen={isRegisterSuccessOpen}
          onClose={() => setIsRegisterSuccessOpen(false)}
          title="Поздравляем!"
          className="auth-modal"
          closeOnBackdrop={false}
        >
          <p className="auth-success-message">
            Поздравляем!
            <br />
            Вы зарегистрировались.
            <br />
            Подтвердите свою регистрацию. На электронной почте, которую вы указали при регистрации,
            найдите письмо (возможно в спаме) от support@nevsky-integral.ru и пройдите по ссылке, указанной в этом письме.
          </p>
          <div className="auth-actions">
            <Button
              type="button"
              className="auth-success-button"
              onClick={() => setIsRegisterSuccessOpen(false)}
            >
              Ок
            </Button>
          </div>
        </Modal>

        <Modal
          isOpen={isVerifySuccessOpen}
          onClose={() => {
            setIsVerifySuccessOpen(false);
            openLogin();
          }}
          title="Верификация прошла успешно"
          className="auth-modal"
          closeOnBackdrop={false}
        >
          <p className="auth-success-message">Поздравляем! <br /> Теперь можно перейти в личный кабинет</p>
          <div className="auth-actions">
            <Button
              type="button"
              className="auth-success-button"
              onClick={() => {
                setIsVerifySuccessOpen(false);
                openLogin();
              }}
            >
              Ок
            </Button>
          </div>
        </Modal>

        <Modal
          isOpen={isLoginOpen}
          onClose={() => setIsLoginOpen(false)}
          title="Вход"
          className="auth-modal"
          closeOnBackdrop={false}
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
                className="auth-login-button"
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
          title="Запрос на восстановление"
          className="auth-modal"
          closeOnBackdrop={false}
        >
          <form className="auth-form auth-form-centered" onSubmit={handleRecoverySubmit}>
            <div className="auth-grid auth-grid-single">
              <TextInput
                label="Email"
                name="recovery"
                value={recoveryEmail}
                onChange={(event) => setRecoveryEmail(event.target.value)}
                placeholder="email, указанный при регистрации"
                error={recoveryError ?? undefined}
              />
            </div>
            <div className="auth-actions auth-actions-centered">
              <Button type="submit" isLoading={recoveryStatus === "loading"}>
                Отправить
              </Button>
              <button type="button" className="auth-link" onClick={openLogin}>
                Назад к входу
              </button>
            </div>
          </form>
        </Modal>

        <Modal
          isOpen={isRecoverySentOpen}
          onClose={() => setIsRecoverySentOpen(false)}
          title="Восстановление пароля"
          className="auth-modal"
          closeOnBackdrop={false}
        >
          <p className="auth-success-message">
            Письмо на восстановление отправленно. Проверьте email.
          </p>
          <div className="auth-actions">
            <Button
              type="button"
              className="auth-success-button"
              onClick={() => setIsRecoverySentOpen(false)}
            >
              Ок
            </Button>
          </div>
        </Modal>

        <Modal
          isOpen={isRecoveryNotFoundOpen}
          onClose={() => setIsRecoveryNotFoundOpen(false)}
          title="Восстановление пароля"
          className="auth-modal"
          closeOnBackdrop={false}
        >
          <p className="auth-success-message">Пользователь с таким email не зарегистрирован</p>
          <div className="auth-actions">
            <Button
              type="button"
              className="auth-success-button"
              onClick={() => setIsRecoveryNotFoundOpen(false)}
            >
              Ок
            </Button>
          </div>
        </Modal>

        <Modal
          isOpen={isResetOpen}
          onClose={() => setIsResetOpen(false)}
          title="Восстановление пароля"
          className="auth-modal"
          closeOnBackdrop={false}
        >
          <form className="auth-form auth-form-centered" onSubmit={handleResetSubmit}>
            <div className="auth-grid auth-grid-single">
              <TextInput
                label="Новый пароль"
                placeholder="Password123" 
                name="resetPassword"
                type="password"
                autoComplete="new-password"
                value={resetPassword}
                onChange={(event) => setResetPassword(event.target.value)}
                error={resetErrors.password}
              />
              <TextInput
                label="Повтор пароля"
                name="resetPasswordConfirm"
                placeholder="Password123" 
                type="password"
                autoComplete="new-password"
                value={resetPasswordConfirm}
                onChange={(event) => setResetPasswordConfirm(event.target.value)}
                error={resetErrors.passwordConfirm}
              />
            </div>
            {resetErrors.form ? (
              <div className="auth-alert" role="alert">
                {resetErrors.form}
              </div>
            ) : null}
            <div className="auth-actions auth-actions-centered">
              <Button type="submit" isLoading={resetStatus === "loading"}>
                Сохранить пароль
              </Button>
            </div>
          </form>
        </Modal>

        <Modal
          isOpen={isResetSuccessOpen}
          onClose={() => setIsResetSuccessOpen(false)}
          title="Восстановление пароля"
          className="auth-modal"
          closeOnBackdrop={false}
        >
          <p className="auth-success-message">Пароль успешно изменен</p>
          <div className="auth-actions">
            <Button
              type="button"
              className="auth-success-button"
              onClick={() => {
                setIsResetSuccessOpen(false);
                openLogin();
              }}
            >
              Ок
            </Button>
          </div>
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
              <p>Привет! Меня зовут Интегралик - я очень любознательный котик, который обожает задачи, загадки и интересные вопросы, особенно те, над которыми нужно хорошенько подумать.<br /> Я знаю: не каждая задача решается с первого раза. Поэтому я учу внимательно читать условие, рассматривать разные пути и не сдаваться после первой неудачи. Мой девиз простой: «Думай, ищи и находи!».<br />Я верю, что каждая задача - это маленькое открытие, а каждая попытка делает нас умнее и сильнее.</p>
              <span>Котик Интегралик - талисман олимпиады</span>
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
