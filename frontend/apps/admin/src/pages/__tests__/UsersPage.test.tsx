import React from "react";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { UsersPage } from "../UsersPage";

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
