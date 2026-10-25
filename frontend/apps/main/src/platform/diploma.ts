import type { ApiClient, ApiError, DiplomaLinkResponse } from "@api";

export type DiplomaDownloadResult = { ok: true } | { ok: false; message: string };

type DiplomaWindow = Pick<Window, "close" | "closed" | "location" | "opener" | "document">;

const BLOCKED_MESSAGE = "Браузер заблокировал новое окно. Разрешите всплывающие окна для сайта.";

function showMessage(tab: DiplomaWindow, message: string, error = false): void {
  try {
    if (tab.closed) return;
    const doc = tab.document;
    doc.title = "Диплом";
    doc.documentElement.lang = "ru";
    if (!doc.querySelector('meta[name="viewport"]')) {
      const viewport = doc.createElement("meta");
      viewport.name = "viewport";
      viewport.content = "width=device-width, initial-scale=1";
      doc.head.append(viewport);
    }
    doc.body.style.cssText = "margin:24px;font:15px/1.5 system-ui,sans-serif;color:#302744";
    const text = doc.createElement("p");
    text.textContent = message;
    text.setAttribute("role", error ? "alert" : "status");
    doc.body.replaceChildren(text);
    if (error) {
      const close = doc.createElement("button");
      close.type = "button";
      close.textContent = "Закрыть вкладку";
      close.style.cssText = "min-height:32px;padding:5px 10px;font:13px system-ui,sans-serif;border:1px solid #8b5cf6;border-radius:6px;background:white;color:#6d28d9;cursor:pointer";
      close.onclick = () => tab.close();
      doc.body.append(close);
    }
  } catch {
    // A closed/navigated popup can deny document access; the cabinet also shows errors.
  }
}

function errorMessage(error: unknown): string {
  const apiError = error as Partial<ApiError> | null;
  if (apiError?.status === 404) return "Диплом ещё не сформирован. Попробуйте позже.";
  if (apiError?.status === 403) {
    return apiError.code === "diploma_school_pending"
      ? "Диплом станет доступен после подтверждения школы администратором."
      : "Недостаточно прав для скачивания диплома.";
  }
  if (apiError?.status === 401) return "Сессия истекла. Войдите в аккаунт снова.";
  return "Не удалось получить ссылку на диплом. Вернитесь в личный кабинет и повторите попытку.";
}

export async function downloadAttemptDiploma({
  client,
  attemptId,
  openWindow = () => window.open("", "_blank")
}: {
  client: Pick<ApiClient, "request">;
  attemptId: number;
  openWindow?: () => DiplomaWindow | null;
}): Promise<DiplomaDownloadResult> {
  let tab: DiplomaWindow | null;
  // Reserve the tab during the click, before any network operation/user activation expires.
  try {
    tab = openWindow();
  } catch {
    return { ok: false, message: BLOCKED_MESSAGE };
  }
  if (!tab) return { ok: false, message: BLOCKED_MESSAGE };
  showMessage(tab, "Загрузка диплома…");
  try {
    tab.opener = null;
  } catch {
    // Some browsers do not allow assigning opener.
  }

  try {
    // The shared client applies its request timeout and refreshes/retries expired sessions.
    const link = await client.request<DiplomaLinkResponse>({
      path: `/attempts/${attemptId}/diploma?response_mode=json`,
      method: "GET",
      headers: { Accept: "application/json" },
      timeoutMs: 15000
    });
    if (tab.closed) return { ok: true };
    if (!link || typeof link.url !== "string" || !link.url.trim()) throw new Error("invalid_diploma_url");
    const url = new URL(link.url, window.location.href);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
      throw new Error("invalid_diploma_url");
    }
    // The browser receives the original JPG directly: no Blob or expiring object URL.
    tab.location.replace(url.href);
    return { ok: true };
  } catch (error) {
    if (tab.closed) return { ok: true };
    const message = errorMessage(error);
    showMessage(tab, message, true);
    return { ok: false, message };
  }
}
