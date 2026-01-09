import React, { useEffect, useMemo, useState } from "react";
import { Button, LayoutShell, Modal, Table, TextInput, useAuth } from "@ui";
import { createApiClient, type UserRead } from "@api";
import { createAuthStorage } from "@utils";
import { Link, Navigate } from "react-router-dom";
import logoImage from "../assets/logo2.png";
import "../styles/cabinet.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

const LOGIN_REGEX = /^[A-Za-z][A-Za-z0-9]*$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RU_NAME_REGEX = /^[А-ЯЁ][а-яё]+$/;
const RU_TEXT_REGEX = /^[А-ЯЁа-яё]+$/;

type AttemptResult = {
  attempt_id: number;
  olympiad_id: number;
  status: string;
  score_total: number;
  score_max: number;
  graded_at: string | null;
};

type AttemptTask = {
  task_id: number;
  title: string;
  current_answer?: unknown;
  answer_payload?: unknown;
};

type AttemptView = {
  attempt: { id: number };
  olympiad_title: string;
  tasks: AttemptTask[];
};

type ProfileForm = {
  login: string;
  email: string;
  surname: string;
  name: string;
  fatherName: string;
  country: string;
  city: string;
  school: string;
  classGrade: string;
  subject: string;
};

type ProfileErrors = Partial<Record<keyof ProfileForm, string>>;

type TeacherEntry = {
  id: number;
  fullName: string;
  subject: string;
};

type StudentLink = {
  id: number;
  student_id: number;
  status: string;
};

