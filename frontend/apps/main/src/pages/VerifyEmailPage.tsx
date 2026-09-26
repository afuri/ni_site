import React, { useEffect, useRef } from "react";
import { createApiClient } from "@api";
import { createMainAuthStorage } from "../utils/authStorage";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getAccountHomePath } from "../routes/accountHome";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";
const publicClient = createApiClient({ baseUrl: API_BASE_URL });
const VERIFY_SUCCESS_STORAGE_KEY = "ni_email_verified_success";

export function VerifyEmailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const hasRequested = useRef(false);

  useEffect(() => {
    if (hasRequested.current) {
      return;
    }
    hasRequested.current = true;

    const storage = createMainAuthStorage();
    const hasTokens = Boolean(storage.getTokens());
    const accountHome = getAccountHomePath(storage.getUser?.());

    if (!token) {
      navigate(hasTokens ? accountHome : "/", { replace: true });
      return;
    }

    publicClient
      .request<{ status: string }>({
        path: "/auth/verify/confirm",
        method: "POST",
        body: { token },
        auth: false
      })
      .then(() => {
        window.localStorage.setItem(VERIFY_SUCCESS_STORAGE_KEY, "1");
      })
      .finally(() => {
        navigate(hasTokens ? accountHome : "/", { replace: true });
      });
  }, [navigate, token]);

  return null;
}
