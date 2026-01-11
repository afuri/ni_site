import React, { useEffect, useState } from "react";
import { Button, TextInput, useAuth } from "@ui";
import { useLocation, useNavigate } from "react-router-dom";

export function LoginPage() {
  const { signIn, status, user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as { from?: { pathname: string } } | null;
  const from = locationState?.from?.pathname ?? "/tasks";

  const [form, setForm] = useState({ login: "", password: "" });
  const [error, setError] = useState<string | null>(null);

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
      await signIn({ login: form.login, password: form.password });
    } catch {
      setError("Неверный логин или пароль.");
    }
  };

  return (
    <div className="admin-login">
      <div className="admin-login-card">
        <h1>Вход в админ-панель</h1>
        <p className="admin-hint">Пожалуйста, авторизуйтесь для доступа к управлению.</p>
        <form className="admin-login-form" onSubmit={handleSubmit}>
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
        </form>
      </div>
    </div>
  );
}
