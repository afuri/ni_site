import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { CabinetPage } from "../CabinetPage";

const mockRequest = vi.fn();
let mockUser = {
  id: 1,
  login: "student01",
  email: "student01@example.com",
  role: "student",
  is_active: true,
  is_email_verified: false,
  must_change_password: false,
  is_moderator: false,
  moderator_requested: false,
  surname: "Иванов",
  name: "Иван",
  father_name: null,
  country: "Россия",
  city: "Москва",
  school: "Лицей",
  class_grade: 7,
  subject: null
};

vi.mock("@api", () => ({
  createApiClient: () => ({
    request: mockRequest
  })
}));

vi.mock("@ui", async () => {
  const actual = await vi.importActual<typeof import("@ui")>("@ui");
  return {
    ...actual,
    useAuth: () => ({
      status: "authenticated",
      user: mockUser,
      tokens: { access_token: "access", refresh_token: "refresh", token_type: "bearer" },
      setSession: vi.fn(),
      signOut: vi.fn()
    })
  };
});

describe("CabinetPage", () => {
  beforeEach(() => {
    mockRequest.mockReset();
  });

  it("shows email verification warning for unverified user", async () => {
    mockUser = {
      ...mockUser,
      role: "student",
      is_email_verified: false
    };
    mockRequest.mockResolvedValueOnce([]);

    render(
      <MemoryRouter>
        <CabinetPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole("dialog", { name: "Подтвердите email" })).toBeInTheDocument();
  });

  it("renders student results table", async () => {
    mockUser = {
      ...mockUser,
      role: "student",
      is_email_verified: true
    };
    mockRequest.mockResolvedValueOnce([
      {
        attempt_id: 10,
        olympiad_id: 1,
        status: "submitted",
        score_total: 8,
        score_max: 10,
        graded_at: "2026-01-05T10:05:00Z"
      }
    ]);

    render(
      <MemoryRouter>
        <CabinetPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Олимпиада #1")).toBeInTheDocument();
    expect(screen.getByText("8/10")).toBeInTheDocument();
  });

  it("renders teacher student list", async () => {
    mockUser = {
      ...mockUser,
      role: "teacher",
      is_email_verified: true
    };
    mockRequest.mockResolvedValueOnce([
      {
        id: 1,
        teacher_id: 2,
        student_id: 3,
        status: "confirmed",
        created_at: "2026-01-05T10:00:00Z",
        confirmed_at: "2026-01-05T10:02:00Z"
      }
    ]);

    render(
      <MemoryRouter>
        <CabinetPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Ученик #3")).toBeInTheDocument();
  });
});
