import React, { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Card } from "@ui";
import { OPEN_RECOVERY_STORAGE_KEY } from "../utils/authMessages";
import "../styles/auth-link.css";

const RESET_TOKEN_STORAGE_KEY = "ni_password_reset_token";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const handledToken = useRef<string | null>(null);

  useEffect(() => {
    if (!token || handledToken.current === token) return;
    handledToken.current = token;

    window.localStorage.setItem(RESET_TOKEN_STORAGE_KEY, token);
    navigate("/", { replace: true });
  }, [navigate, token]);

  if (token) return null;
  return <main className="auth-link-page"><Card>
    <h1>Смена пароля</h1>
    <p role="alert">В ссылке нет кода смены пароля. Запросите новое письмо.</p>
    <Button size="sm" onClick={() => {
      window.localStorage.setItem(OPEN_RECOVERY_STORAGE_KEY, "1");
      navigate("/", { replace: true });
    }}>Запросить новую ссылку</Button>
  </Card></main>;
}
