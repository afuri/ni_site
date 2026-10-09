import React, { useEffect, useRef, useState } from "react";
import { createApiClient, type ApiError } from "@api";
import { Button, Card, TextInput } from "@ui";
import { createMainAuthStorage } from "../utils/authStorage";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getAccountHomePath } from "../routes/accountHome";
import { authLinkErrorMessage, useAuthRetryDelay } from "../utils/authMessages";
import "../styles/auth-link.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";
const publicClient = createApiClient({ baseUrl: API_BASE_URL });
const VERIFY_SUCCESS_STORAGE_KEY = "ni_email_verified_success";

export function VerifyEmailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const request = useRef<{ token: string; promise: Promise<{ status: string }> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [resendStatus, setResendStatus] = useState<"idle" | "loading" | "sent">("idle");
  const [resendError, setResendError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [canRetry, setCanRetry] = useState(false);
  const retry = useAuthRetryDelay();

  useEffect(() => {
    let active = true;
    const storage = createMainAuthStorage();
    const hasTokens = Boolean(storage.getTokens());
    const accountHome = getAccountHomePath(storage.getUser?.());

    if (!token) {
      setError("В ссылке нет кода подтверждения. Запросите новое письмо.");
      return;
    }
    if (request.current?.token !== token) {
      request.current = { token, promise: publicClient.request<{ status: string }>({
        path: "/auth/verify/confirm",
        method: "POST",
        body: { token },
        auth: false
      }) };
    }
    request.current.promise
      .then(() => {
        if (!active) return;
        try { window.localStorage.setItem(VERIFY_SUCCESS_STORAGE_KEY, "1"); } catch { /* Navigation still works when storage is unavailable. */ }
        navigate(hasTokens ? accountHome : "/", { replace: true });
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(authLinkErrorMessage(reason, "verify"));
          retry.handleError(reason);
          setCanRetry(!["invalid_token", "token_expired", "validation_error"].includes((reason as ApiError)?.code));
        }
      });
    return () => { active = false; };
  }, [navigate, token, attempt]);

  const resend = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (resendStatus === "loading" || retry.remaining) return;
    setResendStatus("loading"); setResendError(null);
    try {
      await publicClient.request({ path: "/auth/verify/request", method: "POST", body: { email: email.trim() }, auth: false });
      setResendStatus("sent");
    } catch (reason) {
      retry.handleError(reason);
      setResendError(authLinkErrorMessage(reason, "request"));
      setResendStatus("idle");
    }
  };
  return <main className="auth-link-page"><Card>
    <h1>Подтверждение email</h1>
    {!error ? <p role="status">Проверяем ссылку…</p> : <>
      <p role="alert">{error}</p>
      {canRetry ? <Button type="button" size="sm" variant="outline" disabled={retry.remaining > 0} onClick={() => {
        request.current = null; setError(null); setCanRetry(false); setAttempt((value) => value + 1);
      }}>Повторить проверку</Button> : null}
      <p>Укажите email, который использовали при регистрации.</p>
      <form onSubmit={resend}>
        <TextInput label="Email" name="verificationEmail" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
        {resendError ? <p role="alert">{resendError}</p> : null}
        {resendStatus === "sent" ? <p role="status">Запрос принят. Проверьте почту и папку «Спам».</p> : null}
        <Button type="submit" size="sm" isLoading={resendStatus === "loading"} disabled={retry.remaining > 0}>
          {retry.remaining ? `Повторить через ${retry.remaining} сек.` : "Запросить новое письмо"}
        </Button>
      </form>
    </>}
    <Button type="button" size="sm" variant="outline" onClick={() => navigate("/", { replace: true })}>На главную</Button>
  </Card></main>;
}
