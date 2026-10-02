type Option = { id: string; text: string };

export function attemptAnswerLabels(answer: unknown, rawOptions: unknown): string[] {
  if (!answer || typeof answer !== "object") return [];
  const payload = answer as { text?: unknown; choice_id?: unknown; choice_ids?: unknown };
  if (typeof payload.text === "string" && payload.text !== "") return [payload.text];
  const ids = typeof payload.choice_id === "string"
    ? [payload.choice_id]
    : Array.isArray(payload.choice_ids)
      ? payload.choice_ids.filter((id): id is string => typeof id === "string")
      : [];
  const options: Option[] = Array.isArray(rawOptions)
    ? rawOptions.filter((item): item is Option => item && typeof item.id === "string" && typeof item.text === "string")
    : [];
  return ids.map((id) => options.find((option) => option.id === id)?.text ?? id);
}

export function formatAttemptElapsed(attempt: {
  status?: string;
  started_at?: string | null;
  deadline_at?: string | null;
  finished_at?: string | null;
}): string | null {
  if (attempt.status === "active") return null;
  const end = attempt.finished_at ?? (attempt.status === "expired" ? attempt.deadline_at : null);
  if (!attempt.started_at || !end) return "Точное время прохождения не сохранено";
  const seconds = Math.floor((Date.parse(end) - Date.parse(attempt.started_at)) / 1000);
  if (!Number.isFinite(seconds) || seconds < 0) return "Точное время прохождения не сохранено";
  const minutes = Math.floor(seconds / 60);
  return `${minutes} мин ${seconds % 60} сек`;
}
