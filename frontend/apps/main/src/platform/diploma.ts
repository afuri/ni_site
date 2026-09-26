export type DiplomaDownloadResult = { ok: true } | { ok: false; message: string };

type DiplomaWindow = Pick<Window, "close" | "closed" | "location" | "opener">;

export async function downloadAttemptDiploma({
  apiBaseUrl,
  attemptId,
  accessToken,
  fetcher = fetch,
  openWindow = () => window.open("", "_blank")
}: {
  apiBaseUrl: string;
  attemptId: number;
  accessToken: string | null;
  fetcher?: typeof fetch;
  openWindow?: () => DiplomaWindow | null;
}): Promise<DiplomaDownloadResult> {
  const diplomaWindow = openWindow();
  if (!diplomaWindow) {
    return { ok: false, message: "Браузер заблокировал новое окно. Разрешите всплывающие окна для сайта." };
  }
  try {
    diplomaWindow.opener = null;
  } catch {
    // Some browsers do not allow assigning opener.
  }

  try {
    const response = await fetcher(`${apiBaseUrl}/attempts/${attemptId}/diploma`, {
      method: "GET",
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      credentials: "include"
    });
    if (response.status === 404) {
      diplomaWindow.close();
      return { ok: false, message: "Диплом ещё не сформирован. Попробуйте позже." };
    }
    if (response.status === 403) {
      const payload = (await response.json().catch(() => null)) as { error?: { code?: string } } | null;
      diplomaWindow.close();
      return {
        ok: false,
        message: payload?.error?.code === "diploma_school_pending"
          ? "Диплом станет доступен после подтверждения школы администратором."
          : "Недостаточно прав для скачивания диплома."
      };
    }
    if (!response.ok) {
      diplomaWindow.close();
      return { ok: false, message: "Не удалось скачать диплом. Попробуйте позже." };
    }

    const objectUrl = window.URL.createObjectURL(await response.blob());
    diplomaWindow.location.href = objectUrl;
    window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 120000);
    return { ok: true };
  } catch {
    if (!diplomaWindow.closed) diplomaWindow.close();
    return { ok: false, message: "Не удалось скачать диплом. Попробуйте позже." };
  }
}
