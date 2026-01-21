import React, { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

const RESET_TOKEN_STORAGE_KEY = "ni_password_reset_token";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const hasRequested = useRef(false);

  useEffect(() => {
    if (hasRequested.current) {
      return;
    }
    hasRequested.current = true;

    if (!token) {
      navigate("/", { replace: true });
      return;
    }

    window.localStorage.setItem(RESET_TOKEN_STORAGE_KEY, token);
    navigate("/", { replace: true });
  }, [navigate, token]);

  return null;
}
