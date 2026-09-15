import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SchoolsPage } from "../SchoolsPage";

const { mockRequest } = vi.hoisted(() => ({ mockRequest: vi.fn() }));

vi.mock("../../lib/adminClient", () => ({
  adminApiClient: { request: mockRequest }
}));

const school = {
  id: 10,
  city_id: 2,
  city_name: "Москва",
  region_id: 1,
  region_name: "Москва",
  user_count: 7,
  full_name: "ГБОУ Лицей № 1",
  short_name: "Лицей № 1",
  address: "Улица, 1",
  url: null,
  email: null,
  is_sirius: true,
  is_consortium: false,
  is_peterson: true,
  is_partner: false,
  is_platform: false,
  curator: null,
  info: null,
  is_active: true
};

const submission = {
  id: 5,
  user_id: 17,
  region_id: 1,
  country_name: null,
  region_name: "Москва",
  city_name: "Москва",
  school_short_name: "Лицей 1",
  school_full_name: "ГБОУ Лицей 1",
  address: null,
  url: "www.school.ru",
  email: null,
  status: "pending",
  admin_comment: null,
  resolved_school_id: null,
  created_at: "2026-09-14T00:00:00Z"
};

describe("SchoolsPage", () => {
  beforeEach(() => {
    Object.defineProperty(window, "scrollTo", { configurable: true, value: vi.fn() });
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:schools") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    Object.defineProperty(HTMLAnchorElement.prototype, "click", { configurable: true, value: vi.fn() });
    mockRequest.mockReset();
    mockRequest.mockImplementation(async ({ path, method, body }) => {
      if (path.startsWith("/lookup/regions")) return [{ id: 1, name: "Москва", country_code: "RU", is_other: false }];
      if (path.startsWith("/admin/schools/cities")) return [{ id: 2, region_id: 1, name: "Москва", is_active: true }];
      if (path.startsWith("/admin/schools/summary")) return { total_count: 101 };
      if (path.startsWith("/admin/school-submissions/count")) return 1;
      if (path.startsWith("/admin/school-submissions?") && method === "GET") return [submission];
      if (path.startsWith("/lookup/schools?")) return [{ id: 10, short_name: "Лицей № 1", full_name: "ГБОУ Лицей № 1", city: "Москва" }];
      if (path === "/admin/schools" && method === "POST") return school;
      if (path.startsWith("/admin/schools?") && method === "GET") return [school];
      if (path === "/admin/schools/10" && method === "PATCH") return { ...school, ...body };
      if (path.endsWith("/approve") || path.endsWith("/reject")) return { submission: { ...submission, status: "approved" } };
      return [];
    });
  });

  it("uses server pagination and sends filters to list and count", async () => {
    const user = userEvent.setup();
    render(<SchoolsPage />);
    expect(await screen.findByText("Лицей № 1")).toBeInTheDocument();
    const tables = screen.getAllByRole("table");
    expect(within(tables[0]).getAllByRole("columnheader")[0]).toHaveTextContent("Действие");
    expect(within(tables[1]).getAllByRole("columnheader")[0]).toHaveTextContent("Действие");
    expect(within(screen.getByRole("button", { name: "Изменить" }).closest("tr") as HTMLElement).getAllByRole("cell")[0]).toContainElement(
      screen.getByRole("button", { name: "Изменить" })
    );
    expect(within(screen.getByRole("button", { name: "Открыть" }).closest("tr") as HTMLElement).getAllByRole("cell")[0]).toContainElement(
      screen.getByRole("button", { name: "Открыть" })
    );
    expect(mockRequest.mock.calls.some(([args]) => args.path.includes("limit=50") && args.path.includes("offset=0"))).toBe(true);

    await user.type(screen.getByLabelText("Название"), "лицей");
    await user.click(screen.getByRole("button", { name: "Применить фильтры" }));
    await waitFor(() => expect(mockRequest.mock.calls.some(([args]) => args.path.startsWith("/admin/schools/summary?") && args.path.includes("query="))).toBe(true));

    const next = screen.getAllByRole("button", { name: "Вперёд" }).find((button) => !button.hasAttribute("disabled"));
    expect(next).toBeDefined();
    await user.click(next as HTMLButtonElement);
    await waitFor(() => expect(mockRequest.mock.calls.some(([args]) => args.path.includes("offset=50"))).toBe(true));

    const schoolsSection = screen.getByRole("heading", { name: "Справочник школ" }).closest("section") as HTMLElement;
    await user.click(within(schoolsSection).getByRole("button", { name: "В конец" }));
    await waitFor(() => expect(mockRequest.mock.calls.some(([args]) => args.path.includes("offset=100"))).toBe(true));
    const firstPageRequestsBefore = mockRequest.mock.calls.filter(([args]) => args.path.includes("limit=50") && args.path.includes("offset=0")).length;
    await user.click(within(schoolsSection).getByRole("button", { name: "В начало" }));
    await waitFor(() => expect(mockRequest.mock.calls.filter(([args]) => args.path.includes("limit=50") && args.path.includes("offset=0")).length).toBeGreaterThan(firstPageRequestsBefore));
  });

  it("downloads the complete school directory as CSV", async () => {
    const user = userEvent.setup();
    render(<SchoolsPage />);
    await user.click(await screen.findByRole("button", { name: "Скачать CSV" }));

    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1));
    expect(mockRequest.mock.calls.some(([args]) => args.path === "/admin/schools?limit=500&offset=0")).toBe(true);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:schools");
  });

  it("edits all canonical school fields including consortium flags", async () => {
    const user = userEvent.setup();
    render(<SchoolsPage />);
    await user.click(await screen.findByRole("button", { name: "Изменить" }));
    const dialog = screen.getByRole("dialog", { name: "Редактирование школы #10" });
    await user.click(dialog.parentElement as HTMLElement);
    expect(dialog).toBeInTheDocument();
    await user.click(within(dialog).getByRole("checkbox", { name: "Consortium" }));
    await user.click(within(dialog).getByRole("button", { name: "Сохранить" }));

    await waitFor(() => {
      const call = mockRequest.mock.calls.find(([args]) => args.path === "/admin/schools/10" && args.method === "PATCH");
      expect(call?.[0].body).toMatchObject({
        city_id: 2,
        short_name: "Лицей № 1",
        address: "Улица, 1",
        is_consortium: true,
        is_peterson: true,
        is_sirius: true
      });
    });
    expect(screen.queryByRole("dialog", { name: "Редактирование школы #10" })).toBeNull();
  });

  it("opens school creation in a modal that closes only from its cross or an action", async () => {
    const user = userEvent.setup();
    render(<SchoolsPage />);
    await user.click(await screen.findByRole("button", { name: "Добавить школу" }));
    const dialog = screen.getByRole("dialog", { name: "Добавление школы" });

    expect(within(dialog).getByLabelText("Регион")).toBeInTheDocument();
    await user.click(dialog.parentElement as HTMLElement);
    expect(dialog).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Close modal" }));
    expect(screen.queryByRole("dialog", { name: "Добавление школы" })).toBeNull();
  });

  it("approves a submission by linking an existing canonical school", async () => {
    const user = userEvent.setup();
    render(<SchoolsPage />);
    await user.click(await screen.findByRole("button", { name: "Открыть" }));
    const dialog = await screen.findByRole("dialog", { name: "Заявка #5" });
    expect(within(dialog).getByText(/Пользователь #17: Москва, Лицей 1/)).toBeInTheDocument();
    await user.click(dialog.parentElement as HTMLElement);
    expect(dialog).toBeInTheDocument();
    const candidate = await within(dialog).findByRole("button", { name: /#10 Лицей № 1.*Москва/i }, { timeout: 1200 });
    await user.click(candidate);
    await user.click(within(dialog).getByRole("button", { name: "Одобрить" }));
    await waitFor(() => expect(mockRequest).toHaveBeenCalledWith(expect.objectContaining({
      path: "/admin/school-submissions/5/approve",
      method: "POST",
      body: { existing_school_id: 10 }
    })));
  });

  it("lets the administrator verify country and city before creating a school", async () => {
    const user = userEvent.setup();
    render(<SchoolsPage />);
    await user.click(await screen.findByRole("button", { name: "Открыть" }));
    await user.click(screen.getByLabelText("Создать новую"));

    const countryInput = screen.getByRole("textbox", { name: "Страна" });
    const cityInput = screen.getByRole("textbox", { name: "Город" });
    expect(countryInput).toHaveValue("Россия");
    expect(cityInput).toHaveValue("Москва");
    await user.clear(cityInput);
    await user.type(cityInput, "Новый Город");
    const reviewAddress = screen.getAllByLabelText("Адрес").at(-1);
    expect(reviewAddress).toBeDefined();
    await user.type(reviewAddress as HTMLInputElement, "Школьная улица, 1");
    await user.click(screen.getByRole("button", { name: "Проверить и одобрить" }));

    await waitFor(() => expect(mockRequest).toHaveBeenCalledWith(expect.objectContaining({
      path: "/admin/school-submissions/5/approve",
      method: "POST",
      body: expect.objectContaining({
        new_school: expect.objectContaining({
          country_name: "Россия",
          city_name: "Новый Город"
        })
      })
    })));
  });
});
