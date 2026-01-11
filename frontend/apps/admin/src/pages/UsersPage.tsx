import React, { useState } from "react";
import { Button, Table, TextInput } from "@ui";
import type { UserRead } from "@api";
import { adminApiClient } from "../lib/adminClient";

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
  country: string;
  city: string;
  school: string;
  classGrade: string;
  subject: string;
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
  country: "",
  city: "",
  school: "",
  classGrade: "",
  subject: "",
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

export function UsersPage() {
  const [form, setForm] = useState<UserUpdateForm>(emptyForm);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [otpStatus, setOtpStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [listStatus, setListStatus] = useState<"idle" | "loading" | "error">("idle");
  const [listError, setListError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState("");
  const [tempResult, setTempResult] = useState<string | null>(null);
  const [tempStatus, setTempStatus] = useState<"idle" | "saving" | "error">("idle");
  const [managedUsers, setManagedUsers] = useState<UserRead[]>([]);
  const [usersList, setUsersList] = useState<UserRead[]>([]);
  const [filters, setFilters] = useState({
    role: "",
    isActive: "",
    isEmailVerified: "",
    isModerator: "",
    login: "",
    email: ""
  });

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

  const loadUsers = async () => {
    setListStatus("loading");
    setListError(null);
    const params = new URLSearchParams();
    if (filters.role) params.set("role", filters.role);
    if (filters.isActive) params.set("is_active", filters.isActive);
    if (filters.isEmailVerified) params.set("is_email_verified", filters.isEmailVerified);
    if (filters.isModerator) params.set("is_moderator", filters.isModerator);
    if (filters.login) params.set("login", filters.login);
    if (filters.email) params.set("email", filters.email);
    try {
      const data = await adminApiClient.request<UserRead[]>({
        path: `/admin/users?${params.toString()}`,
        method: "GET"
      });
      setUsersList(data ?? []);
      setListStatus("idle");
    } catch {
      setListStatus("error");
      setListError("Не удалось загрузить пользователей.");
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
    if (form.country) payload.country = form.country;
    if (form.city) payload.city = form.city;
    if (form.school) payload.school = form.school;
    if (form.classGrade) payload.class_grade = Number(form.classGrade);
    if (form.subject) payload.subject = form.subject;
    if (form.adminOtp) payload.admin_otp = form.adminOtp;

    try {
      const updated = await adminApiClient.request<UserRead>({
        path: `/admin/users/${form.userId}`,
        method: "PUT",
        body: payload
      });
      setManagedUsers((prev) => {
        const existing = prev.find((item) => item.id === updated.id);
        if (!existing) {
          return [updated, ...prev];
        }
        return prev.map((item) => (item.id === updated.id ? updated : item));
      });
      setStatus("idle");
      setMessage("Пользователь обновлен.");
    } catch {
      setStatus("error");
      setMessage("Не удалось обновить пользователя.");
    }
  };

  const handleGenerateTemp = async () => {
    if (!form.userId) {
      setMessage("Укажите ID пользователя для генерации пароля.");
      setTempStatus("error");
      return;
    }
    setTempStatus("saving");
    setTempResult(null);
    try {
      const response = await adminApiClient.request<{ temp_password: string }>({
        path: `/admin/users/${form.userId}/temp-password/generate`,
        method: "POST"
      });
      setTempResult(response.temp_password);
      setTempStatus("idle");
    } catch {
      setTempStatus("error");
      setTempResult("Не удалось сгенерировать пароль.");
    }
  };

  const handleSetTemp = async () => {
    if (!form.userId || !tempPassword) {
      setMessage("Укажите ID пользователя и временный пароль.");
      setTempStatus("error");
      return;
    }
    setTempStatus("saving");
    setTempResult(null);
    try {
      await adminApiClient.request({
        path: `/admin/users/${form.userId}/temp-password`,
        method: "POST",
        body: { temp_password: tempPassword }
      });
      setTempStatus("idle");
      setTempResult("Пароль установлен.");
    } catch {
      setTempStatus("error");
      setTempResult("Не удалось установить пароль.");
    }
  };

  return (
    <section className="admin-section">
      <div className="admin-toolbar">
        <div>
          <h1>Управление пользователями</h1>
          <p className="admin-hint">Редактируйте пользователей и управляйте доступом.</p>
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
              onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))}
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
            label="Страна"
            name="country"
            value={form.country}
            onChange={(event) => setForm((prev) => ({ ...prev, country: event.target.value }))}
          />
          <TextInput
            label="Город"
            name="city"
            value={form.city}
            onChange={(event) => setForm((prev) => ({ ...prev, city: event.target.value }))}
          />
          <TextInput
            label="Школа"
            name="school"
            value={form.school}
            onChange={(event) => setForm((prev) => ({ ...prev, school: event.target.value }))}
          />
          <TextInput
            label="Класс"
            name="classGrade"
            value={form.classGrade}
            onChange={(event) => setForm((prev) => ({ ...prev, classGrade: event.target.value }))}
          />
          <TextInput
            label="Предмет"
            name="subject"
            value={form.subject}
            onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value }))}
          />
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

      <div className="admin-section" style={{ marginTop: "24px" }}>
        <h2>Список пользователей</h2>
        <p className="admin-hint">Фильтруйте список по роли, статусам и логину.</p>
        <div className="admin-report-filters">
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
        </div>
        <div className="admin-toolbar-actions">
          <Button type="button" variant="outline" onClick={loadUsers}>
            Загрузить
          </Button>
        </div>
        {listStatus === "error" && listError ? <div className="admin-alert">{listError}</div> : null}
        <Table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Логин</th>
              <th>Роль</th>
              <th>Email</th>
              <th>Активен</th>
              <th>Email OK</th>
              <th>Модератор</th>
            </tr>
          </thead>
          <tbody>
            {listStatus === "loading" ? (
              <tr>
                <td colSpan={7}>Загрузка...</td>
              </tr>
            ) : usersList.length === 0 ? (
              <tr>
                <td colSpan={7}>Пользователи не найдены.</td>
              </tr>
            ) : (
              usersList.map((item) => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  <td>{item.login}</td>
                  <td>{item.role}</td>
                  <td>{item.email}</td>
                  <td>{item.is_active ? "Да" : "Нет"}</td>
                  <td>{item.is_email_verified ? "Да" : "Нет"}</td>
                  <td>{item.is_moderator ? "Да" : "Нет"}</td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </div>

      <div className="admin-section" style={{ marginTop: "24px" }}>
        <h2>Временный пароль</h2>
        <div className="admin-form-grid">
          <TextInput
            label="Новый временный пароль"
            name="tempPassword"
            value={tempPassword}
            onChange={(event) => setTempPassword(event.target.value)}
          />
        </div>
        <div className="admin-toolbar-actions">
          <Button type="button" variant="outline" onClick={handleGenerateTemp} disabled={tempStatus === "saving"}>
            Сгенерировать
          </Button>
          <Button type="button" onClick={handleSetTemp} disabled={tempStatus === "saving"}>
            Установить
          </Button>
        </div>
        {tempResult ? <p className={tempStatus === "error" ? "admin-error" : "admin-hint"}>{tempResult}</p> : null}
      </div>

      <div className="admin-section" style={{ marginTop: "24px" }}>
        <h2>Последние изменения</h2>
        <p className="admin-hint">Здесь отображаются пользователи, которых вы изменяли в текущей сессии.</p>
        <Table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Логин</th>
              <th>Роль</th>
              <th>Email</th>
              <th>Активен</th>
              <th>Модератор</th>
            </tr>
          </thead>
          <tbody>
            {managedUsers.length === 0 ? (
              <tr>
                <td colSpan={6}>Пока нет обновленных пользователей.</td>
              </tr>
            ) : (
              managedUsers.map((item) => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  <td>{item.login}</td>
                  <td>{item.role}</td>
                  <td>{item.email}</td>
                  <td>{item.is_active ? "Да" : "Нет"}</td>
                  <td>{item.is_moderator ? "Да" : "Нет"}</td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </div>
    </section>
  );
}
