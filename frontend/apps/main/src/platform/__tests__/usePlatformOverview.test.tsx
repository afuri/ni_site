import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PlatformApi } from "../platformApi";
import { usePlatformOverview } from "../usePlatformOverview";

function Probe({ api }: { api: PlatformApi }) {
  const state = usePlatformOverview(api, true);
  return (
    <output data-testid="state">
      {JSON.stringify({
        olympiads: state.olympiads.status,
        results: state.results.status,
        announcements: state.announcements.status,
        activeAttempt: state.activeAttempt.status,
        olympiadCount: state.olympiads.data.length,
        announcementCount: state.announcements.data.length,
        completedCount: state.results.data.filter((result) => result.status !== "active").length
      })}
    </output>
  );
}

describe("usePlatformOverview", () => {
  it("reconciles a deadline passing during loading without repeatedly polling the list", async () => {
    const active = { attempt_id: 77, olympiad_id: 5, status: "active" };
    const api = {
      getOlympiads: vi.fn().mockResolvedValue([]), getAnnouncements: vi.fn().mockResolvedValue([]),
      getMyResults: vi.fn().mockResolvedValue([active]),
      getAttempt: vi.fn().mockResolvedValue({ attempt: { status: "expired" }, tasks: [] }),
      getAttemptResult: vi.fn().mockResolvedValue({ ...active, status: "expired" })
    } as unknown as PlatformApi;
    render(<Probe api={api} />);
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"completedCount":1'));
    expect(api.getMyResults).toHaveBeenCalledOnce();
    expect(api.getAttemptResult).toHaveBeenCalledOnce();
  });
  it("keeps successful resources visible when another request fails", async () => {
    const api = {
      getProfile: vi.fn(),
      getOlympiads: vi.fn().mockResolvedValue([{
        id: 1,
        title: "Осенняя олимпиада",
        description: null,
        age_group: "5-6",
        attempts_limit: 1,
        duration_sec: 3600,
        available_from: "2026-09-01T09:00:00Z",
        available_to: "2026-10-01T09:00:00Z",
        pass_percent: 50,
        is_published: true,
        results_released: false
      }]),
      getMyResults: vi.fn().mockRejectedValue(new Error("results unavailable")),
      getAnnouncements: vi.fn().mockResolvedValue([{
        campaign_code: "start",
        subject: null,
        group_number: null,
        title: "Старт сезона",
        text: "Добро пожаловать",
        starts_at: null,
        ends_at: null
      }]),
      getAttempt: vi.fn()
    } as unknown as PlatformApi;

    render(<Probe api={api} />);

    await waitFor(() => {
      expect(screen.getByTestId("state")).toHaveTextContent('"olympiads":"ready"');
      expect(screen.getByTestId("state")).toHaveTextContent('"results":"error"');
      expect(screen.getByTestId("state")).toHaveTextContent('"announcements":"ready"');
    });
    expect(screen.getByTestId("state")).toHaveTextContent('"olympiadCount":1');
    expect(screen.getByTestId("state")).toHaveTextContent('"announcementCount":1');
    expect(api.getAttempt).not.toHaveBeenCalled();
  });

  it("loads the existing active attempt without starting a new one", async () => {
    const api = {
      getProfile: vi.fn(),
      getOlympiads: vi.fn().mockResolvedValue([]),
      getMyResults: vi.fn().mockResolvedValue([{
        attempt_id: 77,
        olympiad_id: 5,
        olympiad_title: "Текущая олимпиада",
        status: "active",
        score_total: 0,
        score_max: 0,
        percent: 0,
        passed: null,
        graded_at: null,
        results_released: false
      }]),
      getAnnouncements: vi.fn().mockResolvedValue([]),
      getAttempt: vi.fn().mockResolvedValue({
        attempt: {
          id: 77,
          olympiad_id: 5,
          user_id: 10,
          started_at: "2026-09-17T10:00:00Z",
          deadline_at: "2026-09-17T11:00:00Z",
          duration_sec: 3600,
          status: "active",
          score_total: 0,
          score_max: 0,
          passed: null,
          graded_at: null
        },
        olympiad_title: "Текущая олимпиада",
        tasks: []
      })
    } as unknown as PlatformApi;

    render(<Probe api={api} />);

    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"activeAttempt":"ready"'));
    expect(api.getAttempt).toHaveBeenCalledWith(77, expect.any(AbortSignal));
  });
});
