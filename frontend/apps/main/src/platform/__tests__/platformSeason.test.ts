import { describe, expect, it } from "vitest";
import type { AttemptResult } from "@api";
import { availableSeasons, resultSeason, seasonLabel, seasonStart } from "../platformSeason";

describe("school seasons", () => {
  it("switches at midnight September 1 in Moscow regardless of browser time zone", () => {
    expect(seasonStart("2026-08-31T20:59:59Z")).toBe(2025);
    expect(seasonStart("2026-08-31T21:00:00Z")).toBe(2026);
    expect(seasonStart("2027-08-31T20:59:59Z")).toBe(2026);
    expect(seasonLabel(2026)).toBe("2026/27");
  });

  it("keeps a late-published result in the original olympiad season", () => {
    const result = { olympiad_available_from: "2026-08-01T09:00:00Z", graded_at: "2026-10-01T09:00:00Z" } as AttemptResult;
    expect(resultSeason(result)).toBe(2025);
    expect(availableSeasons([result, result, { olympiad_available_from: "2026-09-01T09:00:00Z" } as AttemptResult])).toEqual([2026, 2025]);
  });

  it("does not invent a season for legacy responses or invalid dates", () => {
    expect(resultSeason({ graded_at: "2026-10-01T09:00:00Z" } as AttemptResult)).toBeNull();
    expect(seasonStart("invalid")).toBeNull();
  });
});
