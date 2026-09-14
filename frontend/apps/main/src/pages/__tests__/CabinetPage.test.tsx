import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { UserRead } from "@api";
import { CabinetPage } from "../CabinetPage";

const mockRequest = vi.fn();
const mockGetSchoolSubmission = vi.fn();
const mockCreateSchoolSubmission = vi.fn();
const mockMe = vi.fn();
const mockSetSession = vi.fn();
const mockSignOut = vi.fn();
const mockLookupRegions = vi.fn().mockResolvedValue([
  { id: 1, name: "Москва", country_code: "RU", is_other: false }
]);
const mockLookupSchools = vi.fn().mockResolvedValue([]);
const mockTokens = { access_token: "access", refresh_token: "refresh", token_type: "bearer" as const };
const mockApiClient = {
  request: mockRequest,
  auth: { me: mockMe },
  lookup: {
    regions: mockLookupRegions,
    schools: mockLookupSchools
  },
  schoolSubmissions: {
    getMine: mockGetSchoolSubmission,
    create: mockCreateSchoolSubmission
  }
};
const baseUser: UserRead = {
  id: 1,
  login: "student01",
  email: "student01@example.com",
  role: "student",
  is_active: true,
  is_email_verified: false,
  must_change_password: false,
  is_moderator: false,
  moderator_requested: false,
  created_at: "2026-01-01T00:00:00Z",
  surname: "Иванов",
  name: "Иван",
  father_name: null,
  country: "Россия",
  city: "Москва",
  school: "Лицей",
  region_id: 1,
  region_name: "Москва",
  school_id: 10,
  school_short_name: "Лицей",
  school_full_name: "ГБОУ Лицей",
  city_name: "Москва",
  school_status: "selected",
  coins: 0,
  class_grade: 7,
  gender: "male",
  subscription: 0,
  manual_teachers: [],
  subject: null
};
let mockUser: UserRead = { ...baseUser };

vi.mock("@api", () => ({
  createApiClient: () => mockApiClient
}));

vi.mock("@ui", async () => {
  const actual = await vi.importActual<typeof import("@ui")>("@ui");
  return {
    ...actual,
    useAuth: () => ({
      status: "authenticated",
      user: mockUser,
      tokens: mockTokens,
      setSession: mockSetSession,
      signOut: mockSignOut
    })
  };
});

