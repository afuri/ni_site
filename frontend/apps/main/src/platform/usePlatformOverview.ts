import { useCallback, useEffect, useState } from "react";
import type { AttemptResult, AttemptView, OlympiadPublic, UserAnnouncement } from "@api";
import type { PlatformApi } from "./platformApi";

export type ResourceStatus = "idle" | "loading" | "ready" | "error";

export type ResourceState<T> = {
  status: ResourceStatus;
  data: T;
};

const listState = <T,>(): ResourceState<T[]> => ({ status: "idle", data: [] });

const isAbortError = (error: unknown) =>
  error instanceof Error && error.name === "AbortError";

export function usePlatformOverview(api: PlatformApi, enabled: boolean, classGrade: number | null = null) {
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const [olympiads, setOlympiads] = useState<ResourceState<OlympiadPublic[]>>(listState);
  const [results, setResults] = useState<ResourceState<AttemptResult[]>>(listState);
  const [announcements, setAnnouncements] = useState<ResourceState<UserAnnouncement[]>>(listState);
  const [activeAttempt, setActiveAttempt] = useState<ResourceState<AttemptView | null>>({
    status: "idle",
    data: null
  });

  useEffect(() => {
    if (!enabled) {
      setOlympiads(listState());
      setResults(listState());
      setAnnouncements(listState());
      setActiveAttempt({ status: "idle", data: null });
      return;
    }

    const controller = new AbortController();
    let current = true;
    setOlympiads({ status: "loading", data: [] });
    setResults({ status: "loading", data: [] });
    setAnnouncements({ status: "loading", data: [] });
    setActiveAttempt({ status: "idle", data: null });

    void api.getOlympiads(controller.signal)
      .then((data) => {
        if (current) setOlympiads({ status: "ready", data: data ?? [] });
      })
      .catch((error) => {
        if (current && !isAbortError(error)) setOlympiads({ status: "error", data: [] });
      });

    void api.getAnnouncements(controller.signal)
      .then((data) => {
        if (current) setAnnouncements({ status: "ready", data: data ?? [] });
      })
      .catch((error) => {
        if (current && !isAbortError(error)) setAnnouncements({ status: "error", data: [] });
      });

    void api.getMyResults(controller.signal)
      .then((data) => {
        if (!current) return;
        const nextResults = data ?? [];
        setResults({ status: "ready", data: nextResults });
        const active = nextResults.find((item) => item.status === "active");
        if (!active) {
          setActiveAttempt({ status: "ready", data: null });
          return;
        }
        setActiveAttempt({ status: "loading", data: null });
        void api.getAttempt(active.attempt_id, controller.signal)
          .then((view) => {
            if (!current) return;
            if (view.attempt.status !== "active") {
              setActiveAttempt({ status: "ready", data: null });
              // The deadline may pass between reading results and the attempt.
              // Read the final result once; never loop on a stale list/replica.
              void api.getAttemptResult(active.attempt_id, controller.signal)
                .then((result) => {
                  if (current) setResults({ status: "ready", data: nextResults.map((item) => item.attempt_id === result.attempt_id ? result : item) });
                })
                .catch((error) => {
                  if (current && !isAbortError(error)) setResults({ status: "error", data: nextResults });
                });
            } else setActiveAttempt({ status: "ready", data: view });
          })
          .catch((error) => {
            if (current && !isAbortError(error)) setActiveAttempt({ status: "error", data: null });
          });
      })
      .catch((error) => {
        if (current && !isAbortError(error)) {
          setResults({ status: "error", data: [] });
          setActiveAttempt({ status: "error", data: null });
        }
      });

    return () => {
      current = false;
      controller.abort();
    };
  }, [api, enabled, classGrade, revision, refresh]);

  return {
    refresh,
    olympiads,
    results,
    announcements,
    activeAttempt
  };
}
