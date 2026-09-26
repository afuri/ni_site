import React from "react";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { UsersPage } from "../UsersPage";
import type { UserRead } from "@api";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../../lib/adminClient", () => ({ adminApiClient: { request } }));

beforeEach(() => {
  request.mockReset();
  request.mockImplementation(async ({ path, method, body }) => method === "PUT" ? { id: 5, ...body } : path.includes("/count") ? 0 : []);
});

it("switches role-specific inputs and submits only the fields for the selected role", async () => {
  const user = userEvent.setup();
  render(<UsersPage />);
  const form = within(screen.getByRole("button", { name: "Сохранить изменения" }).closest("form")!);
  await user.type(form.getByLabelText("ID пользователя"), "5");
  await user.type(form.getByLabelText("Класс"), "5");
  await user.selectOptions(form.getByLabelText("Роль"), "teacher");
  expect(form.queryByLabelText("Класс")).not.toBeInTheDocument();
  expect(form.getByLabelText("Предмет")).toBeRequired();
  await user.type(form.getByLabelText("Предмет"), "Математика");
  await user.click(form.getByRole("button", { name: "Сохранить изменения" }));
  await waitFor(() => expect(request).toHaveBeenCalledWith({ path: "/admin/users/5", method: "PUT", body: { role: "teacher", subject: "Математика" } }));
  await user.selectOptions(form.getByLabelText("Роль"), "student");
  expect(form.queryByLabelText("Предмет")).not.toBeInTheDocument();
  expect(form.getByLabelText("Класс")).toBeRequired();
});

it("explains a forbidden preschool transition from the API", async () => {
  const user = userEvent.setup();
  render(<UsersPage />);
  const form = within(screen.getByRole("button", { name: "Сохранить изменения" }).closest("form")!);
  await user.type(form.getByLabelText("ID пользователя"), "5");
  await user.selectOptions(form.getByLabelText("Роль"), "teacher");
  await user.type(form.getByLabelText("Предмет"), "Математика");
  request.mockRejectedValueOnce({ code: "role_transition_not_allowed" });
  await user.click(form.getByRole("button", { name: "Сохранить изменения" }));
  expect(await screen.findByText(/Дошкольник может перейти только в ученика:/)).toBeInTheDocument();
});

const account = (id: number, verified: boolean): UserRead => ({
  id, login: `student${id}`, email: `student${id}@example.test`, role: "student", is_active: true,
  is_email_verified: verified, must_change_password: false, is_moderator: false,
  moderator_requested: false, created_at: "2026-09-01T10:00:00Z", surname: "Иванов", name: "Иван",
  class_grade: 5, school_status: "selected", coins: 0, subscription: 0
}) as UserRead;

it("places account deletion last and removes the session history block", () => {
  const { container } = render(<UsersPage />);
  const page = container.querySelector(".admin-users-page")!;
  expect(page.lastElementChild).toBe(screen.getByRole("region", { name: "Удаление пользователей" }));
  expect(screen.queryByRole("heading", { name: "Последние изменения" })).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Таблица пользователей" })).toHaveClass("admin-directory-table");
  expect(screen.getByLabelText("ID")).not.toBe(screen.getByLabelText("ID пользователя"));
});

it("verifies only an unverified email with the existing admin endpoint and refreshes the row", async () => {
  let rows = [account(5, false), account(6, true)];
  request.mockImplementation(async ({ path, method, body }) => {
    if (path === "/admin/users/5" && method === "PUT") {
      rows = rows.map((row) => row.id === 5 ? { ...row, ...body } : row);
      return rows[0];
    }
    if (path.startsWith("/admin/users/count")) return rows.length;
    if (path.startsWith("/admin/users?")) return rows;
    return [];
  });
  const user = userEvent.setup();
  render(<UsersPage />);
  const verify = await screen.findByRole("button", { name: "Ver.email: student5 (#5)" });
  expect(verify).toBeEnabled();
  expect(screen.getByRole("button", { name: "Ver.email: student6 (#6)" })).toBeDisabled();
  expect(verify.closest("td")!.nextElementSibling).toHaveTextContent("5");
  await user.click(verify);
  await waitFor(() => expect(request).toHaveBeenCalledWith({
    path: "/admin/users/5", method: "PUT", body: { is_email_verified: true }
  }));
  expect(await screen.findByText("Email пользователя #5 (student5) подтверждён.")).toBeInTheDocument();
  expect(await screen.findByRole("button", { name: "Ver.email: student5 (#5)" })).toBeDisabled();
});