describe("CabinetPage", () => {
  beforeEach(() => {
    mockLookupRegions.mockResolvedValue([
      { id: 1, name: "Москва", country_code: "RU", is_other: false }
    ]);
    mockUser = { ...baseUser };
    mockRequest.mockReset();
    mockGetSchoolSubmission.mockReset();
    mockGetSchoolSubmission.mockResolvedValue(null);
    mockCreateSchoolSubmission.mockReset();
    mockMe.mockReset();
    mockMe.mockImplementation(async () => mockUser);
    mockSetSession.mockReset();
    mockSignOut.mockReset();
  });

  it("shows email verification warning for unverified user", async () => {
    mockUser = {
      ...mockUser,
      role: "student",
      is_email_verified: false
    };
    mockRequest.mockImplementation(({ path }) => {
      if (path.startsWith("/attempts/results/my")) {
        return Promise.resolve([]);
      }
      if (path.startsWith("/student/teachers?status=confirmed")) {
        return Promise.resolve([]);
      }
      if (path.startsWith("/student/teachers?status=pending")) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

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
    mockRequest.mockImplementation(({ path }) => {
      if (path.startsWith("/attempts/results/my")) {
        return Promise.resolve([
          {
            attempt_id: 10,
            olympiad_id: 1,
            status: "submitted",
            score_total: 8,
            score_max: 10,
            graded_at: "2026-01-05T10:05:00Z",
            results_released: true
          }
        ]);
      }
      if (path.startsWith("/student/teachers?status=confirmed")) {
        return Promise.resolve([]);
      }
      if (path.startsWith("/student/teachers?status=pending")) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

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
    mockRequest.mockImplementation(({ path }) => {
      if (path.startsWith("/teacher/students?status=confirmed")) {
        return Promise.resolve([
          {
            id: 1,
            teacher_id: 2,
            student_id: 3,
            status: "confirmed",
            created_at: "2026-01-05T10:00:00Z",
            confirmed_at: "2026-01-05T10:02:00Z",
            student_surname: "Иванов",
            student_name: "Иван",
            student_father_name: null,
            student_class_grade: 7,
            teacher_subject: null
          }
        ]);
      }
      if (path.startsWith("/teacher/students?status=pending")) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    render(
      <MemoryRouter>
        <CabinetPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Иванов Иван")).toBeInTheDocument();
  });

  it("opens delete confirmation for teacher entry", async () => {
    mockUser = {
      ...mockUser,
      role: "student",
      is_email_verified: true
    };
    mockRequest.mockImplementation(({ path }) => {
      if (path.startsWith("/attempts/results/my")) {
        return Promise.resolve([]);
      }
      if (path.startsWith("/student/teachers?status=confirmed")) {
        return Promise.resolve([
          {
            id: 11,
            teacher_id: 5,
            student_id: 1,
            status: "confirmed",
            created_at: "2026-01-05T10:00:00Z",
            confirmed_at: "2026-01-05T10:02:00Z",
            teacher_surname: "Петров",
            teacher_name: "Петр",
            teacher_father_name: null,
            teacher_subject: "Алгебра"
          }
        ]);
      }
      if (path.startsWith("/student/teachers?status=pending")) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });

    render(
      <MemoryRouter>
        <CabinetPage />
      </MemoryRouter>
    );

    const userEventApi = userEvent.setup();
    const deleteButton = await screen.findByRole("button", { name: "Удалить Петров Петр" });
    await userEventApi.click(deleteButton);

    expect(screen.getByRole("dialog", { name: "Удаление" })).toBeInTheDocument();
    expect(
      screen.getByText("Вы действительно хотите удалить Петров Петр из списка сопровождения")
    ).toBeInTheDocument();
  });

  it("allows updating gender in profile", async () => {
    mockUser = {
      ...baseUser,
      role: "student",
      is_email_verified: true,
      gender: "male"
    };
    mockRequest.mockImplementation(async ({ path, method, body }) => {
      if (path.startsWith("/attempts/results/my")) {
        return [];
      }
      if (path.startsWith("/student/teachers?status=confirmed")) {
        return [];
      }
      if (path.startsWith("/student/teachers?status=pending")) {
        return [];
      }
      if (path === "/users/me" && method === "PUT") {
        return {
          ...mockUser,
          ...body,
          class_grade: body.class_grade,
          gender: body.gender
        };
      }
      return [];
    });

    render(
      <MemoryRouter>
        <CabinetPage />
      </MemoryRouter>
    );

    const userEventApi = userEvent.setup();
    await userEventApi.click(screen.getByRole("button", { name: /Личные данные/i }));
    const femaleRadio = await screen.findByLabelText("Жен");
    await userEventApi.click(femaleRadio);
    await userEventApi.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(await screen.findByText("Данные сохранены.")).toBeInTheDocument();
    const updateCall = mockRequest.mock.calls.find(
      ([args]) => args.path === "/users/me" && args.method === "PUT"
    );
    expect(updateCall?.[0].body.gender).toBe("female");
    expect(updateCall?.[0].body).not.toHaveProperty("region_id");
    expect(updateCall?.[0].body).not.toHaveProperty("school_id");
    expect(updateCall?.[0].body).not.toHaveProperty("school_not_found");
  });

  it("locks confirmed region and school in the personal cabinet", async () => {
    mockUser = {
      ...baseUser,
      is_email_verified: true,
      school_status: "selected"
    };
    mockRequest.mockResolvedValue([]);

    render(
      <MemoryRouter>
        <CabinetPage />
      </MemoryRouter>
    );

    const userEventApi = userEvent.setup();
    await userEventApi.click(screen.getByRole("button", { name: /Личные данные/i }));

    expect(await screen.findByLabelText("Регион")).toBeDisabled();
    expect(screen.getByLabelText("Школа")).toBeDisabled();
    expect(
      screen.getByText("Регион и школа подтверждены. Изменить их может только администратор.")
    ).toBeInTheDocument();
  });

  it("shows the missing-school banner and opens a separate submission form", async () => {
    mockUser = {
      ...baseUser,
      is_email_verified: true,
      school: null,
      school_id: null,
      school_short_name: null,
      school_full_name: null,
      city: null,
      city_name: null,
      school_status: "missing"
    };
    mockRequest.mockResolvedValue([]);
    mockCreateSchoolSubmission.mockResolvedValue({ id: 9, status: "pending" });
    const userEventApi = userEvent.setup();
    render(
      <MemoryRouter>
        <CabinetPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Укажите свою школу")).toBeInTheDocument();
    await userEventApi.click(screen.getByRole("button", { name: "Добавить школу" }));
    expect(screen.getByRole("dialog", { name: "Добавление школы" })).toBeInTheDocument();
    await userEventApi.type(screen.getByLabelText("Город"), "Москва");
    await userEventApi.type(screen.getByLabelText("Краткое название школы"), "Лицей");
    await userEventApi.click(screen.getByRole("button", { name: "Отправить заявку" }));

    expect(mockCreateSchoolSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ city_name: "Москва", school_short_name: "Лицей" })
    );
  });

  it("shows pending status and disables diploma download", async () => {
    mockUser = {
      ...baseUser,
      is_email_verified: true,
      school: null,
      school_id: null,
      school_short_name: null,
      school_full_name: null,
      city: null,
      city_name: null,
      school_status: "submission_pending"
    };
    mockGetSchoolSubmission.mockResolvedValue({
      id: 2,
      status: "pending",
      city_name: "Москва",
      school_short_name: "Лицей"
    });
    mockRequest.mockImplementation(({ path }) =>
      path.startsWith("/attempts/results/my")
        ? Promise.resolve([
            {
              attempt_id: 10,
              olympiad_id: 1,
              status: "submitted",
              score_total: 8,
              score_max: 10,
              graded_at: "2026-01-05T10:05:00Z",
              results_released: true
            }
          ])
        : Promise.resolve([])
    );
    render(
      <MemoryRouter>
        <CabinetPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Заявка на школу рассматривается")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Недоступен" })).toBeDisabled();
  });

  it("shows the administrator comment for a rejected submission", async () => {
    mockUser = {
      ...baseUser,
      is_email_verified: true,
      school: null,
      school_id: null,
      school_short_name: null,
      school_full_name: null,
      city: null,
      city_name: null,
      school_status: "submission_rejected"
    };
    mockGetSchoolSubmission.mockResolvedValue({
      id: 3,
      status: "rejected",
      admin_comment: "Уточните полное название.",
      city_name: "Москва",
      school_short_name: "Лицей"
    });
    mockRequest.mockResolvedValue([]);
    render(
      <MemoryRouter>
        <CabinetPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Комментарий администратора: Уточните полное название.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Исправить заявку" })).toBeInTheDocument();
  });

  it("does not show a school warning when school is not required", async () => {
    mockUser = {
      ...baseUser,
      is_email_verified: true,
      class_grade: 0,
      school: null,
      school_id: null,
      school_short_name: null,
      school_full_name: null,
      city: null,
      city_name: null,
      school_status: "not_required"
    };
    mockRequest.mockResolvedValue([]);
    render(
      <MemoryRouter>
        <CabinetPage />
      </MemoryRouter>
    );

    expect(screen.queryByText("Укажите свою школу")).toBeNull();
    expect(screen.queryByText("Заявка на школу рассматривается")).toBeNull();
  });
});
