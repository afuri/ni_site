import type { AttemptResult, OlympiadPublic, UserRead } from "@api";
import { describe, expect, it } from "vitest";
import { resolveOlympiadAction } from "../olympiadAction";

const olympiad = {
  id: 5,
  title: "Олимпиада",
  description: null,
  age_group: "5-6",
  attempts_limit: 1,
  duration_sec: 3600,
  available_from: "2026-09-01T00:00:00Z",
  available_to: "2026-10-01T00:00:00Z",
  pass_percent: 50,
  is_published: true,
  results_released: false
} satisfies OlympiadPublic;

const user = {
  class_grade: 5,
  is_email_verified: true,
  school_status: "selected"
} as UserRead;

const activeResult = {
  attempt_id: 77,
  olympiad_id: 5,
  status: "active",
  results_released: false
} as AttemptResult;

describe("resolveOlympiadAction", () => {
  it("blocks another olympiad while an attempt is active", () => {
    const action = resolveOlympiadAction({ olympiad, results: [{ ...activeResult, olympiad_id: 9 }], resultsStatus: "ready", user });
    expect(action).toEqual({ kind: "disabled", label: "Начать", reason: "Сначала завершите текущую попытку." });
  });
  it("continues an active attempt instead of offering a new start", () => {
    expect(resolveOlympiadAction({
      olympiad,
      results: [activeResult],
      resultsStatus: "ready",
      user,
      now: Date.parse("2026-09-17T00:00:00Z")
    })).toEqual({ kind: "continue", attemptId: 77, label: "Продолжить" });
  });

  it("does not offer a start before the olympiad window", () => {
    const action = resolveOlympiadAction({
      olympiad,
      results: [],
      resultsStatus: "ready",
      user,
      now: Date.parse("2026-08-17T00:00:00Z")
    });
    expect(action.kind).toBe("disabled");
    expect(action.label).toBe("Скоро");
  });

  it("does not reveal a completed work before results are released", () => {
    const action = resolveOlympiadAction({
      olympiad,
      results: [{ ...activeResult, status: "submitted" }],
      resultsStatus: "ready",
      user
    });
    expect(action.kind).toBe("disabled");
    expect(action.label).toBe("Результат готовится");
  });
});
