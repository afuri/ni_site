import { useEffect, useMemo, useState } from "react";
import type { AttemptResult, AttemptView, OlympiadPublic, UserAnnouncement } from "@api";
import type { PlatformApi } from "./platformApi";
import { ageGroupAllows } from "./olympiadAction";

export type ResourceStatus = "idle" | "loading" | "ready" | "error";

export type ResourceState<T> = {
  status: ResourceStatus;
  data: T;
};

const listState = <T,>(): ResourceState<T[]> => ({ status: "idle", data: [] });

const isAbortError = (error: unknown) =>
  error instanceof Error && error.name === "AbortError";

const timestamp = (value: string | null) => {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

export function usePlatformOverview(api: PlatformApi, enabled: boolean, classGrade: number | null = null) {
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
            if (current) setActiveAttempt({ status: "ready", data: view });
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
  }, [api, enabled]);

  const recentResults = useMemo(
    () => [...results.data]
      .filter((item) => item.status !== "active")
      .sort((left, right) => timestamp(right.graded_at) - timestamp(left.graded_at))
      .slice(0, 4),
    [results.data]
  );

  const nearestOlympiad = useMemo(() => {
    const now = Date.now();
    return [...olympiads.data]
      .filter((item) => (
        item.is_published
        && ageGroupAllows(item.age_group, classGrade)
        && timestamp(item.available_to) >= now
      ))
      .sort((left, right) => timestamp(left.available_from) - timestamp(right.available_from))[0] ?? null;
  }, [classGrade, olympiads.data]);

  return {
    olympiads,
    results,
    announcements,
    activeAttempt,
    recentResults,
    nearestOlympiad
  };
}
