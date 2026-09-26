import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { TeacherRelation, UserRead } from "@api";
import type { PlatformApi } from "../platformApi";
import { TeacherConnections } from "../TeacherConnections";

const user = { manual_teachers: [] } as unknown as UserRead;
const incoming = {
  id: 4,
  teacher_id: 9,
  student_id: 1,
  status: "pending",
  requested_by: "teacher",
  teacher_surname: "Петров",
  teacher_name: "Пётр",
  teacher_father_name: null,
  teacher_subject: "Математика"
} as TeacherRelation;

describe("TeacherConnections", () => {
  it("loads and confirms an incoming teacher request", async () => {
    const confirmTeacher = vi.fn().mockResolvedValue(incoming);
    const api = {
      getTeachers: vi.fn().mockImplementation((status) => Promise.resolve(status === "pending" ? [incoming] : [])),
      confirmTeacher,
      removeTeacher: vi.fn(), requestTeacher: vi.fn(), updateProfile: vi.fn()
    } as unknown as PlatformApi;
    render(<TeacherConnections api={api} user={user} onUserUpdated={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: "Подтвердить" }));
    expect(confirmTeacher).toHaveBeenCalledWith(9);
  });

  it("persists manually added teachers through the profile endpoint", async () => {
    const updateProfile = vi.fn().mockImplementation(async ({ manual_teachers }) => ({ ...user, manual_teachers }));
    const onUserUpdated = vi.fn();
    const api = {
      getTeachers: vi.fn().mockResolvedValue([]),
      confirmTeacher: vi.fn(), removeTeacher: vi.fn(), requestTeacher: vi.fn(), updateProfile
    } as unknown as PlatformApi;
    render(<TeacherConnections api={api} user={user} onUserUpdated={onUserUpdated} />);
    await waitFor(() => expect(api.getTeachers).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText("ФИО учителя"), { target: { value: "Петров Пётр Петрович" } });
    fireEvent.change(screen.getByLabelText("Предмет"), { target: { value: "Математика" } });
    await userEvent.click(screen.getByRole("button", { name: "Добавить" }));
    expect(updateProfile).toHaveBeenCalledWith({
      manual_teachers: [expect.objectContaining({ full_name: "Петров Пётр Петрович", subject: "Математика" })]
    });
    expect(onUserUpdated).toHaveBeenCalled();
  });
});
