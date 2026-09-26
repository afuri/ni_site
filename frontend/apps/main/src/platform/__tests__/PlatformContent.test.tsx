import React from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AttemptResult, UserRead } from "@api";
import { PlatformContent } from "../PlatformContent";
import { seasonStart } from "../platformSeason";

const user = {
  surname: "Иванов",
  name: "Иван",
  father_name: null,
  login: "ivanov",
  email: "ivan@example.test",
  class_grade: 5,
  region_name: "Санкт-Петербург",
  school_short_name: "ГБОУ СОШ №1",
  school_status: "selected"
} as UserRead;

describe("PlatformContent", () => {
  it("shows completed and expired works in the season and results, not the hero", () => {
    const year = seasonStart(new Date())!;
    const results = ["submitted", "expired", "active"].map((status, index) => ({
      attempt_id: index + 10, olympiad_id: index + 1, olympiad_title: `Работа ${status}`,
      olympiad_available_from: `${year}-09-01T10:00:00Z`, status,
      results_released: false, score_total: 0, score_max: 1, percent: 0, passed: null, graded_at: null
    })) as AttemptResult[];
    const props = {
      user, olympiads: { status: "ready" as const, data: [] }, results: { status: "ready" as const, data: results },
      announcements: { status: "ready" as const, data: [] }, activeAttempt: { status: "ready" as const, data: null },
      schoolNotifications: [], startingOlympiadId: null, viewingAttemptId: null, downloadingAttemptId: null,
      onOlympiadAction: vi.fn(), onContinueAttempt: vi.fn(), onViewAttempt: vi.fn(), onDownloadDiploma: vi.fn(), profileContent: null
    };
    const { rerender } = render(<PlatformContent {...props} section="home" />);
    const hero = screen.getByRole("region", { name: "Доступные олимпиады" });
    expect(within(hero).queryByText("Работа submitted")).not.toBeInTheDocument();
    expect(screen.getByText("Работа submitted")).toBeInTheDocument();
    expect(screen.getByText("Работа expired")).toBeInTheDocument();
    expect(screen.queryByText("Работа active")).not.toBeInTheDocument();
    rerender(<PlatformContent {...props} section="results" />);
    expect(screen.getByText("Работа submitted")).toBeInTheDocument();
    expect(screen.getByText("Работа expired")).toBeInTheDocument();
  });
  it("shows independent loading, empty and error states on the dashboard", () => {
    render(
      <PlatformContent
        section="home"
        user={user}
        olympiads={{ status: "loading", data: [] }}
        results={{ status: "ready", data: [] }}
        announcements={{ status: "error", data: [] }}
        schoolNotifications={[]}
        activeAttempt={{ status: "ready", data: null }}
        startingOlympiadId={null}
        viewingAttemptId={null}
        downloadingAttemptId={null}
        onOlympiadAction={vi.fn()}
        onContinueAttempt={vi.fn()}
        onViewAttempt={vi.fn()}
        onDownloadDiploma={vi.fn()}
        profileContent={null}
      />
    );

    expect(screen.getByText("Загружаем олимпиады…")).toBeInTheDocument();
    expect(screen.getByText("Попыток пока нет.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Не удалось загрузить уведомления");
  });

  it("does not expose work or diploma actions before result publication", () => {
    render(
      <PlatformContent
        section="results"
        user={user}
        olympiads={{ status: "ready", data: [] }}
        results={{ status: "ready", data: [{
          attempt_id: 12,
          olympiad_id: 3,
          olympiad_title: "Закрытая работа",
          status: "submitted",
          score_total: 0,
          score_max: 0,
          percent: 0,
          passed: null,
          graded_at: null,
          results_released: false
        }] }}
        announcements={{ status: "ready", data: [] }}
        schoolNotifications={[]}
        activeAttempt={{ status: "ready", data: null }}
        startingOlympiadId={null}
        viewingAttemptId={null}
        downloadingAttemptId={null}
        onOlympiadAction={vi.fn()}
        onContinueAttempt={vi.fn()}
        onViewAttempt={vi.fn()}
        onDownloadDiploma={vi.fn()}
        profileContent={null}
      />
    );
    expect(screen.queryByRole("button", { name: "Посмотреть работу" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Скачать диплом" })).not.toBeInTheDocument();
    expect(screen.getByText(/появятся после публикации результата/i)).toBeInTheDocument();
  });

  it("keeps a school notification visible when announcements fail to load", () => {
    render(
      <PlatformContent
        section="notifications"
        user={{ ...user, school_status: "submission_pending" }}
        olympiads={{ status: "ready", data: [] }}
        results={{ status: "ready", data: [] }}
        announcements={{ status: "error", data: [] }}
        schoolNotifications={[{
          id: "school-submission_pending",
          title: "Заявка на школу рассматривается",
          text: "Диплом станет доступен после подтверждения школы."
        }]}
        activeAttempt={{ status: "ready", data: null }}
        startingOlympiadId={null}
        viewingAttemptId={null}
        downloadingAttemptId={null}
        onOlympiadAction={vi.fn()}
        onContinueAttempt={vi.fn()}
        onViewAttempt={vi.fn()}
        onDownloadDiploma={vi.fn()}
        profileContent={null}
      />
    );

    expect(screen.getByText("Заявка на школу рассматривается")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Не удалось загрузить объявления");
    expect(screen.queryByRole("time")).not.toBeInTheDocument();
  });

  it("shows only the timestamp supplied by a real announcement", () => {
    render(
      <PlatformContent
        section="notifications"
        user={user}
        olympiads={{ status: "ready", data: [] }}
        results={{ status: "ready", data: [] }}
        announcements={{ status: "ready", data: [{
          campaign_code: "actual-news",
          subject: null,
          group_number: null,
          title: "Объявление",
          text: "Текст объявления",
          starts_at: "2026-09-18T10:00:00Z",
          ends_at: null
        }] }}
        schoolNotifications={[]}
        activeAttempt={{ status: "ready", data: null }}
        startingOlympiadId={null}
        viewingAttemptId={null}
        downloadingAttemptId={null}
        onOlympiadAction={vi.fn()}
        onContinueAttempt={vi.fn()}
        onViewAttempt={vi.fn()}
        onDownloadDiploma={vi.fn()}
        profileContent={null}
      />
    );

    expect(screen.getByRole("time")).toHaveAttribute("datetime", "2026-09-18T10:00:00Z");
  });
});
