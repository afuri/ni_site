import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountRoute } from "../AccountRoute";
import { getAccountHomePath, LOGIN_REDIRECT_KEY } from "../accountHome";

const auth = vi.hoisted(() => ({
  status: "authenticated" as "authenticated" | "unauthenticated" | "loading",
  user: { role: "student" } as { role: "student" | "teacher" | "admin" } | null
}));

vi.mock("@ui", () => ({ useAuth: () => auth }));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function renderRoute(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<LocationProbe />} />
        <Route path="/cabinet" element={(
          <AccountRoute area="legacy-cabinet">
            <div>cabinet content</div>
          </AccountRoute>
        )} />
        <Route path="/platform/*" element={(
          <AccountRoute area="student-platform">
            <div>platform content</div>
          </AccountRoute>
        )} />
      </Routes>
    </MemoryRouter>
  );
}

describe("account role routing", () => {
  beforeEach(() => {
    auth.status = "authenticated";
    auth.user = { role: "student" };
    window.localStorage.clear();
  });

  it("selects the account home by role", () => {
    expect(getAccountHomePath("student")).toBe("/platform");
    expect(getAccountHomePath("teacher")).toBe("/cabinet");
    expect(getAccountHomePath("admin")).toBe("/cabinet");
  });

  it("allows a student into the platform", () => {
    renderRoute("/platform/results");
    expect(screen.getByText("platform content")).toBeInTheDocument();
  });

  it("redirects a student from the legacy cabinet", () => {
    renderRoute("/cabinet");
    expect(screen.getByText("platform content")).toBeInTheDocument();
  });

  it("redirects a teacher from the student platform", () => {
    auth.user = { role: "teacher" };
    renderRoute("/platform/profile");
    expect(screen.getByText("cabinet content")).toBeInTheDocument();
  });

  it("preserves an unauthenticated platform destination", () => {
    auth.status = "unauthenticated";
    auth.user = null;
    renderRoute("/platform/results?from=test");
    expect(screen.getByTestId("location")).toHaveTextContent("/");
    expect(window.localStorage.getItem(LOGIN_REDIRECT_KEY)).toBe("/platform/results?from=test");
  });
});
