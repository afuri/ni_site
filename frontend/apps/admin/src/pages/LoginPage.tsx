import React, { useEffect, useState } from "react";
import { Button, TextInput, useAuth } from "@ui";
import { useLocation, useNavigate } from "react-router-dom";
import { createApiClient, type ApiError } from "@api";

const publicClient = createApiClient({ baseUrl: import.meta.env.VITE_API_BASE_URL ?? "/api/v1" });

export function LoginPage() {
  const { signIn, status, user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as { from?: { pathname: string } } | null;
  const from = locationState?.from?.pathname ?? "/tasks";

  const [form, setForm] = useState({ login: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  useEffect(() => {
    if (status === "authenticated" && user?.role === "admin") {
      navigate(from, { replace: true });
    }
    if (status === "authenticated" && user && user.role !== "admin") {
      setError("Доступ разрешен только администраторам.");
      void signOut();
    }
  }, [status, user, from, navigate, signOut]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!form.login || !form.password) {
      setError("Введите логин и пароль.");
      return;
    }
    try {
      const result = await signIn({ login: form.login, password: form.password });
      if (result.kind === "password_reset_required") {
        setForm((prev) => ({ ...prev, password: "" }));
        setNewPassword("");
        setPasswordConfirm("");
        setResetToken(result.resetToken);
      }
    } catch {
      setError("Неверный логин или пароль.");
    }
  };

  const handleReset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (newPassword !== passwordConfirm) {
      setError("Пароли не совпадают.");
      return;
    }
    setResetLoading(true);
    try {
      await publicClient.request({
        path: "/auth/password/reset/confirm",
        method: "POST",
        body: { token: resetToken, new_password: newPassword },
        auth: false
      });
      setResetToken(null);
      setNewPassword("");
      setPasswordConfirm("");
      setError("Пароль изменён. Войдите с новым паролем.");
    } catch (caught) {
      const apiError = caught as ApiError;
      setError(apiError?.code === "invalid_token"
        ? "Токен устарел или использован. Войдите с временным паролем снова."
        : "Не удалось изменить пароль. Проверьте требования к паролю.");
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="admin-login">
      <div className="admin-login-card">
        <h1>Вход в админ-панель</h1>
        <p className="admin-hint">{resetToken ? "Временный пароль принят. Создайте новый пароль в течение 15 минут." : "Пожалуйста, авторизуйтесь для доступа к управлению."}</p>
        {resetToken ? (
          <form className="admin-login-form" onSubmit={handleReset}>
            <TextInput label="Новый пароль" name="newPassword" type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
            <TextInput label="Повтор пароля" name="passwordConfirm" type="password" autoComplete="new-password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} />
            {error ? <span className="admin-error">{error}</span> : null}
            <div className="admin-login-actions">
              <Button type="submit" isLoading={resetLoading}>Сохранить пароль</Button>
              <Button type="button" onClick={() => {
                setResetToken(null);
                setNewPassword("");
                setPasswordConfirm("");
                setError(null);
              }}>Отмена</Button>
            </div>
          </form>
        ) : <form className="admin-login-form" onSubmit={handleSubmit}>
          <TextInput
            label="Логин"
            name="login"
            value={form.login}
            onChange={(event) => setForm((prev) => ({ ...prev, login: event.target.value }))}
          />
          <TextInput
            label="Пароль"
            name="password"
            type="password"
            value={form.password}
            onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
          />
          {error ? <span className="admin-error">{error}</span> : null}
          <div className="admin-login-actions">
            <Button type="submit" isLoading={status === "loading"}>
              Войти
            </Button>
          </div>
        </form>}
      </div>
    </div>
  );
}
