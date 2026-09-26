import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { ResultsPage } from "../ResultsPage";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../../lib/adminClient", () => ({ adminApiClient: { request } }));

beforeEach(() => {
  request.mockReset();
  request.mockImplementation(async ({ path }) => {
    if (path.startsWith("/admin/olympiads")) return [{ id: 64, title: "Тестовая математика" }];
    if (path.endsWith("/attempts")) return [{
      id: 12754, user_id: 2, user_login: "student01", user_full_name: "Иванов Иван", class_grade: 5,
      started_at: "2026-09-26T14:00:00Z", completed_at: "2026-09-26T14:10:00Z", duration_sec: 600,
      score_total: 0, score_max: 3, percent: 0, school_status: "selected"
    }];
    return { attempt: { id: 12754 }, user: { id: 2, login: "student01", full_name: "Иванов Иван" }, olympiad_title: "Тестовая математика", tasks: [] };
  });
});

it("uses the bounded directory-style table without changing result data or attempt review", async () => {
  const user = userEvent.setup();
  render(<ResultsPage />);
  await screen.findByRole("option", { name: "Тестовая математика" });
  await user.selectOptions(screen.getByLabelText("Наименование"), "64");
  const region = await screen.findByRole("region", { name: "Таблица результатов" });
  expect(region).toHaveClass("admin-directory-table", "admin-results-scroll");
  expect(within(region).getByRole("columnheader", { name: "ID попытки" })).toBeInTheDocument();
  await user.click(await within(region).findByRole("button", { name: "12754" }));
  expect(await screen.findByRole("dialog", { name: "Тестовая математика" })).toBeInTheDocument();
  expect(request).toHaveBeenCalledWith({ path: "/admin/results/attempts/12754", method: "GET" });
});
