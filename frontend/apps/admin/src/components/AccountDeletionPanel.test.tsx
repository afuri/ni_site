import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { AccountDeletionPanel } from "./AccountDeletionPanel";
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../lib/adminClient", () => ({ adminApiClient: { request } }));
beforeEach(() => {
  request.mockReset();
  request.mockImplementation(async ({ path, method }) => {
    if (path.includes("/requests?")) return [{ id: 8, user_id: 12, login: "student12", created_at: "2026-09-26T00:00:00Z" }];
    if (path.endsWith("/cleanup")) return [];
    if (method === "DELETE") return { files_pending: true };
    return { user_id: 12, login: "student12", email: "student12@example.com", full_name: "Иван Иванов", role: "student", attempts: 3, links: 1 };
  });
});

it("previews user and requires typing ID; sends the request ID and exposes pending files", async () => {
  const user = userEvent.setup();
  const deleted = vi.fn();
  render(<AccountDeletionPanel onDeleted={deleted} />);
  await user.click(await screen.findByRole("button", { name: "Рассмотреть удаление" }));
  const confirm = await screen.findByRole("button", { name: "Удалить пользователя навсегда" });
  expect(confirm).toBeDisabled();
  expect(request.mock.calls.some(([call]) => call.method === "DELETE")).toBe(false);
  await user.type(screen.getByLabelText("Для подтверждения введите ID пользователя"), "12");
  await user.click(confirm);
  await waitFor(() => expect(deleted).toHaveBeenCalledWith(12));
  expect(request).toHaveBeenCalledWith({ path: "/admin/account-deletions/12", method: "DELETE", body: { confirmed: true, expected_login: "student12", request_id: 8 } });
  expect(await screen.findByText(/Файлы ещё не удалены/)).toBeInTheDocument();
});

it("does not claim success if a user cancelled the request", async () => {
  const user = userEvent.setup();
  const deleted = vi.fn();
  render(<AccountDeletionPanel onDeleted={deleted} />);
  await user.click(await screen.findByRole("button", { name: "Рассмотреть удаление" }));
  await user.type(await screen.findByLabelText("Для подтверждения введите ID пользователя"), "12");
  request.mockRejectedValueOnce({ code: "deletion_request_cancelled" });
  await user.click(screen.getByRole("button", { name: "Удалить пользователя навсегда" }));
  await waitFor(() => expect(screen.getAllByText(/Заявка отменена пользователем/).length).toBeGreaterThan(0));
  expect(deleted).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});