it("keeps an email unverified when saving fails", async () => {
  request.mockImplementation(async ({ path, method }) => {
    if (method === "PUT") throw { code: "server_error" };
    if (path.startsWith("/admin/users/count")) return 1;
    if (path.startsWith("/admin/users?")) return [account(5, false)];
    return [];
  });
  const user = userEvent.setup();
  render(<UsersPage />);
  await user.click(await screen.findByRole("button", { name: "Ver.email: student5 (#5)" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось подтвердить email пользователя #5");
  expect(screen.getByRole("button", { name: "Ver.email: student5 (#5)" })).toBeEnabled();
});

it("generates AND sets a password by the ID in the password block, independently of the edit form", async () => {
  request.mockImplementation(async ({ path }) => path.endsWith("/temp-password/generate")
    ? { temp_password: "TestOnlyPass123" } : path.includes("/count") ? 0 : []);
  const user = userEvent.setup();
  render(<UsersPage />);
  const edit = within(screen.getByRole("button", { name: "Сохранить изменения" }).closest("form")!);
  await user.type(edit.getByLabelText("ID пользователя"), "99");
  const block = within(screen.getByRole("region", { name: "Временный пароль" }));
  await user.type(block.getByLabelText("ID пользователя для временного пароля"), "5");
  await user.click(block.getByRole("button", { name: "Сгенерировать и установить" }));
  await waitFor(() => expect(request).toHaveBeenCalledWith({ path: "/admin/users/5/temp-password/generate", method: "POST" }));
  expect(await block.findByLabelText("Сгенерированный временный пароль")).toHaveValue("TestOnlyPass123");
  expect(block.getByRole("status")).toHaveTextContent("установлен пользователю #5");
  await user.clear(block.getByLabelText("ID пользователя для временного пароля"));
  expect(block.queryByLabelText("Сгенерированный временный пароль")).not.toBeInTheDocument();
});

it("sets a manually entered password by its own user ID", async () => {
  const user = userEvent.setup();
  render(<UsersPage />);
  const block = within(screen.getByRole("region", { name: "Временный пароль" }));
  await user.type(block.getByLabelText("ID пользователя для временного пароля"), "6");
  await user.type(block.getByLabelText("Новый временный пароль"), "TestOnlyPass123");
  await user.click(block.getByRole("button", { name: "Установить" }));
  await waitFor(() => expect(request).toHaveBeenCalledWith({ path: "/admin/users/6/temp-password", method: "POST", body: { temp_password: "TestOnlyPass123" } }));
  expect(block.getByRole("status")).toHaveTextContent("установлен пользователю #6");
  expect(block.getByLabelText("Новый временный пароль")).toHaveValue("");
});

it("rejects an invalid password target ID locally and displays not-found errors in its block", async () => {
  const user = userEvent.setup();
  render(<UsersPage />);
  const block = within(screen.getByRole("region", { name: "Временный пароль" }));
  await user.type(block.getByLabelText("ID пользователя для временного пароля"), "0");
  await user.click(block.getByRole("button", { name: "Сгенерировать и установить" }));
  expect(block.getByRole("alert")).toHaveTextContent("положительный целочисленный ID");
  expect(request.mock.calls.some(([options]) => options.method === "POST")).toBe(false);
  await user.clear(block.getByLabelText("ID пользователя для временного пароля"));
  await user.type(block.getByLabelText("ID пользователя для временного пароля"), "404");
  request.mockRejectedValueOnce({ code: "user_not_found" });
  await user.click(block.getByRole("button", { name: "Сгенерировать и установить" }));
  expect(await block.findByRole("alert")).toHaveTextContent("Пользователь с таким ID не найден.");
});
