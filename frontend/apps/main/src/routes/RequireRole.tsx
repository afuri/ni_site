import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@ui";
import { canAccessRole } from "@utils";
import type { AuthRole } from "@utils";

type RequireRoleProps = {
  allowed: AuthRole[];
  redirectTo?: string;
  children: React.ReactElement;
};

export function RequireRole({
  allowed,
  redirectTo = "/login",
  children
}: RequireRoleProps) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === "loading" || status === "idle") {
    return <div className="app-content">Loading...</div>;
  }

  if (!canAccessRole(user, allowed)) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  return children;
}
