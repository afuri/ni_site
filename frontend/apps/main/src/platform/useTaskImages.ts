import { useEffect, useState } from "react";
import type { ApiClient, AttemptView } from "@api";

type ImageState = { status: "loading" | "ready" | "error"; url?: string };
type CachedImage = { url: string; expiresAt: number };
// Scope links to the API client/session; don't reuse protected links after logout.
const caches = new WeakMap<ApiClient, Map<string, CachedImage>>();
const safeImageUrl = (url: string) => /^(https?:\/\/|data:image\/)/i.test(url) || (url.startsWith("/") && !url.startsWith("//"));

export function useTaskImages(client: ApiClient, view: AttemptView | null) {
  const [images, setImages] = useState<Record<string, ImageState>>({});
  useEffect(() => {
    const keys = [...new Set(view?.tasks.map((task) => task.image_key).filter((key): key is string => Boolean(key)) ?? [])];
    if (!keys.length) { setImages({}); return; }
    const controller = new AbortController();
    let current = true;
    let cache = caches.get(client);
    if (!cache) { cache = new Map(); caches.set(client, cache); }
    const resolved: Record<string, ImageState> = {};
    const missing: string[] = [];
    for (const key of keys) {
      const cached = cache.get(key);
      if (safeImageUrl(key)) resolved[key] = { status: "ready", url: key };
      else if (cached && cached.expiresAt > Date.now()) resolved[key] = { status: "ready", url: cached.url };
      else { resolved[key] = { status: "loading" }; missing.push(key); }
    }
    setImages(resolved);
    const load = async (key: string) => {
      try {
        const safeKey = key.split("/").map(encodeURIComponent).join("/");
        const response = await client.request<{ url: string; public_url?: string | null; expires_in: number }>({
          path: `/uploads/${safeKey}`, method: "GET", signal: controller.signal
        });
        const url = response.public_url || response.url;
        if (!url || !safeImageUrl(url)) throw new Error("Invalid image URL");
        if (!current) return;
        const ttl = Math.max(0, Math.min(response.expires_in ?? 300, 3600) - 10);
        cache.set(key, { url, expiresAt: Date.now() + ttl * 1000 });
        if (cache.size > 200) cache.delete(cache.keys().next().value!);
        setImages((previous) => ({ ...previous, [key]: { status: "ready", url } }));
      } catch {
        if (current) setImages((previous) => ({ ...previous, [key]: { status: "error" } }));
      }
    };
    // Bound concurrency rather than launching one request for every task at once.
    let next = 0;
    void Promise.all(Array.from({ length: Math.min(4, missing.length) }, async () => {
      while (current && next < missing.length) await load(missing[next++]);
    }));
    return () => { current = false; controller.abort(); };
  }, [client, view]);
  return images;
}
