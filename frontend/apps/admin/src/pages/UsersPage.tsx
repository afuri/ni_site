import React, { useEffect, useState } from "react";
import { Button, Table, TextInput } from "@ui";
import type { ApiError, UserRead } from "@api";
import { adminApiClient } from "../lib/adminClient";
import { formatDate } from "../lib/formatters";
import { AccountDeletionPanel } from "../components/AccountDeletionPanel";

type UserUpdateForm = {
  userId: string;
  login: string;
  role: string;
  isActive: string;
  isEmailVerified: string;
  mustChangePassword: string;
  isModerator: string;
  moderatorRequested: string;
  surname: string;
  name: string;
  fatherName: string;
  regionId: string;
  schoolId: string;
  schoolNotFound: string;
  classGrade: string;
  subject: string;
  gender: string;
  subscription: string;
  adminOtp: string;
};

const emptyForm: UserUpdateForm = {
  userId: "",
  login: "",
  role: "",
  isActive: "",
  isEmailVerified: "",
  mustChangePassword: "",
  isModerator: "",
  moderatorRequested: "",
  surname: "",
  name: "",
  fatherName: "",
  regionId: "",
  schoolId: "",
  schoolNotFound: "",
  classGrade: "",
  subject: "",
  gender: "",
  subscription: "",
  adminOtp: ""
};

const parseBoolean = (value: string) => {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return undefined;
};

