import type { UserRead, UserRole } from "@api";

export type AuthRole = UserRole | "moderator" | "guest";

export function resolveRole(user: UserRead | null): AuthRole {
  if (!user) {
    return "guest";
  }
  if (user.role === "admin") {
    return "admin";
  }
  if (user.role === "teacher" && user.is_moderator) {
    return "moderator";
  }
  return user.role;
}

export function canAccessRole(user: UserRead | null, allowed: AuthRole[]): boolean {
  if (allowed.length === 0) {
    return true;
  }

  const role = resolveRole(user);

  if (role === "admin") {
    return true;
  }

  if (role === "moderator") {
    return allowed.includes("moderator") || allowed.includes("teacher");
  }

  return allowed.includes(role);
}
