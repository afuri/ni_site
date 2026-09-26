import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ApiClient, SchoolSubmission, SchoolStatus, UserRead } from "@api";
import type { PlatformApi } from "../platformApi";
import { StudentProfile } from "../StudentProfile";

const makeUser = (schoolStatus: SchoolStatus, classGrade = 5): UserRead => ({
  id: 1, login: "student01", email: "student@example.test", role: "student",
  is_active: true, is_email_verified: true, must_change_password: false,
  is_moderator: false, moderator_requested: false, created_at: "2026-01-01T00:00:00Z",
  surname: "Иванов", name: "Иван", father_name: "Иванович",
  country: null, city: null, school: null, region_id: 1, region_name: "Москва",
  school_id: schoolStatus === "selected" ? 10 : null,
  school_short_name: schoolStatus === "selected" ? "Школа №1" : null,
  school_full_name: schoolStatus === "selected" ? "ГБОУ Школа №1" : null,
  city_name: schoolStatus === "selected" ? "Москва" : null,
  school_status: schoolStatus, coins: 0, class_grade: classGrade,
  gender: "male", subscription: 0, manual_teachers: [], subject: null
});

const submission = {
  id: 3, user_id: 1, region_id: 1, status: "pending", admin_comment: null,
  resolved_school_id: null, reviewed_by_user_id: null, reviewed_at: null,
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  country_name: null, region_name: null, city_name: "Москва",
  school_short_name: "Школа №2", school_full_name: "ГБОУ Школа №2",
  address: null, url: "www.school.ru", email: null
} as SchoolSubmission;

const replacementSchool = {
  id: 20,
  short_name: "Лицей №2",
  full_name: "ГБОУ Лицей №2",
  city: "Санкт-Петербург"
};

function setup(status: SchoolStatus, classGrade = 5) {
  const user = makeUser(status, classGrade);
  const updateProfile = vi.fn().mockImplementation(async (body) => ({ ...user, ...body }));
  const api = {
    updateProfile,
    requestEmailVerification: vi.fn().mockResolvedValue({ status: "ok" }),
    getSchoolSubmission: vi.fn().mockResolvedValue(status === "submission_pending" || status === "submission_rejected" ? submission : null),
    createSchoolSubmission: vi.fn().mockResolvedValue(submission),
    getProfile: vi.fn().mockResolvedValue({ ...user, school_status: "submission_pending" }),
    getTeachers: vi.fn().mockResolvedValue([]),
    requestTeacher: vi.fn(), confirmTeacher: vi.fn(), removeTeacher: vi.fn()
  } as unknown as PlatformApi;
  const client = {
    lookup: {
      regions: vi.fn().mockResolvedValue([
        { id: 1, name: "Москва", country_code: "RU", is_other: false },
        { id: 2, name: "Санкт-Петербург", country_code: "RU", is_other: false }
      ]),
      schools: vi.fn().mockResolvedValue([replacementSchool])
    }
  } as unknown as ApiClient;
  const onUserUpdated = vi.fn();
  render(<StudentProfile user={user} client={client} api={api} onUserUpdated={onUserUpdated} />);
  return { api, client, updateProfile, onUserUpdated };
}

describe("StudentProfile", () => {
  it.each([
    ["selected", "Школа выбрана"],
    ["missing", "Школа не выбрана"],
    ["submission_pending", "Заявка рассматривается"],
    ["submission_rejected", "Заявка требует исправления"],
    ["not_required", "Школа не требуется"]
  ] as const)("renders %s school state", async (status, label) => {
    setup(status, status === "not_required" ? 0 : 5);
    expect(screen.getByText(label)).toBeInTheDocument();
    if (status === "selected") expect(await screen.findByLabelText("Регион школы")).toBeEnabled();
    if (status === "not_required") expect(screen.getByText("Для дошкольника выбор школы не требуется.")).toBeInTheDocument();
  });

  it("does not overwrite a pending school status when only personal data changes", async () => {
    const { updateProfile } = setup("submission_pending");
    fireEvent.change(screen.getByLabelText("Имя"), { target: { value: "Пётр" } });
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() => expect(updateProfile).toHaveBeenCalled());
    const payload = updateProfile.mock.calls[0][0];
    expect(payload).not.toHaveProperty("region_id");
    expect(payload).not.toHaveProperty("school_id");
    expect(payload).not.toHaveProperty("school_not_found");
  });

  it("allows a student with selected status to change region and school", async () => {
    const { updateProfile } = setup("selected");
    fireEvent.change(await screen.findByLabelText("Регион школы"), { target: { value: "2" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Школа" }), { target: { value: "ли" } });
    fireEvent.click(await screen.findByRole("button", { name: /Лицей №2.*Санкт-Петербург/i }, { timeout: 1200 }));
    await userEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith(expect.objectContaining({
      region_id: 2,
      school_id: 20,
      school_not_found: false
    })));
  });

  it("creates a school submission with the existing payload only", async () => {
    const { api } = setup("missing");
    await userEvent.click(screen.getByRole("button", { name: "Отправить сведения о школе" }));
    fireEvent.change(screen.getByLabelText("Город"), { target: { value: "Москва" } });
    fireEvent.change(screen.getByLabelText("Краткое название школы"), { target: { value: "ГБОУ СОШ №2" } });
    fireEvent.change(screen.getByLabelText("Полное название школы"), { target: { value: "Государственное бюджетное общеобразовательное учреждение школа №2" } });
    fireEvent.change(screen.getByLabelText("Сайт"), { target: { value: "www.school.ru" } });
    await userEvent.click(screen.getByRole("button", { name: "Отправить заявку" }));
    await waitFor(() => expect(api.createSchoolSubmission).toHaveBeenCalledWith({
      country_name: null,
      region_name: null,
      city_name: "Москва",
      school_short_name: "ГБОУ СОШ №2",
      school_full_name: "Государственное бюджетное общеобразовательное учреждение школа №2",
      address: null,
      url: "www.school.ru",
      email: null
    }));
  });
});
