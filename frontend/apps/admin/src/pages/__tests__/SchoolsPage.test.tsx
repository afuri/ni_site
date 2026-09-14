import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
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
  school_full_name: null,
  address: null,
  url: null,
  email: null,
  status: "pending",
  admin_comment: null,
  resolved_school_id: null,
  created_at: "2026-09-14T00:00:00Z"
};

describe("SchoolsPage", () => {
  beforeEach(() => {
    Object.defineProperty(window, "scrollTo", { configurable: true, value: vi.fn() });
    mockRequest.mockReset();
    mockRequest.mockImplementation(async ({ path, method, body }) => {
      if (path.startsWith("/lookup/regions")) return [{ id: 1, name: "Москва", country_code: "RU", is_other: false }];
      if (path.startsWith("/admin/schools/cities")) return [{ id: 2, region_id: 1, name: "Москва", is_active: true }];
      if (path.startsWith("/admin/schools/summary")) return { total_count: 101 };
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
    expect(mockRequest.mock.calls.some(([args]) => args.path.includes("limit=50") && args.path.includes("offset=0"))).toBe(true);

    await user.type(screen.getByLabelText("Название"), "лицей");
    await user.click(screen.getByRole("button", { name: "Применить фильтры" }));
    await waitFor(() => expect(mockRequest.mock.calls.some(([args]) => args.path.startsWith("/admin/schools/summary?") && args.path.includes("query="))).toBe(true));

    const next = screen.getAllByRole("button", { name: "Вперёд" }).find((button) => !button.hasAttribute("disabled"));
    expect(next).toBeDefined();
    await user.click(next as HTMLButtonElement);
    await waitFor(() => expect(mockRequest.mock.calls.some(([args]) => args.path.includes("offset=50"))).toBe(true));
  });

  it("edits all canonical school fields including consortium flags", async () => {
    const user = userEvent.setup();
    render(<SchoolsPage />);
    await user.click(await screen.findByRole("button", { name: "Изменить" }));
    await user.click(screen.getByRole("checkbox", { name: "Consortium" }));
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

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
  });

  it("approves a submission by linking an existing canonical school", async () => {
    const user = userEvent.setup();
    render(<SchoolsPage />);
    await user.click(await screen.findByRole("button", { name: "Открыть" }));
    const candidate = await screen.findByRole("button", { name: /#10 Лицей № 1.*Москва/i }, { timeout: 1200 });
    await user.click(candidate);
    await user.click(screen.getByRole("button", { name: "Одобрить" }));
    await waitFor(() => expect(mockRequest).toHaveBeenCalledWith(expect.objectContaining({
      path: "/admin/school-submissions/5/approve",
      method: "POST",
      body: { existing_school_id: 10 }
    })));
  });
});