const escapeCsvValue = (value: string) => {
  if (value.includes("\"")) {
    value = value.replace(/"/g, "\"\"");
  }
  if (/[",\n]/.test(value)) {
    return `"${value}"`;
  }
  return value;
};

const buildUsersCsv = (users: UserRead[]) => {
  const headers = [
    "ID",
    "Логин",
    "Email",
    "Роль",
    "Активен",
    "Email подтвержден",
    "Требует смены пароля",
    "Модератор",
    "Запрос модератора",
    "Дата регистрации",
    "Фамилия",
    "Имя",
    "Отчество",
    "ID региона",
    "Регион",
    "ID школы",
    "Город",
    "Школа",
    "Статус школы",
    "Монеты",
    "Класс",
    "Пол",
    "Подписка",
    "Предмет"
  ];

  const rows = users.map((user) => [
    String(user.id),
    user.login,
    user.email,
    user.role,
    user.is_active ? "Да" : "Нет",
    user.is_email_verified ? "Да" : "Нет",
    user.must_change_password ? "Да" : "Нет",
    user.is_moderator ? "Да" : "Нет",
    user.moderator_requested ? "Да" : "Нет",
    formatDate(user.created_at),
    user.surname,
    user.name,
    user.father_name ?? "",
    user.region_id ?? "",
    user.region_name ?? "",
    user.school_id ?? "",
    user.city_name ?? "",
    user.school_short_name ?? "",
    user.school_status,
    user.coins,
    user.class_grade !== null && user.class_grade !== undefined ? String(user.class_grade) : "",
    user.gender ?? "",
    user.subscription ?? 0,
    user.subject ?? ""
  ]);

  const csvRows = [headers, ...rows].map((row) => row.map((value) => escapeCsvValue(String(value))).join(","));
  return `\ufeff${csvRows.join("\r\n")}`;
};

export function UsersPage() {
  const pageSize = 200;
  const [form, setForm] = useState<UserUpdateForm>(emptyForm);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [otpStatus, setOtpStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [listStatus, setListStatus] = useState<"idle" | "loading" | "error">("idle");
  const [listError, setListError] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<"idle" | "loading" | "error">("idle");
  const [exportError, setExportError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState("");
  const [tempUserId, setTempUserId] = useState("");
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [tempResult, setTempResult] = useState<string | null>(null);
  const [tempStatus, setTempStatus] = useState<"idle" | "saving" | "error">("idle");
  const [verifyingId, setVerifyingId] = useState<number | null>(null);
  const [verificationMessage, setVerificationMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [usersList, setUsersList] = useState<UserRead[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [filters, setFilters] = useState({
    userId: "",
    role: "",
    isActive: "",
    isEmailVerified: "",
    mustChangePassword: "",
    isModerator: "",
    moderatorRequested: "",
    login: "",
    email: "",
    surname: "",
    name: "",
    fatherName: "",
    regionId: "",
    schoolId: "",
    schoolStatus: "",
    classGrade: "",
    subject: "",
    gender: "",
    subscription: ""
  });

  const buildFilterParams = () => {
    const params = new URLSearchParams();
    if (filters.userId) params.set("user_id", filters.userId);
    if (filters.role) params.set("role", filters.role);
    if (filters.isActive) params.set("is_active", filters.isActive);
    if (filters.isEmailVerified) params.set("is_email_verified", filters.isEmailVerified);
    if (filters.mustChangePassword) params.set("must_change_password", filters.mustChangePassword);
    if (filters.isModerator) params.set("is_moderator", filters.isModerator);
    if (filters.moderatorRequested) params.set("moderator_requested", filters.moderatorRequested);
    if (filters.login) params.set("login", filters.login);
    if (filters.email) params.set("email", filters.email);
    if (filters.surname) params.set("surname", filters.surname);
    if (filters.name) params.set("name", filters.name);
    if (filters.fatherName) params.set("father_name", filters.fatherName);
    if (filters.regionId) params.set("region_id", filters.regionId);
    if (filters.schoolId) params.set("school_id", filters.schoolId);
    if (filters.schoolStatus) params.set("school_status", filters.schoolStatus);
    if (filters.classGrade) params.set("class_grade", filters.classGrade);
    if (filters.gender) params.set("gender", filters.gender);
    if (filters.subscription) params.set("subscription", filters.subscription);
    if (filters.subject) params.set("subject", filters.subject);
    return params;
  };

  const fetchUsersCount = async () => {
    const params = buildFilterParams();
    return await adminApiClient.request<number>({
      path: `/admin/users/count?${params.toString()}`,
      method: "GET"
    });
  };

  const fetchUsersPage = async (limit: number, offset: number) => {
    const params = buildFilterParams();
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    return await adminApiClient.request<UserRead[]>({
      path: `/admin/users?${params.toString()}`,
      method: "GET"
    });
  };

  const handleOtpRequest = async () => {
    setOtpStatus("sending");
    setMessage(null);
    try {
      const response = await adminApiClient.request<{ sent: boolean; otp?: string }>({
        path: "/admin/users/otp",
        method: "POST"
      });
      if (response?.otp) {
        setForm((prev) => ({ ...prev, adminOtp: response.otp ?? "" }));
      }
      setOtpStatus("sent");
      setMessage("OTP отправлен.");
    } catch {
      setOtpStatus("error");
      setMessage("Не удалось получить OTP.");
    }
  };

  const loadUsers = async (pageToLoad = page) => {
    setListStatus("loading");
    setListError(null);
    try {
      const offset = (pageToLoad - 1) * pageSize;
      const [data, total] = await Promise.all([
        fetchUsersPage(pageSize, offset),
        fetchUsersCount()
      ]);
      setUsersList(data ?? []);
      setTotalUsers(total ?? 0);
      setListStatus("idle");
    } catch {
      setListStatus("error");
      setListError("Не удалось загрузить пользователей.");
    }
  };

  const handleDownloadCsv = async () => {
    setExportStatus("loading");
    setExportError(null);
    try {
      const total = await fetchUsersCount();
      const allUsers: UserRead[] = [];
      for (let offset = 0; offset < total; offset += pageSize) {
        const data = await fetchUsersPage(pageSize, offset);
        if (data?.length) {
          allUsers.push(...data);
        }
        if (!data || data.length < pageSize) {
          break;
        }
      }
      const csv = buildUsersCsv(allUsers);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "users_full.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setExportStatus("idle");
    } catch {
      setExportStatus("error");
      setExportError("Не удалось выгрузить пользователей.");
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  useEffect(() => {
    setPageInput(String(page));
  }, [page]);

  const handleApplyFilters = () => {
    setPage(1);
    void loadUsers(1);
  };

  const totalPages = Math.max(1, Math.ceil(totalUsers / pageSize));

  const clampPage = (value: number) => Math.min(totalPages, Math.max(1, value));

  const handleFirstPage = () => {
    if (page === 1) {
      return;
    }
    setPage(1);
    void loadUsers(1);
  };

  const handleLastPage = () => {
    if (page >= totalPages) {
      return;
    }
    setPage(totalPages);
    void loadUsers(totalPages);
  };

  const handlePrevPage = () => {
    if (page <= 1) {
      return;
    }
    const nextPage = page - 1;
    setPage(nextPage);
    void loadUsers(nextPage);
  };

  const handleNextPage = () => {
    if (page >= totalPages) {
      return;
    }
    const nextPage = page + 1;
    setPage(nextPage);
    void loadUsers(nextPage);
  };

  const handlePageJump = () => {
    const numeric = Number(pageInput);
    if (Number.isNaN(numeric)) {
      setPageInput(String(page));
      return;
    }
    const nextPage = clampPage(Math.trunc(numeric));
    setPageInput(String(nextPage));
    if (nextPage !== page) {
      setPage(nextPage);
      void loadUsers(nextPage);
    }
  };

  const handleUpdate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.userId) {
      setMessage("Укажите ID пользователя.");
      setStatus("error");
      return;
    }
    setStatus("saving");
    setMessage(null);
    const payload: Record<string, unknown> = {};
    if (form.login) payload.login = form.login;
    if (form.role) payload.role = form.role;
    const isActive = parseBoolean(form.isActive);
    if (isActive !== undefined) payload.is_active = isActive;
    const isEmailVerified = parseBoolean(form.isEmailVerified);
    if (isEmailVerified !== undefined) payload.is_email_verified = isEmailVerified;
    const mustChangePassword = parseBoolean(form.mustChangePassword);
    if (mustChangePassword !== undefined) payload.must_change_password = mustChangePassword;
    const isModerator = parseBoolean(form.isModerator);
    if (isModerator !== undefined) payload.is_moderator = isModerator;
    const moderatorRequested = parseBoolean(form.moderatorRequested);
    if (moderatorRequested !== undefined) payload.moderator_requested = moderatorRequested;
    if (form.surname) payload.surname = form.surname;
    if (form.name) payload.name = form.name;
    if (form.fatherName) payload.father_name = form.fatherName;
    if (form.regionId) payload.region_id = Number(form.regionId);
    if (form.schoolId) payload.school_id = Number(form.schoolId);
    const schoolNotFound = parseBoolean(form.schoolNotFound);
    if (schoolNotFound !== undefined) payload.school_not_found = schoolNotFound;
    if (form.classGrade && form.role !== "teacher" && form.role !== "admin") payload.class_grade = Number(form.classGrade);
    if (form.gender) payload.gender = form.gender;
    if (form.subscription) {
      const parsedSub = Number(form.subscription);
      if (!Number.isNaN(parsedSub)) {
        payload.subscription = Math.min(5, Math.max(0, parsedSub));
      }
    }
    if (form.subject && form.role !== "student" && form.role !== "admin") payload.subject = form.subject.trim();
    if (form.adminOtp) payload.admin_otp = form.adminOtp;

    try {
      const updated = await adminApiClient.request<UserRead>({
        path: `/admin/users/${form.userId}`,
        method: "PUT",
        body: payload
      });
      setUsersList((prev) => prev.map((item) => item.id === updated.id ? updated : item));
      void loadUsers(page);
      setStatus("idle");
      setMessage("Пользователь обновлен.");
    } catch (error) {
      setStatus("error");
      const messages: Record<string, string> = {
        role_transition_not_allowed: "Дошкольник может перейти только в ученика: укажите класс 1–11 и школу.",
        class_grade_required: "Укажите класс ученика от 0 до 11. При переходе из учителя — от 1 до 11.",
        subject_required: "Укажите предмет учителя.",
        school_selection_required: "Для перехода укажите ID существующей школы и её регион. Вариант «Школа отсутствует» недоступен.",
        school_region_mismatch: "Школа не относится к указанному региону.",
        school_not_found: "Школа с таким ID не найдена.",
        region_not_found: "Укажите существующий регион.",
        school_inactive: "Выбранная школа или её город неактивны.",
        region_inactive: "Выбранный регион неактивен.",
        validation_error: "Проверьте поля. Предмет при смене роли должен быть указан кириллицей с заглавной буквы.",
        subject_not_allowed_for_student: "Поле «Предмет» не заполняется для ученика.",
        class_grade_not_allowed_for_teacher: "Поле «Класс» не заполняется для учителя."
      };
      setMessage(messages[(error as ApiError)?.code ?? ""] ?? "Не удалось обновить пользователя.");
    }
  };

  const handleGenerateTemp = async () => {
    if (tempStatus === "saving") return;
    const userId = Number(tempUserId);
    if (!/^[1-9]\d*$/.test(tempUserId) || !Number.isSafeInteger(userId)) {
      setTempResult("Укажите положительный целочисленный ID пользователя для генерации пароля.");
      setTempStatus("error");
      return;
    }
    setTempStatus("saving");
    setTempResult(null);
    setGeneratedPassword(null);
    try {
      const response = await adminApiClient.request<{ temp_password: string }>({
        path: `/admin/users/${userId}/temp-password/generate`,
        method: "POST"
      });
      setGeneratedPassword(response.temp_password);
      setTempResult(`Временный пароль сгенерирован и установлен пользователю #${userId}. При следующем входе потребуется сменить пароль.`);
      setTempStatus("idle");
      void loadUsers(page);
    } catch (error) {
      setTempStatus("error");
      setTempResult((error as ApiError)?.code === "user_not_found" ? "Пользователь с таким ID не найден." : "Не удалось сгенерировать и установить пароль.");
    }
  };

  const handleSetTemp = async () => {
    if (tempStatus === "saving") return;
    const userId = Number(tempUserId);
    if (!/^[1-9]\d*$/.test(tempUserId) || !Number.isSafeInteger(userId) || !tempPassword) {
      setTempResult("Укажите положительный целочисленный ID пользователя и временный пароль.");
      setTempStatus("error");
      return;
    }
    setTempStatus("saving");
    setTempResult(null);
    setGeneratedPassword(null);
    try {
      await adminApiClient.request({
        path: `/admin/users/${userId}/temp-password`,
        method: "POST",
        body: { temp_password: tempPassword }
      });
      setTempStatus("idle");
      setTempPassword("");
      setTempResult(`Временный пароль установлен пользователю #${userId}. При следующем входе потребуется сменить пароль.`);
      void loadUsers(page);
    } catch (error) {
      setTempStatus("error");
      const messages: Record<string, string> = {
        user_not_found: "Пользователь с таким ID не найден.",
        weak_password: "Пароль должен содержать не менее 8 символов, заглавную и строчную латинские буквы и цифру."
      };
      setTempResult(messages[(error as ApiError)?.code ?? ""] ?? "Не удалось установить пароль.");
    }
  };

  const handleVerifyEmail = async (target: UserRead) => {
    if (target.is_email_verified || verifyingId !== null) return;
    setVerifyingId(target.id);
    setVerificationMessage(null);
    try {
      const updated = await adminApiClient.request<UserRead>({
        path: `/admin/users/${target.id}`, method: "PUT", body: { is_email_verified: true }
      });
      setUsersList((current) => current.map((item) => item.id === updated.id ? updated : item));
      setVerificationMessage({ error: false, text: `Email пользователя #${target.id} (${target.login}) подтверждён.` });
      await loadUsers(page);
    } catch {
      setVerificationMessage({ error: true, text: `Не удалось подтвердить email пользователя #${target.id}. Попробуйте ещё раз.` });
    } finally {
      setVerifyingId(null);
    }
  };

  return (
    <section className="admin-section admin-users-page">
      <div className="admin-users-wide">
        <div className="admin-toolbar">
          <div>
            <h1>Управление пользователями</h1>
            <p className="admin-hint">При смене роли укажите класс 1–11 для ученика или предмет для учителя. Нужна действующая школа: существующая сохраняется, если не указан другой ID. Дошкольник (класс 0) может перейти только в ученика с обязательным выбором школы. Несовместимые поля и связи с учителями/учениками будут очищены; результаты олимпиад сохранятся.</p>
          </div>
        </div>

        <form className="admin-form" onSubmit={handleUpdate}>
        <div className="admin-form-grid">
          <TextInput
            label="ID пользователя"
            name="userId"
            value={form.userId}
            onChange={(event) => setForm((prev) => ({ ...prev, userId: event.target.value }))}
          />
          <TextInput
            label="Логин"
            name="login"
            value={form.login}
            onChange={(event) => setForm((prev) => ({ ...prev, login: event.target.value }))}
          />
          <label className="field">
            <span className="field-label">Роль</span>
            <select
              className="field-input"
              value={form.role}
              onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value,
                classGrade: event.target.value === "teacher" || event.target.value === "admin" ? "" : prev.classGrade,
                subject: event.target.value === "student" || event.target.value === "admin" ? "" : prev.subject,
                isModerator: "", moderatorRequested: ""
              }))}
            >
              <option value="">Не менять</option>
              <option value="student">Ученик</option>
              <option value="teacher">Учитель</option>
              <option value="admin">Админ</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Активен</span>
            <select
              className="field-input"
              value={form.isActive}
              onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.value }))}
            >
              <option value="">Не менять</option>
              <option value="true">Да</option>
              <option value="false">Нет</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Email подтвержден</span>
            <select
              className="field-input"
              value={form.isEmailVerified}
              onChange={(event) => setForm((prev) => ({ ...prev, isEmailVerified: event.target.value }))}
            >
              <option value="">Не менять</option>
              <option value="true">Да</option>
              <option value="false">Нет</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Модератор</span>
            <select
              className="field-input"
              value={form.isModerator}
              onChange={(event) => setForm((prev) => ({ ...prev, isModerator: event.target.value }))}
            >
              <option value="">Не менять</option>
              <option value="true">Да</option>
              <option value="false">Нет</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Запрошен модератор</span>
            <select
              className="field-input"
              value={form.moderatorRequested}
              onChange={(event) => setForm((prev) => ({ ...prev, moderatorRequested: event.target.value }))}
            >
              <option value="">Не менять</option>
              <option value="true">Да</option>
              <option value="false">Нет</option>
            </select>
          </label>
        </div>

        <div className="admin-form-grid">
          <TextInput
            label="Фамилия"
            name="surname"
            value={form.surname}
            onChange={(event) => setForm((prev) => ({ ...prev, surname: event.target.value }))}
          />
          <TextInput
            label="Имя"
            name="name"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          />
          <TextInput
            label="Отчество"
            name="fatherName"
            value={form.fatherName}
            onChange={(event) => setForm((prev) => ({ ...prev, fatherName: event.target.value }))}
          />
          <TextInput
            label="ID региона"
            name="regionId"
            type="number"
            min={1}
            value={form.regionId}
            onChange={(event) => setForm((prev) => ({ ...prev, regionId: event.target.value }))}
          />
          <TextInput
            label="ID школы"
            name="schoolId"
            type="number"
            min={1}
            value={form.schoolId}
            onChange={(event) => setForm((prev) => ({ ...prev, schoolId: event.target.value }))}
          />
          <label className="field">
            <span className="field-label">Школа отсутствует</span>
            <select className="field-input" value={form.schoolNotFound} onChange={(event) => setForm((prev) => ({ ...prev, schoolNotFound: event.target.value }))}>
              <option value="">Не менять</option><option value="true">Да</option><option value="false">Нет</option>
            </select>
          </label>
          {form.role !== "teacher" && form.role !== "admin" ? <TextInput
            label="Класс"
            name="classGrade"
            type="number"
            min={0}
            max={11}
            required={form.role === "student"}
            value={form.classGrade}
            onChange={(event) => setForm((prev) => ({ ...prev, classGrade: event.target.value }))}
          /> : null}
          <label className="field">
            <span className="field-label">Пол</span>
            <select
              className="field-input"
              value={form.gender}
              onChange={(event) => setForm((prev) => ({ ...prev, gender: event.target.value }))}
            >
              <option value="">Не менять</option>
              <option value="male">Муж</option>
              <option value="female">Жен</option>
            </select>
          </label>
          <TextInput
            label="Подписка (0-5)"
            name="subscription"
            type="number"
            min={0}
            max={5}
            value={form.subscription}
            onChange={(event) => setForm((prev) => ({ ...prev, subscription: event.target.value }))}
          />
          {form.role !== "student" && form.role !== "admin" ? <TextInput
            label="Предмет"
            name="subject"
            required={form.role === "teacher"}
            value={form.subject}
            onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value }))}
          /> : null}
          <TextInput
            label="OTP"
            name="adminOtp"
            value={form.adminOtp}
            onChange={(event) => setForm((prev) => ({ ...prev, adminOtp: event.target.value }))}
          />
        </div>
        <div className="admin-toolbar-actions">
          <Button type="button" variant="outline" onClick={handleOtpRequest} disabled={otpStatus === "sending"}>
            Запросить OTP
          </Button>
          <Button type="submit" isLoading={status === "saving"}>
            Сохранить изменения
          </Button>
        </div>
        {message ? <p className={status === "error" ? "admin-error" : "admin-hint"}>{message}</p> : null}
        </form>

        <div className="admin-section">
            <h2>Список пользователей</h2>
            <p className="admin-hint">Фильтруйте список по роли, статусам и логину.</p>
            <div className="admin-report-filters">
          <TextInput
            label="ID"
            name="userIdFilter"
            value={filters.userId}
            onChange={(event) => setFilters((prev) => ({ ...prev, userId: event.target.value }))}
          />
          <label className="field">
            <span className="field-label">Роль</span>
            <select
              className="field-input"
              value={filters.role}
              onChange={(event) => setFilters((prev) => ({ ...prev, role: event.target.value }))}
            >
              <option value="">Все</option>
              <option value="student">Ученик</option>
              <option value="teacher">Учитель</option>
              <option value="admin">Админ</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Активен</span>
            <select
              className="field-input"
              value={filters.isActive}
              onChange={(event) => setFilters((prev) => ({ ...prev, isActive: event.target.value }))}
            >
              <option value="">Все</option>
              <option value="true">Да</option>
              <option value="false">Нет</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Email подтвержден</span>
            <select
              className="field-input"
              value={filters.isEmailVerified}
              onChange={(event) => setFilters((prev) => ({ ...prev, isEmailVerified: event.target.value }))}
            >
              <option value="">Все</option>
              <option value="true">Да</option>
              <option value="false">Нет</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Пароль сменить</span>
            <select
              className="field-input"
              value={filters.mustChangePassword}
              onChange={(event) => setFilters((prev) => ({ ...prev, mustChangePassword: event.target.value }))}
            >
              <option value="">Все</option>
              <option value="true">Да</option>
              <option value="false">Нет</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Модератор</span>
            <select
              className="field-input"
              value={filters.isModerator}
              onChange={(event) => setFilters((prev) => ({ ...prev, isModerator: event.target.value }))}
            >
              <option value="">Все</option>
              <option value="true">Да</option>
              <option value="false">Нет</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Запрошен модератор</span>
            <select
              className="field-input"
              value={filters.moderatorRequested}
              onChange={(event) => setFilters((prev) => ({ ...prev, moderatorRequested: event.target.value }))}
            >
              <option value="">Все</option>
              <option value="true">Да</option>
              <option value="false">Нет</option>
            </select>
          </label>
          <TextInput
            label="Логин"
            name="loginFilter"
            value={filters.login}
            onChange={(event) => setFilters((prev) => ({ ...prev, login: event.target.value }))}
          />
          <TextInput
            label="Email"
            name="emailFilter"
            value={filters.email}
            onChange={(event) => setFilters((prev) => ({ ...prev, email: event.target.value }))}
          />
          <TextInput
            label="Фамилия"
            name="surnameFilter"
            value={filters.surname}
            onChange={(event) => setFilters((prev) => ({ ...prev, surname: event.target.value }))}
          />
          <TextInput
            label="Имя"
            name="nameFilter"
            value={filters.name}
            onChange={(event) => setFilters((prev) => ({ ...prev, name: event.target.value }))}
          />
          <TextInput
            label="Отчество"
            name="fatherNameFilter"
            value={filters.fatherName}
            onChange={(event) => setFilters((prev) => ({ ...prev, fatherName: event.target.value }))}
          />
          <TextInput
            label="ID региона"
            name="regionIdFilter"
            type="number"
            min={1}
            value={filters.regionId}
            onChange={(event) => setFilters((prev) => ({ ...prev, regionId: event.target.value }))}
          />
          <TextInput
            label="ID школы"
            name="schoolIdFilter"
            type="number"
            min={1}
            value={filters.schoolId}
            onChange={(event) => setFilters((prev) => ({ ...prev, schoolId: event.target.value }))}
          />
          <label className="field"><span className="field-label">Статус школы</span><select className="field-input" value={filters.schoolStatus} onChange={(event) => setFilters((prev) => ({ ...prev, schoolStatus: event.target.value }))}><option value="">Все</option><option value="selected">Выбрана</option><option value="missing">Не указана</option><option value="submission_pending">Заявка рассматривается</option><option value="submission_rejected">Заявка отклонена</option><option value="not_required">Не требуется</option></select></label>
          <TextInput
            label="Класс"
            name="classGradeFilter"
            value={filters.classGrade}
            onChange={(event) => setFilters((prev) => ({ ...prev, classGrade: event.target.value }))}
          />
          <label className="field">
            <span className="field-label">Пол</span>
            <select
              className="field-input"
              value={filters.gender}
              onChange={(event) => setFilters((prev) => ({ ...prev, gender: event.target.value }))}
            >
              <option value="">Все</option>
              <option value="male">Муж</option>
              <option value="female">Жен</option>
            </select>
          </label>
          <TextInput
            label="Подписка"
            name="subscriptionFilter"
            type="number"
            min={0}
            max={5}
            value={filters.subscription}
            onChange={(event) => setFilters((prev) => ({ ...prev, subscription: event.target.value }))}
          />
          <TextInput
            label="Предмет"
            name="subjectFilter"
            value={filters.subject}
            onChange={(event) => setFilters((prev) => ({ ...prev, subject: event.target.value }))}
          />
            </div>
            <div className="admin-toolbar-actions">
              <Button type="button" variant="outline" onClick={handleApplyFilters}>
                Применить фильтры
              </Button>
              <Button type="button" variant="outline" onClick={handleDownloadCsv} disabled={exportStatus === "loading"}>
                Скачать CSV
              </Button>
            </div>
            {exportStatus === "error" && exportError ? <div className="admin-alert">{exportError}</div> : null}
            <div className="admin-toolbar-actions admin-table-pagination">
              <span className="admin-hint">
                Показано {usersList.length} из {totalUsers}.
              </span>
              <span className="admin-hint">Страница {page} из {totalPages}.</span>
              <div className="admin-page-jump">
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={pageInput}
                  onChange={(event) => setPageInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handlePageJump();
                    }
                  }}
                  className="admin-page-input"
                  aria-label="Номер страницы"
                />
                <Button type="button" variant="outline" onClick={handlePageJump}>
                  Перейти
                </Button>
              </div>
              <Button type="button" variant="outline" onClick={handleFirstPage} disabled={page <= 1}>
                В начало
              </Button>
              <Button type="button" variant="outline" onClick={handlePrevPage} disabled={page <= 1}>
                Назад
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleNextPage}
                disabled={page >= totalPages}
              >
                Вперед
              </Button>
              <Button type="button" variant="outline" onClick={handleLastPage} disabled={page >= totalPages}>
                В конец
              </Button>
            </div>
            {listStatus === "error" && listError ? <div className="admin-alert">{listError}</div> : null}
            {verificationMessage ? <p role={verificationMessage.error ? "alert" : "status"} className={verificationMessage.error ? "admin-error" : "admin-hint"}>{verificationMessage.text}</p> : null}
            <div className="admin-table-scroll admin-table-wide admin-directory-table" role="region" aria-label="Таблица пользователей">
              <Table>
                <thead>
                  <tr>
                    <th className="admin-action-column">Email</th>
                    <th>ID</th>
                    <th>Логин</th>
                    <th>Email</th>
                    <th>Роль</th>
                    <th>Активен</th>
                    <th>Email OK</th>
                    <th>Смена пароля</th>
                    <th>Модератор</th>
                    <th>Запрос модератора</th>
                    <th>Регистрация</th>
                    <th>Фамилия</th>
                    <th>Имя</th>
                    <th>Отчество</th>
                    <th>ID региона</th>
                    <th>Регион</th>
                    <th>ID школы</th>
                    <th>Город</th>
                    <th>Школа</th>
                    <th>Статус школы</th>
                    <th>Монеты</th>
                    <th>Класс</th>
                    <th>Пол</th>
                    <th>Подписка</th>
                    <th>Предмет</th>
                  </tr>
                </thead>
                <tbody>
                  {listStatus === "loading" ? (
                    <tr>
                      <td colSpan={25}>Загрузка...</td>
                    </tr>
                  ) : usersList.length === 0 ? (
                    <tr>
                      <td colSpan={25}>Пользователи не найдены.</td>
                    </tr>
                  ) : (
                    usersList.map((item) => (
                      <tr key={item.id}>
                        <td className="admin-action-column">
                          <Button type="button" size="sm" variant="outline"
                            aria-label={`Ver.email: ${item.login} (#${item.id})`}
                            title={item.is_email_verified ? "Email уже подтверждён" : "Подтвердить email вручную"}
                            disabled={item.is_email_verified || verifyingId !== null}
                            isLoading={verifyingId === item.id}
                            onClick={() => void handleVerifyEmail(item)}>Ver.email</Button>
                        </td>
                        <td>{item.id}</td>
                        <td>{item.login}</td>
                        <td>{item.email}</td>
                        <td>{item.role}</td>
                        <td>{item.is_active ? "Да" : "Нет"}</td>
                        <td>{item.is_email_verified ? "Да" : "Нет"}</td>
                        <td>{item.must_change_password ? "Да" : "Нет"}</td>
                        <td>{item.is_moderator ? "Да" : "Нет"}</td>
                        <td>{item.moderator_requested ? "Да" : "Нет"}</td>
                        <td>{formatDate(item.created_at)}</td>
                        <td>{item.surname}</td>
                        <td>{item.name}</td>
                        <td>{item.father_name ?? "—"}</td>
                        <td>{item.region_id ?? "—"}</td>
                        <td>{item.region_name ?? "—"}</td>
                        <td>{item.school_id ?? "—"}</td>
                        <td>{item.city_name ?? "—"}</td>
                        <td>{item.school_short_name ?? "—"}</td>
                        <td>{item.school_status}</td>
                        <td>{item.coins}</td>
                        <td>{item.class_grade ?? "—"}</td>
                        <td>{item.gender ?? "—"}</td>
                        <td>{item.subscription}</td>
                        <td>{item.subject ?? "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </div>
        </div>

        <section className="admin-section admin-temp-password" aria-label="Временный пароль">
            <h2>Временный пароль</h2>
            <p className="admin-hint">Укажите ID в этом блоке. Генерация сразу устанавливает новый временный пароль и требует его смены при входе. Старый пароль перестанет работать.</p>
            <div className="admin-form-grid">
              <TextInput label="ID пользователя для временного пароля" name="tempUserId" inputMode="numeric"
                value={tempUserId} disabled={tempStatus === "saving"}
                onChange={(event) => { setTempUserId(event.target.value.trim()); setGeneratedPassword(null); setTempResult(null); setTempPassword(""); setTempStatus("idle"); }} />
              <TextInput
                label="Новый временный пароль"
                name="tempPassword"
                type="password"
                autoComplete="new-password"
                disabled={tempStatus === "saving"}
                value={tempPassword}
                onChange={(event) => setTempPassword(event.target.value)}
              />
            </div>
            <div className="admin-toolbar-actions">
              <Button
                type="button"
                variant="outline"
                onClick={handleGenerateTemp}
                disabled={tempStatus === "saving"}
              >
                Сгенерировать и установить
              </Button>
              <Button type="button" onClick={handleSetTemp} disabled={tempStatus === "saving"}>
                Установить
              </Button>
            </div>
            {generatedPassword ? <TextInput label="Сгенерированный временный пароль" name="generatedTempPassword" value={generatedPassword} readOnly autoComplete="off" /> : null}
            {tempResult ? (
              <p role={tempStatus === "error" ? "alert" : "status"} className={tempStatus === "error" ? "admin-error" : "admin-hint"}>{tempResult}</p>
            ) : null}
        </section>
      </div>
      <AccountDeletionPanel onDeleted={(id) => {
        setUsersList((current) => current.filter((item) => item.id !== id));
        void loadUsers(page);
      }} />
    </section>
  );
}
