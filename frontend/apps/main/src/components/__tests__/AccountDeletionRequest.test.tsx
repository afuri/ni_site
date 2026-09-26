import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { ApiClient } from "@api";
import { AccountDeletionRequest } from "../AccountDeletionRequest";

it("requires confirmation, allows cancellation and never deletes the account directly", async () => {
  const request = vi.fn(async ({ method }) => method === "POST" ? { id: 7 } : null);
  const user = userEvent.setup();
  render(<AccountDeletionRequest client={{ request } as unknown as ApiClient} />);
  const start = screen.getByRole("button", { name: "Подать заявку на удаление аккаунта" });
  await waitFor(() => expect(start).toBeEnabled());
  await user.click(start);
  expect(request.mock.calls.some(([call]) => call.method === "POST")).toBe(false);
  await user.click(screen.getByRole("button", { name: "Не удалять" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await user.click(start);
  await user.click(screen.getByRole("button", { name: "Подтвердить отправку заявки" }));
  const cancel = await screen.findByRole("button", { name: "Отменить заявку на удаление" });
  expect(request).toHaveBeenCalledWith({ path: "/users/me/deletion-request", method: "POST", body: { confirmed: true } });
  await user.click(cancel);
  expect(await screen.findByRole("button", { name: "Подать заявку на удаление аккаунта" })).toBeEnabled();
  expect(request).toHaveBeenCalledWith({ path: "/users/me/deletion-request", method: "DELETE" });
});
