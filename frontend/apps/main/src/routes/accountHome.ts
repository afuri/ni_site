import type { UserRead, UserRole } from "@api";

export const LOGIN_REDIRECT_KEY = "ni_login_redirect";

type RoleSource = UserRole | Pick<UserRead, "role"> | null | undefined;

export function getAccountHomePath(source: RoleSource): "/platform" | "/cabinet" {
  const role = typeof source === "string" ? source : source?.role;
  return role === "student" ? "/platform" : "/cabinet";
}
