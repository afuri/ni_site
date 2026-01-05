import "@ui/styles/global.css";
import { AuthProvider, useAuth } from "@ui";
import { createApiClient } from "@api";
import { createAuthStorage } from "@utils";

const storage = createAuthStorage({
  tokensKey: "ni_main_tokens",
  userKey: "ni_main_user"
});

const apiClient = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1",
  storage
});

function AppContent() {
  const { status, user } = useAuth();

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Main app scaffold</h1>
      </header>
      <main className="app-content">
        <p>Auth status: {status}</p>
        <p>Current role: {user?.role ?? "guest"}</p>
      </main>
    </div>
  );
}

export function App() {
  return (
    <AuthProvider client={apiClient} storage={storage}>
      <AppContent />
    </AuthProvider>
  );
}
