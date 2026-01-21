import "@ui/styles/global.css";
import { AuthProvider } from "@ui";
import { createApiClient } from "@api";
import { createAuthStorage } from "@utils";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Suspense, lazy } from "react";
import { HomePage } from "./pages/HomePage";

const OlympiadPage = lazy(() =>
  import("./pages/OlympiadPage").then((module) => ({ default: module.OlympiadPage }))
);
const CabinetPage = lazy(() =>
  import("./pages/CabinetPage").then((module) => ({ default: module.CabinetPage }))
);
const VerifyEmailPage = lazy(() =>
  import("./pages/VerifyEmailPage").then((module) => ({ default: module.VerifyEmailPage }))
);
const ResetPasswordPage = lazy(() =>
  import("./pages/ResetPasswordPage").then((module) => ({ default: module.ResetPasswordPage }))
);

const storage = createAuthStorage({
  tokensKey: "ni_main_tokens",
  userKey: "ni_main_user"
});

const apiClient = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? "/api/v1",
  storage
});

export function App() {
  return (
    <AuthProvider client={apiClient} storage={storage}>
      <BrowserRouter>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/olympiad" element={<OlympiadPage />} />
            <Route path="/cabinet" element={<CabinetPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
