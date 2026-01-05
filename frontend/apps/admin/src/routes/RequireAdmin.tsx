import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@ui";
import { canAccessRole } from "@utils";

export function RequireAdmin({ children }: { children: React.ReactElement }) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === "loading" || status === "idle") {
    return <div className="app-content">Loading...</div>;
  }

  if (!canAccessRole(user, ["admin"])) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