export function CabinetPage() {
  const { status, user, tokens, setSession } = useAuth();
  const storage = useMemo(
    () =>
      createAuthStorage({
        tokensKey: "ni_main_tokens",
        userKey: "ni_main_user"
      }),
    []
  );
  const client = useMemo(() => createApiClient({ baseUrl: API_BASE_URL, storage }), [storage]);

  const [profileForm, setProfileForm] = useState<ProfileForm>({
    login: "",
    email: "",
    surname: "",
    name: "",
    fatherName: "",
    country: "Россия",
    city: "",
    school: "",
    classGrade: "",
    subject: ""
  });
  const [profileErrors, setProfileErrors] = useState<ProfileErrors>({});
  const [profileStatus, setProfileStatus] = useState<"idle" | "saving" | "error">("idle");
  const [profileMessage, setProfileMessage] = useState<string | null>(null);

  const [attemptResults, setAttemptResults] = useState<AttemptResult[]>([]);
  const [attemptsStatus, setAttemptsStatus] = useState<"idle" | "loading" | "error">("idle");
  const [attemptsError, setAttemptsError] = useState<string | null>(null);
  const [attemptView, setAttemptView] = useState<AttemptView | null>(null);
  const [attemptViewStatus, setAttemptViewStatus] = useState<"idle" | "loading" | "error">("idle");
  const [attemptViewError, setAttemptViewError] = useState<string | null>(null);

  const [emailRequestStatus, setEmailRequestStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [isEmailWarningOpen, setIsEmailWarningOpen] = useState(false);

  const [teacherName, setTeacherName] = useState("");
  const [teacherSubject, setTeacherSubject] = useState("");
  const [teacherList, setTeacherList] = useState<TeacherEntry[]>([]);
  const [linkRequestValue, setLinkRequestValue] = useState("");
  const [linkStatusMessage, setLinkStatusMessage] = useState<string | null>(null);

  const [students, setStudents] = useState<StudentLink[]>([]);

  useEffect(() => {
    if (!user) {
      return;
    }
    setProfileForm({
      login: user.login ?? "",
      email: user.email ?? "",
      surname: user.surname ?? "",
      name: user.name ?? "",
      fatherName: user.father_name ?? "",
      country: user.country ?? "Россия",
      city: user.city ?? "",
      school: user.school ?? "",
      classGrade: user.class_grade !== null && user.class_grade !== undefined ? String(user.class_grade) : "",
      subject: user.subject ?? ""
    });
  }, [user]);

  useEffect(() => {
    if (user && !user.is_email_verified) {
      setIsEmailWarningOpen(true);
    }
  }, [user]);

  useEffect(() => {
    if (!user || user.role !== "student") {
      return;
    }
    setAttemptsStatus("loading");
    setAttemptsError(null);
    client
      .request<AttemptResult[]>({ path: "/attempts/results/my", method: "GET" })
      .then((data) => {
        setAttemptResults(data ?? []);
        setAttemptsStatus("idle");
      })
      .catch(() => {
        setAttemptsError("Не удалось загрузить результаты.");
        setAttemptsStatus("error");
      });
  }, [client, user]);

  useEffect(() => {
    if (!user || user.role !== "teacher") {
      return;
    }
    client
      .request<StudentLink[]>({ path: "/teacher/students?status=confirmed", method: "GET" })
      .then((data) => setStudents(data ?? []))
      .catch(() => setStudents([]));
  }, [client, user]);

  if (status === "loading" || status === "idle") {
    return <div className="cabinet-page">Загрузка...</div>;
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  const validateProfile = (form: ProfileForm) => {
    const errors: ProfileErrors = {};

    if (!form.login || !LOGIN_REGEX.test(form.login)) {
      errors.login = "Логин: латинские буквы/цифры, начинается с буквы.";
    }
    if (!form.email || !EMAIL_REGEX.test(form.email)) {
      errors.email = "Введите корректный email.";
    }
    if (!form.surname || !RU_NAME_REGEX.test(form.surname)) {
      errors.surname = "Только русские буквы, первая заглавная.";
    }
    if (!form.name || !RU_NAME_REGEX.test(form.name)) {
      errors.name = "Только русские буквы, первая заглавная.";
    }
    if (form.fatherName && !RU_NAME_REGEX.test(form.fatherName)) {
      errors.fatherName = "Только русские буквы, первая заглавная.";
    }
    if (!form.city || !RU_NAME_REGEX.test(form.city)) {
      errors.city = "Только русские буквы, первая заглавная.";
    }
    if (!form.school) {
      errors.school = "Введите школу.";
    }
    if (user.role === "student" && !form.classGrade) {
      errors.classGrade = "Выберите класс.";
    }
    if (user.role === "teacher") {
      if (!form.subject) {
        errors.subject = "Введите предмет.";
      } else if (!RU_TEXT_REGEX.test(form.subject)) {
        errors.subject = "Только русские буквы.";
      }
    }

    return errors;
  };

  const handleProfileChange = <K extends keyof ProfileForm>(field: K, value: ProfileForm[K]) => {
    setProfileForm((prev) => ({
      ...prev,
      [field]: value
    }));
    if (profileErrors[field]) {
      setProfileErrors((prev) => ({
        ...prev,
        [field]: undefined
      }));
    }
  };

  const handleProfileSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileMessage(null);
    const errors = validateProfile(profileForm);
    if (Object.keys(errors).length > 0) {
      setProfileErrors(errors);
      return;
    }
    setProfileStatus("saving");
    try {
      const updated = await client.request<UserRead>({
        path: "/users/me",
        method: "PUT",
        body: {
          surname: profileForm.surname.trim(),
          name: profileForm.name.trim(),
          father_name: profileForm.fatherName ? profileForm.fatherName.trim() : null,
          country: profileForm.country.trim(),
          city: profileForm.city.trim(),
          school: profileForm.school.trim(),
          class_grade: profileForm.classGrade ? Number(profileForm.classGrade) : null,
          subject: profileForm.subject ? profileForm.subject.trim() : null
        }
      });
      if (tokens) {
        setSession(tokens, updated);
      }
      setProfileStatus("idle");
      setProfileMessage("Данные сохранены.");
    } catch {
      setProfileStatus("error");
      setProfileMessage("Не удалось сохранить изменения.");
    }
  };

  const handleEmailVerifyRequest = async () => {
    if (!profileForm.email) {
      return;
    }
    setEmailRequestStatus("sending");
    try {
      await client.request({
        path: "/auth/verify/request",
        method: "POST",
        auth: false,
        body: { email: profileForm.email }
      });
      setEmailRequestStatus("sent");
    } catch {
      setEmailRequestStatus("error");
    }
  };

  const openAttempt = async (attemptId: number) => {
    setAttemptViewStatus("loading");
    setAttemptViewError(null);
    setAttemptView(null);
    try {
      const data = await client.request<AttemptView>({
        path: `/attempts/${attemptId}`,
        method: "GET"
      });
      setAttemptView(data);
      setAttemptViewStatus("idle");
    } catch {
      setAttemptViewStatus("error");
      setAttemptViewError("Не удалось загрузить попытку.");
    }
  };

  const formatDate = (value: string | null) => {
    if (!value) {
      return "—";
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("ru-RU");
  };

  const formatAnswer = (answer: unknown) => {
    if (!answer) {
      return "Нет ответа";
    }
    try {
      return JSON.stringify(answer);
    } catch {
      return String(answer);
    }
  };

  const addTeacher = () => {
    if (!teacherName || !teacherSubject) {
      return;
    }
    setTeacherList((prev) => [
      ...prev,
      {
        id: Date.now(),
        fullName: teacherName.trim(),
        subject: teacherSubject.trim()
      }
    ]);
    setTeacherName("");
    setTeacherSubject("");
  };

  const sendLinkRequest = async () => {
    if (!linkRequestValue) {
      return;
    }
    setLinkStatusMessage(null);
    if (user.role === "teacher") {
      try {
        await client.request({
          path: "/teacher/students",
          method: "POST",
          body: { attach: { student_login: linkRequestValue.trim() } }
        });
        setLinkStatusMessage("Запрос отправлен.");
      } catch {
        setLinkStatusMessage("Не удалось отправить запрос.");
      }
    } else {
      setLinkStatusMessage("Запрос отправлен.");
    }
  };

  return (
    <div className="cabinet-page">
      <LayoutShell
        logo={
          <Link to="/" className="cabinet-logo">
            <img src={logoImage} alt="Невский интеграл" />
            <span>НЕВСКИЙ<br />ИНТЕГРАЛ</span>
          </Link>
        }
        nav={
          <div className="cabinet-nav">
            <Link to="/">Главная</Link>
            <span className="cabinet-nav-current">Личный кабинет</span>
          </div>
        }
        actions={
          <div className="cabinet-actions">
            <span className="cabinet-user">{user.login}</span>
          </div>
        }
        footer={<div className="home-footer">© 2026 Олимпиада «Невский интеграл»</div>}
      >
        <main className="cabinet-content">
          <section className="cabinet-section">
            <h1>Личный кабинет</h1>
            <p className="cabinet-subtitle">Добро пожаловать, {user.surname} {user.name}.</p>
          </section>

          <section className="cabinet-section" id="results">
            <div className="cabinet-section-heading">
              <h2>Результаты прохождения олимпиад</h2>
            </div>
            {attemptsStatus === "error" ? <div className="cabinet-alert">{attemptsError}</div> : null}
            <Table>
              <thead>
                <tr>
                  <th>№</th>
                  <th>Дата прохождения</th>
                  <th>Название олимпиады</th>
                  <th>Результат</th>
                  <th>Просмотр попытки</th>
                  <th>Диплом</th>
                </tr>
              </thead>
              <tbody>
                {attemptsStatus === "loading" ? (
                  <tr>
                    <td colSpan={6}>Загрузка...</td>
                  </tr>
                ) : attemptResults.length > 0 ? (
                  attemptResults.map((item, index) => (
                    <tr key={item.attempt_id}>
                      <td>{index + 1}</td>
                      <td>{formatDate(item.graded_at)}</td>
                      <td>Олимпиада #{item.olympiad_id}</td>
                      <td>
                        {item.score_total}/{item.score_max}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="cabinet-link"
                          onClick={() => {
                            openAttempt(item.attempt_id);
                          }}
                        >
                          Просмотр попытки
                        </button>
                      </td>
                      <td>
                        <a
                          className="cabinet-link"
                          href={`${API_BASE_URL}/attempts/${item.attempt_id}/diploma`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Диплом
                        </a>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6}>Результаты пока отсутствуют.</td>
                  </tr>
                )}
              </tbody>
            </Table>
          </section>

          <section className="cabinet-section" id="profile">
            <div className="cabinet-section-heading">
              <h2>Личные данные</h2>
            </div>
            <form className="cabinet-form" onSubmit={handleProfileSave}>
              <TextInput
                label="Логин"
                name="login"
                value={profileForm.login}
                onChange={(event) => handleProfileChange("login", event.target.value)}
                error={profileErrors.login}
              />
              <div className="cabinet-email-row">
                <TextInput
                  label="Email"
                  name="email"
                  type="email"
                  value={profileForm.email}
                  onChange={(event) => handleProfileChange("email", event.target.value)}
                  error={profileErrors.email}
                />
                <div className="cabinet-email-status">
                  <span
                    className={
                      user.is_email_verified ? "cabinet-status cabinet-status-verified" : "cabinet-status cabinet-status-unverified"
                    }
                  >
                    {user.is_email_verified ? "Верифицирован" : "Не верифицирован"}
                  </span>
                  {!user.is_email_verified ? (
                    <Button
                      type="button"
                      size="sm"
                      className="cabinet-verify-button"
                      onClick={handleEmailVerifyRequest}
                      disabled={emailRequestStatus === "sending"}
                    >
                      Отправить запрос повторно
                    </Button>
                  ) : null}
                  {emailRequestStatus === "sent" ? (
                    <span className="cabinet-hint">Письмо отправлено.</span>
                  ) : null}
                  {emailRequestStatus === "error" ? (
                    <span className="cabinet-hint cabinet-hint-error">Ошибка отправки.</span>
                  ) : null}
                </div>
              </div>
              <TextInput
                label="Фамилия"
                name="surname"
                value={profileForm.surname}
                onChange={(event) => handleProfileChange("surname", event.target.value)}
                error={profileErrors.surname}
              />
              <TextInput
                label="Имя"
                name="name"
                value={profileForm.name}
                onChange={(event) => handleProfileChange("name", event.target.value)}
                error={profileErrors.name}
              />
              <TextInput
                label="Отчество"
                name="fatherName"
                value={profileForm.fatherName}
                onChange={(event) => handleProfileChange("fatherName", event.target.value)}
                error={profileErrors.fatherName}
              />
              <TextInput
                label="Город"
                name="city"
                value={profileForm.city}
                onChange={(event) => handleProfileChange("city", event.target.value)}
                error={profileErrors.city}
              />
              <TextInput
                label="Школа"
                name="school"
                value={profileForm.school}
                onChange={(event) => handleProfileChange("school", event.target.value)}
                error={profileErrors.school}
              />
              {user.role === "student" ? (
                <label className="field">
                  <span className="field-label">Класс</span>
                  <select
                    className={`field-input ${profileErrors.classGrade ? "field-input-error" : ""}`.trim()}
                    value={profileForm.classGrade}
                    onChange={(event) => handleProfileChange("classGrade", event.target.value)}
                  >
                    <option value="">Выберите класс</option>
                    {Array.from({ length: 12 }, (_, index) => String(index)).map((grade) => (
                      <option key={grade} value={grade}>
                        {grade}
                      </option>
                    ))}
                  </select>
                  {profileErrors.classGrade ? (
                    <span className="field-helper field-helper-error">{profileErrors.classGrade}</span>
                  ) : null}
                </label>
              ) : null}
              {user.role === "teacher" ? (
                <TextInput
                  label="Предмет"
                  name="subject"
                  value={profileForm.subject}
                  onChange={(event) => handleProfileChange("subject", event.target.value)}
                  error={profileErrors.subject}
                />
              ) : null}

              {profileMessage ? <div className="cabinet-alert">{profileMessage}</div> : null}
              <Button type="submit" className="cabinet-save-button" isLoading={profileStatus === "saving"}>
                Сохранить
              </Button>
            </form>
          </section>

          <section className="cabinet-section" id="links">
            <div className="cabinet-section-heading">
              <h2>Связь учитель — ученик</h2>
            </div>
            {user.role === "student" ? (
              <div className="cabinet-grid">
                <div className="cabinet-card">
                  <h3>Добавить учителя вручную</h3>
                  <TextInput
                    label="ФИО учителя"
                    name="teacherName"
                    value={teacherName}
                    onChange={(event) => setTeacherName(event.target.value)}
                  />
                  <TextInput
                    label="Предмет"
                    name="teacherSubject"
                    value={teacherSubject}
                    onChange={(event) => setTeacherSubject(event.target.value)}
                  />
                  <Button type="button" className="cabinet-save-button" onClick={addTeacher}>
                    Добавить
                  </Button>
                </div>
                <div className="cabinet-card">
                  <h3>Запросить связь с учителем</h3>
                  <TextInput
                    label="Логин или email учителя"
                    name="teacherLink"
                    value={linkRequestValue}
                    onChange={(event) => setLinkRequestValue(event.target.value)}
                  />
                  <Button type="button" className="cabinet-save-button" onClick={sendLinkRequest}>
                    Отправить запрос
                  </Button>
                  {linkStatusMessage ? <p className="cabinet-hint">{linkStatusMessage}</p> : null}
                </div>
                <div className="cabinet-card">
                  <h3>Мои учителя</h3>
                  {teacherList.length === 0 ? (
                    <p className="cabinet-hint">Список пуст.</p>
                  ) : (
                    <ul className="cabinet-list">
                      {teacherList.map((teacher) => (
                        <li key={teacher.id}>
                          {teacher.fullName} · {teacher.subject}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : (
              <div className="cabinet-grid">
                <div className="cabinet-card">
                  <h3>Добавить ученика</h3>
                  <TextInput
                    label="Логин или email ученика"
                    name="studentLink"
                    value={linkRequestValue}
                    onChange={(event) => setLinkRequestValue(event.target.value)}
                  />
                  <Button type="button" className="cabinet-save-button" onClick={sendLinkRequest}>
                    Отправить запрос
                  </Button>
                  {linkStatusMessage ? <p className="cabinet-hint">{linkStatusMessage}</p> : null}
                </div>
                <div className="cabinet-card">
                  <h3>Привязанные ученики</h3>
                  {students.length === 0 ? (
                    <p className="cabinet-hint">Нет подтвержденных учеников.</p>
                  ) : (
                    <ul className="cabinet-list">
                      {students.map((student) => (
                        <li key={student.id}>
                          <Link to={`/cabinet?student=${student.student_id}`} className="cabinet-link">
                            Ученик #{student.student_id}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </section>
        </main>
      </LayoutShell>

      <Modal
        isOpen={isEmailWarningOpen}
        onClose={() => setIsEmailWarningOpen(false)}
        title="Подтвердите email"
      >
        <p>
          Необходимо подтвердить email. На ваш электронный почтовый ящик {profileForm.email} выслано письмо с
          ссылкой подтверждением. Пользователи с неподтвержденным email не могут участвовать в олимпиаде.
        </p>
      </Modal>

      <Modal
        isOpen={attemptViewStatus === "loading" || Boolean(attemptView) || Boolean(attemptViewError)}
        onClose={() => {
          setAttemptViewStatus("idle");
          setAttemptViewError(null);
          setAttemptView(null);
        }}
        title={attemptView ? `Попытка №${attemptView.attempt.id}` : "Просмотр попытки"}
      >
        {attemptViewStatus === "loading" ? <p>Загрузка...</p> : null}
        {attemptViewError ? <p className="cabinet-alert">{attemptViewError}</p> : null}
        {attemptView ? (
          <div className="cabinet-attempt">
            <p className="cabinet-hint">{attemptView.olympiad_title}</p>
            <ul className="cabinet-list">
              {attemptView.tasks.map((task) => (
                <li key={task.task_id}>
                  <strong>{task.title}</strong>
                  <div className="cabinet-answer">{formatAnswer(task.current_answer ?? task.answer_payload)}</div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
