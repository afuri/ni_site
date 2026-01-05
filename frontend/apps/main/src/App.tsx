import "@ui/styles/global.css";
import { AuthProvider } from "@ui";
import { createApiClient } from "@api";
import { createAuthStorage } from "@utils";
import { HomePage } from "./pages/HomePage";

const storage = createAuthStorage({
  tokensKey: "ni_main_tokens",
  userKey: "ni_main_user"
});

const apiClient = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1",
  storage
});

export function App() {
  return (
    <AuthProvider client={apiClient} storage={storage}>
      <HomePage />
    </AuthProvider>
  );
}
