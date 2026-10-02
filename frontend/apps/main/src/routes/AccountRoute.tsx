import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@ui";
import { getAccountHomePath, LOGIN_REDIRECT_KEY } from "./accountHome";

type AccountRouteProps = {
  area: "student-platform" | "legacy-cabinet";
  children: React.ReactElement;
};

export function AccountRoute({ area, children }: AccountRouteProps) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === "idle" || status === "loading") {
    return <div className="app-content">Загрузка…</div>;
  }

  if (!user) {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        LOGIN_REDIRECT_KEY,
        `${location.pathname}${location.search}${location.hash}`
      );
    }
    return <Navigate to="/" replace />;
  }

  const homePath = getAccountHomePath(user);
  if (area === "student-platform" && user.role !== "student") {
    return <Navigate to={homePath} replace />;
  }
  if (area === "legacy-cabinet" && user.role === "student") {
    return <Navigate to={homePath} replace />;
  }

  if (user.role === "student" && user.class_grade !== 0 &&
      ["missing", "submission_rejected"].includes(user.school_status) &&
      ["/platform", "/platform/"].includes(location.pathname)) {
    return <Navigate to="/platform/profile" replace />;
  }

  return children;
}
