import { useEffect, useState } from "react";
import type { ApiError } from "@api";

export const OPEN_RECOVERY_STORAGE_KEY = "ni_open_recovery";

export function authRetrySeconds(error: unknown): number {
  const value = error as ApiError | undefined;
  if (value?.code !== "rate_limited" && value?.status !== 429) return 0;
  const raw = Number((value.details as { retry_after_seconds?: unknown } | undefined)?.retry_after_seconds);
  return Number.isFinite(raw) && raw > 0 ? Math.min(3600, Math.ceil(raw)) : 30;
}

export function authLinkErrorMessage(error: unknown, operation: "verify" | "reset" | "request", temporary = false): string {
  const value = error as ApiError | undefined;
  const seconds = authRetrySeconds(error);
  if (seconds) return `Слишком много запросов. Повторите через ${seconds} сек.`;
  if (value?.code === "token_already_used") return "Пароль уже изменён по этой ссылке. Войдите с новым паролем.";
  if (value?.code === "token_expired") {
    return temporary ? "Время смены пароля истекло. Войдите с временным паролем снова." :
      "Срок действия ссылки истёк. Запросите новое письмо.";
  }
  if (value?.code === "invalid_token") {
    return temporary ? "Ссылка смены пароля недействительна. Войдите с временным паролем снова." :
      "Ссылка недействительна. Запросите новое письмо и откройте ссылку из него.";
  }
  if (value?.code === "validation_error") return "Проверьте введённые данные и повторите попытку.";
  if (operation === "verify") return "Не удалось подтвердить email. Повторите попытку или запросите новое письмо.";
  if (operation === "request") return "Не удалось запросить письмо. Попробуйте позже.";
  return "Не удалось изменить пароль. Попробуйте позже.";
}

export function useAuthRetryDelay() {
  const [deadline, setDeadline] = useState(0);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!deadline) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= deadline) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [deadline]);
  return {
    remaining: Math.max(0, Math.ceil((deadline - now) / 1000)),
    handleError(error: unknown) {
      const seconds = authRetrySeconds(error);
      if (seconds) {
        const current = Date.now();
        setNow(current);
        setDeadline(current + seconds * 1000);
      }
    }
  };
}
