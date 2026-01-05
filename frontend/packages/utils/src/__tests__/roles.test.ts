import { canAccessRole, resolveRole } from "@utils";
import type { UserRead } from "@api";
import { describe, expect, it } from "vitest";

const baseUser: UserRead = {
  id: 1,
  login: "teacher",
  email: "teacher@example.com",
  role: "teacher",
  is_active: true,
  is_email_verified: true,
  must_change_password: false,
  is_moderator: false,
  moderator_requested: false,
  surname: "Петров",
  name: "Петр",
  father_name: null,
  country: "Россия",
  city: "Казань",
  school: "Лицей",
  class_grade: null,
  subject: "math"
};

describe("roles", () => {
  it("resolves guest when no user", () => {
    expect(resolveRole(null)).toBe("guest");
  });

  it("resolves moderator when teacher has moderator flag", () => {
    expect(resolveRole({ ...baseUser, is_moderator: true })).toBe("moderator");
  });

  it("resolves admin for admin role", () => {
    expect(resolveRole({ ...baseUser, role: "admin" })).toBe("admin");
  });

  it("allows admin to access any role", () => {
    const admin = { ...baseUser, role: "admin" };
    expect(canAccessRole(admin, ["student"])).toBe(true);
  });

  it("allows moderator to access teacher routes", () => {
    const moderator = { ...baseUser, is_moderator: true };
    expect(canAccessRole(moderator, ["teacher"])).toBe(true);
  });

  it("denies guest when role is required", () => {
    expect(canAccessRole(null, ["student"])).toBe(false);
  });
});
