import { useEffect, useRef, useState } from "react";
import type { ApiError } from "@api";
import { adminApiClient } from "../lib/adminClient";

type UploadLink = { url: string; public_url?: string | null; expires_in?: number };
type CachedLink = { url: string; expiresAt: number };
type QueueEntry = { start: () => void };
const queue: QueueEntry[] = [];
let active = 0;
const CONCURRENCY = 6;

const aborted = () => new DOMException("Image request cancelled", "AbortError");

function drain(): void {
  while (active < CONCURRENCY && queue.length) queue.shift()!.start();
}

function schedule<T>(run: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(aborted()); return; }
    const entry: QueueEntry = { start: () => {
      signal.removeEventListener("abort", cancel);
      active += 1;
      Promise.resolve().then(run).then(resolve, reject).finally(() => { active -= 1; drain(); });
    } };
    const cancel = () => {
      const index = queue.indexOf(entry);
      if (index >= 0) queue.splice(index, 1);
      reject(aborted());
    };
    signal.addEventListener("abort", cancel, { once: true });
    queue.push(entry);
    drain();
  });
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(aborted()); return; }
    const cancel = () => { clearTimeout(timer); reject(aborted()); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", cancel); resolve(); }, ms);
    signal.addEventListener("abort", cancel, { once: true });
  });
}

async function fetchLink(key: string, signal: AbortSignal): Promise<CachedLink> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const safeKey = key.split("/").map(encodeURIComponent).join("/");
      const payload = await schedule(() => adminApiClient.request<UploadLink>({
        path: `/uploads/${safeKey}`, method: "GET", signal
      }), signal);
      if (!payload?.url && !payload?.public_url) throw new Error("Missing image link");
      const ttl = Math.max(1, payload.expires_in ?? 900) * 1000;
      return { url: payload.public_url || payload.url,
        expiresAt: payload.public_url ? Infinity : Date.now() + ttl - Math.min(30000, ttl / 10) };
    } catch (error) {
      const apiError = error as Partial<ApiError>;
      const network = error instanceof TypeError || (error instanceof Error && error.message === "request_timeout");
      const transient = network || apiError.status === 429 || (apiError.status != null && apiError.status >= 500);
      if (signal.aborted || !transient || attempt >= 2) throw error;
      const retryAfter = Number(apiError.details?.retry_after_seconds);
      if (apiError.status === 429 && retryAfter > 30) throw error;
      await wait(Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000 : 500 * 2 ** attempt, signal);
    }
  }
}

/** One bounded queue for the task list, olympiad preview and attempt review. */
export function useUploadImageUrls(
  keys: readonly (string | null | undefined)[],
  resolveLocal?: (key: string) => string | null | undefined
): Record<string, string> {
  const signature = JSON.stringify(Array.from(new Set(keys.filter((key): key is string => Boolean(key)))));
  const cache = useRef(new Map<string, CachedLink>());
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const currentKeys: string[] = JSON.parse(signature);
    const controller = new AbortController();
    const { signal } = controller;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const publish = () => {
      if (signal.aborted) return;
      const entries = currentKeys.map((key) => [key, cache.current.get(key)?.url ?? ""]);
      setUrls(Object.fromEntries(entries));
    };
    const load = async () => {
      await Promise.all(currentKeys.map(async (key) => {
        if ((cache.current.get(key)?.expiresAt ?? 0) > Date.now()) return;
        const local = /^https?:|^data:/.test(key) ? key : resolveLocal?.(key);
        try {
          const link = local ? { url: local, expiresAt: Infinity } : await fetchLink(key, signal);
          if (!signal.aborted) {
            cache.current.set(key, link);
            publish();
          }
        } catch {
          // A terminal failure stays terminal until this view is opened again.
          if (!signal.aborted) cache.current.set(key, { url: "", expiresAt: Infinity });
        }
      }));
      if (signal.aborted) return;
      publish();
      const expiresAt = Math.min(...currentKeys.map((key) => cache.current.get(key)?.expiresAt ?? Infinity));
      if (Number.isFinite(expiresAt)) refreshTimer = setTimeout(() => setRevision((v) => v + 1), Math.max(1, expiresAt - Date.now()));
      // Keep cache size bounded when the operator browses many pages.
      if (cache.current.size > 1000) {
        const keep = new Set(currentKeys);
        for (const key of cache.current.keys()) if (!keep.has(key)) cache.current.delete(key);
      }
    };
    publish();
    void load();
    return () => {
      controller.abort();
      clearTimeout(refreshTimer);
      for (const key of currentKeys) if (cache.current.get(key)?.url === "") cache.current.delete(key);
    };
  }, [signature, resolveLocal, revision]);

  return urls;
}
