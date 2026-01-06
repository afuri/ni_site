import "@ui/styles/global.css";
import { AuthProvider } from "@ui";
import { createApiClient } from "@api";
import { createAuthStorage } from "@utils";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { ParticipationPlaceholder } from "./pages/ParticipationPlaceholder";

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
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/olympiad" element={<ParticipationPlaceholder />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
