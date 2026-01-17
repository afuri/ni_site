import "@ui/styles/global.css";
import "./styles/admin.css";
import { AuthProvider, useAuth } from "@ui";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { adminApiClient, adminStorage } from "./lib/adminClient";
import { RequireAdmin } from "./routes/RequireAdmin";
import { AdminLayout } from "./pages/AdminLayout";
import { LoginPage } from "./pages/LoginPage";
import { TasksPage } from "./pages/TasksPage";
import { OlympiadsPage } from "./pages/OlympiadsPage";
import { ContentPage } from "./pages/ContentPage";
import { UsersPage } from "./pages/UsersPage";
import { ReportsPage } from "./pages/ReportsPage";
import { ResultsPage } from "./pages/ResultsPage";
import { SchoolsPage } from "./pages/SchoolsPage";

function RedirectIfAuthenticated() {
  const { status, user } = useAuth();
  if (status === "authenticated" && user?.role === "admin") {
    return <Navigate to="/tasks" replace />;
  }
  return <LoginPage />;
}

export function App() {
  return (
    <AuthProvider client={adminApiClient} storage={adminStorage}>
      <BrowserRouter basename="/admin">
        <Routes>
          <Route path="/login" element={<RedirectIfAuthenticated />} />
          <Route
            path="/"
            element={
              <RequireAdmin>
                <AdminLayout />
              </RequireAdmin>
            }
          >
            <Route index element={<Navigate to="tasks" replace />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="olympiads" element={<OlympiadsPage />} />
            <Route path="content" element={<ContentPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="schools" element={<SchoolsPage />} />
            <Route path="results" element={<ResultsPage />} />
            <Route path="reports" element={<ReportsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
