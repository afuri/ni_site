import type { ApiClient } from "@api";
import { describe, expect, it, vi } from "vitest";
import { createPlatformApi } from "../platformApi";

describe("createPlatformApi", () => {
  it("uses only the confirmed platform endpoints", async () => {
    const request = vi.fn().mockResolvedValue([]);
    const getMine = vi.fn().mockResolvedValue(null);
    const create = vi.fn().mockResolvedValue({ id: 1 });
    const api = createPlatformApi({ request, schoolSubmissions: { getMine, create } } as unknown as ApiClient);
    const controller = new AbortController();

    await api.getProfile(controller.signal);
    await api.getOlympiads(controller.signal);
    await api.getMyResults(controller.signal);
    await api.getAnnouncements(controller.signal);
    await api.getAttempt(42, controller.signal);
    await api.getAttemptResult(42, controller.signal);
    await api.assignOlympiad("math");
    await api.startAttempt(7);
    await api.updateProfile({ name: "Иван" });
    await api.requestEmailVerification("student@example.test");
    await api.getTeachers("confirmed");
    await api.requestTeacher("teacher01");
    await api.confirmTeacher(9);
    await api.removeTeacher(9);

    expect(request.mock.calls.map(([options]) => options)).toEqual([
      { path: "/auth/me", method: "GET", signal: controller.signal },
      { path: "/olympiads/my", method: "GET", signal: controller.signal },
      { path: "/attempts/results/my", method: "GET", signal: controller.signal },
      { path: "/users/me/announcements", method: "GET", signal: controller.signal },
      { path: "/attempts/42", method: "GET", signal: controller.signal },
      { path: "/attempts/42/result", method: "GET", signal: controller.signal },
      { path: "/olympiads/assign", method: "POST", body: { subject: "math" } },
      { path: "/attempts/start", method: "POST", body: { olympiad_id: 7 } },
      { path: "/users/me", method: "PUT", body: { name: "Иван" } },
      { path: "/auth/verify/request", method: "POST", auth: false, body: { email: "student@example.test" } },
      { path: "/student/teachers?status=confirmed", method: "GET" },
      { path: "/student/teachers", method: "POST", body: { attach: { teacher_login: "teacher01" } } },
      { path: "/student/teachers/9/confirm", method: "POST" },
      { path: "/student/teachers/9", method: "DELETE" }
    ]);

    await api.getSchoolSubmission();
    await api.createSchoolSubmission({
      city_name: "Москва", school_short_name: "Школа", school_full_name: "Школа",
      url: "school.test"
    });
    expect(getMine).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ city_name: "Москва" }));
  });
});
