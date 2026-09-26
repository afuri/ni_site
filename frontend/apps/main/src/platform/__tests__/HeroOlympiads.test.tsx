import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AttemptResult, AttemptView, OlympiadPublic, UserRead } from "@api";
import { HeroOlympiads } from "../HeroOlympiads";

const now = Date.parse("2026-09-26T10:00:00Z");
const user = { class_grade: 5, is_email_verified: true, school_status: "selected" } as UserRead;
const olympiad = (id: number, overrides: Partial<OlympiadPublic> = {}): OlympiadPublic => ({
  id, title: `Олимпиада ${id}`, description: null, age_group: "5-6", attempts_limit: 1,
  duration_sec: 600, available_from: "2026-09-26T09:00:00Z", available_to: "2026-09-26T11:00:00Z",
  pass_percent: 60, is_published: true, results_released: false, ...overrides
});
const result = (id: number, status: AttemptResult["status"] = "active") => ({
  attempt_id: id + 100, olympiad_id: id, status, results_released: false
}) as AttemptResult;

function setup(items: OlympiadPublic[], results: AttemptResult[] = [], active: AttemptView | null = null) {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const onAction = vi.fn();
  const onRefresh = vi.fn();
  render(<HeroOlympiads olympiads={{ status: "ready", data: items }} results={{ status: "ready", data: results }}
    activeAttempt={{ status: "ready", data: active }} user={user} startingId={null} onAction={onAction} onRefresh={onRefresh} />);
  return { onAction, onRefresh };
}
afterEach(() => { vi.useRealTimers(); });

describe("HeroOlympiads", () => {
  it("shows three sorted rows and reveals the rest without network requests", () => {
    const { onAction, onRefresh } = setup([olympiad(4), olympiad(2), olympiad(1), olympiad(3)]);
    expect(screen.getAllByRole("heading", { level: 3 }).map((item) => item.textContent)).toEqual(["Олимпиада 1", "Олимпиада 2", "Олимпиада 3"]);
    fireEvent.click(screen.getByRole("button", { name: "Показать еще" }));
    expect(screen.getByRole("heading", { name: "Олимпиада 4" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Начать: Олимпиада 4" }));
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ kind: "start", olympiad: expect.objectContaining({ id: 4 }) }));
    fireEvent.click(screen.getByRole("button", { name: "Скрыть" }));
    expect(screen.queryByRole("heading", { name: "Олимпиада 4" })).not.toBeInTheDocument();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("ticks the countdown locally and enables start at the opening time", () => {
    const { onRefresh } = setup([olympiad(1, { available_from: "2026-09-26T10:00:02Z" })]);
    expect(screen.getByRole("button", { name: /До начала.*00:00:02/ })).toBeDisabled();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole("button", { name: /До начала.*00:00:01/ })).toBeDisabled();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole("button", { name: "Начать: Олимпиада 1" })).toBeEnabled();
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("hides completed, expired, closed, unpublished and other-grade olympiads", () => {
    setup([
      olympiad(1), olympiad(2), olympiad(3, { available_to: "2026-09-26T09:59:00Z" }),
      olympiad(4, { is_published: false }), olympiad(5, { age_group: "7-8" })
    ], [result(1, "submitted"), result(2, "expired")]);
    expect(screen.queryAllByRole("heading", { level: 3 })).toHaveLength(0);
    expect(screen.getByText("Олимпиада для вашего класса еще не опубликована")).toBeInTheDocument();
  });

  it("pins the active attempt, blocks other starts and refreshes once at its deadline", () => {
    const active = { attempt: { id: 104, olympiad_id: 4, status: "active", deadline_at: "2026-09-26T10:00:02Z" } } as AttemptView;
    const { onRefresh, onAction } = setup([olympiad(1), olympiad(2), olympiad(3), olympiad(4)], [result(4)], active);
    expect(screen.getAllByRole("heading", { level: 3 })[0]).toHaveTextContent("Олимпиада 4");
    expect(screen.getByRole("button", { name: "Начать: Олимпиада 1" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Продолжить: Олимпиада 4" }));
    expect(onAction).toHaveBeenCalledWith({ kind: "continue", attemptId: 104, label: "Продолжить" });
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.queryByRole("heading", { name: "Олимпиада 4" })).not.toBeInTheDocument();
    expect(onRefresh).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(3000));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it("removes an olympiad when its window closes", () => {
    const { onRefresh } = setup([olympiad(1, { available_to: "2026-09-26T10:00:01Z" })]);
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.queryByRole("heading", { name: "Олимпиада 1" })).not.toBeInTheDocument();
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it("does not mistake a loading or failed request for no published olympiads", () => {
    const props = { results: { status: "ready" as const, data: [] }, activeAttempt: { status: "ready" as const, data: null }, user, startingId: null, onAction: vi.fn() };
    const { rerender } = render(<HeroOlympiads {...props} olympiads={{ status: "loading", data: [] }} />);
    expect(screen.getByRole("status")).toHaveTextContent("Загружаем олимпиады");
    rerender(<HeroOlympiads {...props} olympiads={{ status: "error", data: [] }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Не удалось загрузить");
    expect(screen.queryByText("Олимпиада для вашего класса еще не опубликована")).not.toBeInTheDocument();
  });
});
