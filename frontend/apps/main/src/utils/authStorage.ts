import { createAuthStorage } from "@utils";
import type { TokenPair } from "@api";

export function createMainAuthStorage() {
  const storage = createAuthStorage({ tokensKey: "ni_main_session", userKey: "ni_main_user" });
  // Migrate only matching old tokens; never join different accounts.
  try {
    if (!storage.getTokens() && typeof window !== "undefined") {
      const access = JSON.parse(sessionStorage.getItem("ni_main_access_token") ?? "null");
      const refresh = JSON.parse(localStorage.getItem("ni_main_refresh_token") ?? "null");
      const subject = (token: string) => JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).sub;
      if (access?.access_token && refresh?.refresh_token && subject(access.access_token) === subject(refresh.refresh_token)) {
        storage.setTokens({ ...access, ...refresh, token_type: "bearer" } as TokenPair);
      }
    }
  } catch { /* Invalid legacy storage requires a normal sign-in. */ }
  try {
    sessionStorage.removeItem("ni_main_access_token");
    sessionStorage.removeItem("ni_main_tokens");
    sessionStorage.removeItem("ni_main_user");
    localStorage.removeItem("ni_main_refresh_token");
  } catch { /* Storage may be disabled. */ }
  return storage;
}
