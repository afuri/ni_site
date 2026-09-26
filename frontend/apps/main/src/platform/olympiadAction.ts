import type { AttemptResult, OlympiadPublic, SchoolStatus, UserRead } from "@api";
import type { ResourceStatus } from "./usePlatformOverview";

export type OlympiadScheduleState = "soon" | "available" | "finished" | "other-grade";

export type OlympiadAction =
  | { kind: "continue"; attemptId: number; label: string }
  | { kind: "view"; result: AttemptResult; label: string }
  | { kind: "start"; olympiad: OlympiadPublic; label: string }
  | { kind: "disabled"; label: string; reason: string };

const allowedSchoolStatuses = new Set<SchoolStatus>([
  "selected",
  "submission_pending",
  "not_required"
]);

const parseTimestamp = (value: string) => {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

export const ageGroupAllows = (ageGroup: string, classGrade: number | null) => {
  if (classGrade === null) return false;
  const normalized = ageGroup.trim();
  if (!normalized) return false;
  try {
    const values = normalized.includes(",")
      ? normalized.split(",").map((item) => Number(item.trim()))
      : normalized.includes("-")
        ? (() => {
            const [start, end] = normalized.split("-", 2).map((item) => Number(item.trim()));
            if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) return [];
            return Array.from({ length: end - start + 1 }, (_, index) => start + index);
          })()
        : [Number(normalized)];
    return values.some((value) => Number.isInteger(value) && value === classGrade);
  } catch {
    return false;
  }
};

export function getOlympiadScheduleState(
  olympiad: OlympiadPublic,
  classGrade: number | null,
  now = Date.now()
): OlympiadScheduleState {
  if (!ageGroupAllows(olympiad.age_group, classGrade)) return "other-grade";
  const from = parseTimestamp(olympiad.available_from);
  const to = parseTimestamp(olympiad.available_to);
  if (from === null || to === null || now > to) return "finished";
  if (now < from) return "soon";
  return "available";
}

export function resolveOlympiadAction({
  olympiad,
  results,
  resultsStatus,
  user,
  now = Date.now()
}: {
  olympiad: OlympiadPublic;
  results: AttemptResult[];
  resultsStatus: ResourceStatus;
  user: UserRead;
  now?: number;
}): OlympiadAction {
  const existing = results.find((item) => item.olympiad_id === olympiad.id);
  if (existing?.status === "active") {
    return { kind: "continue", attemptId: existing.attempt_id, label: "Продолжить" };
  }
  if (existing) {
    return existing.results_released
      ? { kind: "view", result: existing, label: "Посмотреть работу" }
      : { kind: "disabled", label: "Результат готовится", reason: "Работа станет доступна после публикации результата." };
  }
  if (resultsStatus === "idle" || resultsStatus === "loading") {
    return { kind: "disabled", label: "Проверяем попытки…", reason: "Дождитесь загрузки попыток." };
  }
  if (resultsStatus === "error") {
    return { kind: "disabled", label: "Старт недоступен", reason: "Не удалось проверить предыдущие попытки." };
  }
  if (results.some((item) => item.status === "active")) {
    return { kind: "disabled", label: "Начать", reason: "Сначала завершите текущую попытку." };
  }
  if (!user.is_email_verified) {
    return { kind: "disabled", label: "Подтвердите email", reason: "Для участия необходимо подтвердить email." };
  }
  if (!allowedSchoolStatuses.has(user.school_status)) {
    return { kind: "disabled", label: "Заполните профиль", reason: "Для участия необходимо выбрать школу или отправить заявку." };
  }
  const schedule = getOlympiadScheduleState(olympiad, user.class_grade, now);
  if (schedule === "soon") {
    return { kind: "disabled", label: "Скоро", reason: "Олимпиада ещё не началась." };
  }
  if (schedule === "finished") {
    return { kind: "disabled", label: "Завершена", reason: "Период участия завершён." };
  }
  if (schedule === "other-grade") {
    return { kind: "disabled", label: "Другой класс", reason: "Олимпиада недоступна для вашего класса." };
  }
  return { kind: "start", olympiad, label: "Начать" };
}
