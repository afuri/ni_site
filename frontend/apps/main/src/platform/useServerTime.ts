import { useEffect, useState, useSyncExternalStore } from "react";
import { serverClock } from "@api";

/** The one-second UI ticker is local; synchronization is event-driven. */
export function useServerTime(allowFallback: boolean) {
  const snapshot = useSyncExternalStore(serverClock.subscribe, serverClock.getSnapshot, serverClock.getSnapshot);
  const [, tick] = useState(0);

  useEffect(() => {
    if (allowFallback) void serverClock.ensureSynced();
  }, [allowFallback]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      clearInterval(timer);
      if (allowFallback && document.visibilityState !== "hidden") timer = setInterval(() => tick((value) => value + 1), 1000);
    };
    const resume = () => {
      if (document.visibilityState === "hidden") return;
      if (allowFallback) void serverClock.resume();
      tick((value) => value + 1);
      start();
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") {
        serverClock.suspend();
        clearInterval(timer);
      } else resume();
    };
    start();
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("focus", resume);
    window.addEventListener("pageshow", resume);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("focus", resume);
      window.removeEventListener("pageshow", resume);
    };
  }, [allowFallback]);

  return { now: serverClock.now(), status: snapshot.status,
    retryAfterSeconds: serverClock.retryAfterSeconds(), retry: () => serverClock.ensureSynced() };
}
