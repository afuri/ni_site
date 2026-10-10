export type ServerClockSnapshot = { status: "pending" | "ready" | "error"; revision: number };
const SYNC_COOLDOWN_MS = 60000;
const LONG_ABSENCE_MS = 60000;

/** One clock per browser bundle. Device wall time is never used for admission. */
export class ServerClock {
  private anchor: { serverMs: number; sampledAt: number; wallAt: number } | null = null;
  private snapshot: ServerClockSnapshot = { status: "pending", revision: 0 };
  private listeners = new Set<() => void>();
  private syncUrl: string | null = null;
  private inFlight: Promise<boolean> | null = null;
  private lastAttempt = -Infinity;
  private hiddenAt: { monotonic: number; wall: number } | null = null;

  configure(baseUrl: string): void {
    this.syncUrl = `${baseUrl.replace(/\/$/, "")}/time`;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  getSnapshot = (): ServerClockSnapshot => this.snapshot;

  private update(status: ServerClockSnapshot["status"]): void {
    this.snapshot = { status, revision: this.snapshot.revision + 1 };
    this.listeners.forEach((listener) => listener());
  }

  observe(value: string | number | null | undefined, receivedAt = performance.now()): boolean {
    if (value == null || (typeof value === "string" && !value.trim())) return false;
    const serverMs = typeof value === "number" ? value : /^\d+$/.test(value) ? Number(value) : Date.parse(value);
    if (!Number.isFinite(serverMs) || serverMs < 0 || serverMs > 8640000000000000) return false;
    this.anchor = { serverMs, sampledAt: receivedAt, wallAt: Date.now() };
    this.update("ready");
    return true;
  }

  now(): number | null {
    return this.snapshot.status === "ready" && this.anchor
      ? this.anchor.serverMs + Math.max(0, performance.now() - this.anchor.sampledAt) : null;
  }

  private isFresh(): boolean {
    if (!this.anchor || this.snapshot.status !== "ready") return false;
    const elapsed = performance.now() - this.anchor.sampledAt;
    // Wall time only detects sleep/clock jumps; it never determines an action.
    const wallElapsed = Date.now() - this.anchor.wallAt;
    return elapsed >= 0 && elapsed < LONG_ABSENCE_MS && Math.abs(wallElapsed - elapsed) < 5000;
  }

  retryAfterSeconds(): number {
    return Math.max(0, Math.ceil((SYNC_COOLDOWN_MS - (performance.now() - this.lastAttempt)) / 1000));
  }

  suspend(): void {
    this.hiddenAt = { monotonic: performance.now(), wall: Date.now() };
  }

  resume(): Promise<boolean> {
    if (this.hiddenAt) {
      const elapsed = Math.max(performance.now() - this.hiddenAt.monotonic, Date.now() - this.hiddenAt.wall);
      this.hiddenAt = null;
      if (elapsed >= LONG_ABSENCE_MS && !this.isFresh()) this.update("pending");
    }
    return this.ensureSynced();
  }

  ensureSynced(): Promise<boolean> {
    if (this.isFresh()) return Promise.resolve(true);
    if (this.inFlight) return this.inFlight;
    if (!this.syncUrl || this.retryAfterSeconds() > 0) {
      this.update("error");
      return Promise.resolve(false);
    }
    this.lastAttempt = performance.now();
    this.update("pending");
    const revision = this.snapshot.revision;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    this.inFlight = (async () => {
      try {
        const readTime = async () => {
          const response = await fetch(this.syncUrl!, { cache: "no-store", credentials: "omit", signal: controller.signal });
          const receivedAt = performance.now();
          if (controller.signal.aborted || !response.ok || Number(response.headers?.get("Age") ?? 0) > 0) throw new Error("time_sync_failed");
          if (this.observe(response.headers?.get("X-Server-Time"), receivedAt)) return true;
          const data = await response.json() as { server_now?: string };
          if (controller.signal.aborted || !this.observe(data.server_now, receivedAt)) throw new Error("invalid_server_time");
          return true;
        };
        return await Promise.race([
          Promise.resolve().then(readTime),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => { controller.abort(); reject(new Error("time_sync_timeout")); }, 5000);
          })
        ]);
      } catch {
        // An ordinary API response may have supplied a newer valid sample.
        if (this.snapshot.status === "ready" && this.snapshot.revision > revision) return true;
        this.update("error");
        return false;
      } finally {
        clearTimeout(timer!);
        this.inFlight = null;
      }
    })();
    return this.inFlight;
  }
}

export const serverClock = new ServerClock();
