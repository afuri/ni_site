import { createAuthStorage } from "@utils";

export function createMainAuthStorage() {
  return createAuthStorage({
    tokensKey: "ni_main_tokens",
    userKey: "ni_main_user",
    storage: typeof window !== "undefined" ? window.sessionStorage : undefined
  });
}
