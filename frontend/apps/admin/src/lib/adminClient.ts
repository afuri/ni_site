import { createApiClient } from "@api";
import { createAuthStorage } from "@utils";

export const adminStorage = createAuthStorage({
  tokensKey: "ni_admin_tokens",
  userKey: "ni_admin_user"
});

export const adminApiClient = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? "/api/v1",
  storage: adminStorage
});
