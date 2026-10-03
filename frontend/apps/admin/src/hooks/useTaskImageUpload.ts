import { useEffect, useState } from "react";
import { uploadApiClient } from "../lib/adminClient";

type ImageUpload = { key: string; url: string; content_type: string };
type State = {
  file: File | null;
  width: number | "original";
  status: "idle" | "loading" | "ready" | "error";
  result: ImageUpload | null;
  error: string | null;
};

export function useTaskImageUpload(file: File | null, width: number | "original", active: boolean) {
  const [retryCount, setRetryCount] = useState(0);
  const [state, setState] = useState<State>({ file: null, width, status: "idle", result: null, error: null });

  useEffect(() => {
    if (!active || !file) {
      setState({ file: null, width, status: "idle", result: null, error: null });
      return;
    }
    const controller = new AbortController();
    setState({ file, width, status: "loading", result: null, error: null });
    // Avoid uploading every intermediate width while the administrator changes it.
    const timer = window.setTimeout(() => {
      const body = new FormData();
      body.append("image", file);
      body.append("width", String(width));
      void uploadApiClient.request<ImageUpload>({ path: "/uploads/task-image", method: "POST", body, signal: controller.signal })
        .then((result) => {
          if (!controller.signal.aborted) setState({ file, width, status: "ready", result, error: null });
        })
        .catch((failure: unknown) => {
          if (controller.signal.aborted) return;
          const message = (failure as { message?: string })?.message;
          setState({ file, width, status: "error", result: null, error:
            message && !["request_timeout", "Failed to fetch", "NetworkError"].includes(message)
              ? message : "Не удалось загрузить изображение. Повторите загрузку." });
        });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [file, width, active, retryCount]);

  // Block Save immediately on a new selection, before the effect has run.
  const current = active && file && state.file === file && state.width === width;
  return {
    status: !active || !file ? "idle" : current ? state.status : "loading",
    result: current ? state.result : null,
    error: current ? state.error : null,
    retry: () => setRetryCount((count) => count + 1)
  };
}
