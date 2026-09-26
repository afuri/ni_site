import type { AttemptResult } from "@api";

const schoolCalendar = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Moscow", year: "numeric", month: "numeric"
});

/** The school year is determined by the olympiad start, not result publication. */
export function seasonStart(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = schoolCalendar.formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  return month >= 9 ? year : year - 1;
}

export const seasonLabel = (year: number) => `${year}/${String(year + 1).slice(-2)}`;
export const resultSeason = (result: AttemptResult) => seasonStart(result.olympiad_available_from);

export function availableSeasons(results: AttemptResult[]): number[] {
  return [...new Set(results.map(resultSeason).filter((year): year is number => year !== null))].sort((a, b) => b - a);
}
