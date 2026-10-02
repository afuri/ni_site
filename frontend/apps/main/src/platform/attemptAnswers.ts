import type { ApiClient } from "@api";

export type AnswerPayload = { choice_id: string } | { choice_ids: string[] } | { text: string };
export type Answers = Record<number, AnswerPayload | null>;
export type AnswerState = "saved" | "pending" | "offline" | "conflict";
type View = {
  attempt: { id: number; status: string; answers_revision?: number | null };
  tasks: Array<{ task_id: number; current_answer?: { answer_payload: AnswerPayload } | null }>;
};
type Draft = { userId: number; attemptId: number; revision: number; pending: Answers; ready: number[] };
type Options = {
  client: Pick<ApiClient, "request">; userId: number; view: View;
  onAnswers: (answers: Answers) => void;
  onState: (state: AnswerState, message?: string) => void;
  onSaved: (taskId: number) => void;
  onClosed: () => void;
};
const canonical = (payload: AnswerPayload | null): AnswerPayload | null => {
  if (!payload) return null;
  if ("text" in payload) return payload.text.trim() ? { text: payload.text.trim() } : null;
  if ("choice_ids" in payload) return payload.choice_ids.length ? { choice_ids: [...payload.choice_ids].sort() } : null;
  return { choice_id: payload.choice_id };
};
const equal = (a: AnswerPayload | null, b: AnswerPayload | null) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const owns = (values: Answers, id: string | number) => Object.prototype.hasOwnProperty.call(values, id);
const serverAnswers = (view: View): Answers => Object.fromEntries(view.tasks.map(task => [task.task_id, canonical(task.current_answer?.answer_payload ?? null)]));

/** One bounded draft and one writer per page; the database revision guards other pages. */
export class AttemptAnswers {
  values: Answers;
  revision: number;
  private confirmed: Answers;
  private ready = new Set<number>();
  private running: Promise<void> | null = null;
  private paused = false;
  private conflict = false;
  private uncertain = false;
  private closed = false;
  private finishing = false;
  private disposed = false;
  private draftTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly key: string;
  private readonly path: string;

  constructor(private readonly options: Options) {
    this.key = `ni_attempt_draft:${options.userId}`;
    this.path = `/attempts/${options.view.attempt.id}`;
    this.values = serverAnswers(options.view);
    this.confirmed = { ...this.values };
    this.revision = options.view.attempt.answers_revision ?? 0;
    this.closed = options.view.attempt.status !== "active";
    const draft = this.readDraft();
    if (this.closed) this.clearDraft();
    else if (draft) {
      if (draft.revision === this.revision) this.applyDraft(draft);
      else this.conflict = true;
    }
  }

  start() { this.options.onAnswers({ ...this.values }); this.notice(); this.pump(); }
  observe(view: View) {
    if (this.disposed) return;
    if (view.attempt.status !== "active") { this.acceptClosed(); return; }
    const revision = view.attempt.answers_revision ?? 0;
    if (revision === this.revision || this.running || this.finishing) return;
    const saved = serverAnswers(view);
    if (Object.keys(this.pending()).length) {
      this.persist(); this.conflict = this.paused = true;
    }
    this.revision = revision; this.confirmed = saved; this.values = { ...saved };
    this.options.onAnswers({ ...saved }); this.notice();
  }
  private pending(): Answers {
    return Object.fromEntries(Object.entries(this.values).filter(([id, value]) => !equal(value, this.confirmed[Number(id)] ?? null)));
  }
  private notice(message?: string) {
    if (!this.disposed) this.options.onState(this.conflict ? "conflict" : this.paused ? "offline" : Object.keys(this.pending()).length ? "pending" : "saved", message);
  }
  private readDraft(): Draft | null {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw || raw.length > 256_000) return null;
      const draft: Draft = JSON.parse(raw);
      const valid = (value: AnswerPayload | null) => value === null || typeof value === "object" && (
        "text" in value && typeof value.text === "string" || "choice_id" in value && typeof value.choice_id === "string"
        || "choice_ids" in value && Array.isArray(value.choice_ids) && value.choice_ids.every(id => typeof id === "string"));
      return draft?.userId === this.options.userId && draft?.attemptId === this.options.view.attempt.id
        && Number.isInteger(draft.revision) && draft.pending && Array.isArray(draft.ready)
        && Object.values(draft.pending).every(valid) ? draft : null;
    } catch { return null; }
  }
  private clearDraft() { try { localStorage.removeItem(this.key); } catch { /* unavailable */ } }
  persist() {
    if (this.conflict || this.closed) return;
    try {
      const pending = this.pending();
      if (!Object.keys(pending).length) { this.clearDraft(); return; }
      const data = JSON.stringify({ userId: this.options.userId, attemptId: this.options.view.attempt.id,
        revision: this.revision, pending, ready: [...this.ready] } satisfies Draft);
      if (data.length > 256_000) throw new Error("draft_too_large");
      localStorage.setItem(this.key, data);
    } catch { this.notice("Черновик на устройстве недоступен. Не закрывайте страницу до сохранения ответов."); }
  }
  private applyDraft(draft: Draft) {
    for (const [id, value] of Object.entries(draft.pending)) {
      if (owns(this.values, id)) this.values[Number(id)] = canonical(value);
    }
    this.ready = new Set(draft.ready.filter(id => owns(this.values, id)));
  }
  restoreDraft() {
    const draft = this.readDraft();
    if (!draft || this.closed) return;
    this.applyDraft(draft);
    this.conflict = this.paused = false;
    this.options.onAnswers({ ...this.values }); this.persist(); this.notice(); this.pump();
  }
  discardDraft() {
    this.values = { ...this.confirmed }; this.ready.clear(); this.conflict = this.paused = false;
    this.clearDraft(); this.options.onAnswers({ ...this.values }); this.notice();
  }
  edit(taskId: number, payload: AnswerPayload | null, send = true) {
    if (this.finishing || this.closed || this.conflict || this.disposed) return;
    this.values[taskId] = canonical(payload);
    if (send) this.ready.add(taskId); else this.ready.delete(taskId);
    clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => this.persist(), 150);
    this.notice(); if (send) this.pump();
  }
  retry() { if (!this.conflict && !this.closed) { this.paused = false; this.pump(); } }
  private acceptClosed() {
    this.closed = true; this.clearDraft();
    if (!this.disposed) this.options.onClosed();
  }
  private async reconcile(expected: number, sent?: { taskId: number; value: AnswerPayload | null }): Promise<boolean> {
    const view = await this.options.client.request<View>({ path: this.path, method: "GET" });
    if (this.disposed) return false;
    if (view.attempt.status !== "active") { this.acceptClosed(); return false; }
    const revision = view.attempt.answers_revision ?? 0;
    const saved = serverAnswers(view);
    const sameOthers = Object.keys(saved).every(id => Number(id) === sent?.taskId || equal(saved[Number(id)], this.confirmed[Number(id)] ?? null));
    if (sameOthers && (revision === expected && (!sent || equal(saved[sent.taskId], this.confirmed[sent.taskId] ?? null))
      || sent && revision === expected + 1 && equal(saved[sent.taskId], sent.value))) {
      this.revision = revision; this.confirmed = saved; this.uncertain = false;
      this.persist(); return true;
    }
    // Preserve the local draft before showing the server's conflicting state.
    this.persist(); this.conflict = true; this.paused = true;
    this.revision = revision; this.confirmed = saved; this.values = { ...saved };
    this.options.onAnswers({ ...this.values }); this.notice(); return false;
  }
  private pump() {
    if (this.running || this.paused || this.conflict || this.closed || this.finishing || this.disposed) return;
    if (![...this.ready].some(id => !equal(this.values[id], this.confirmed[id] ?? null))) return;
    this.running = this.drain().finally(() => { this.running = null; this.pump(); });
  }
  private async drain() {
    let failures = 0;
    while (!this.disposed && !this.finishing && !this.closed && !this.conflict && !this.paused) {
      const taskId = [...this.ready].find(id => !equal(this.values[id], this.confirmed[id] ?? null));
      if (taskId === undefined) break;
      const value = this.values[taskId];
      const expected = this.revision;
      this.persist();
      try {
        const result = await this.options.client.request<{ answers_revision: number }>({ path: `${this.path}/answers`, method: "POST",
          body: { task_id: taskId, answer_payload: value, expected_revision: expected } });
        if (this.disposed) return;
        this.revision = result.answers_revision; this.confirmed[taskId] = value; failures = 0;
        if (equal(this.values[taskId], value)) { this.ready.delete(taskId); this.options.onSaved(taskId); }
        this.persist(); this.notice();
      } catch (error) {
        if (this.disposed) return;
        const fault = error as { status?: number; code?: string; details?: { retry_after_seconds?: number } };
        if (fault.status === 401 || fault.status === 403 || fault.status === 422) { this.paused = true; this.notice(); return; }
        this.uncertain = true;
        try {
          if (!await this.reconcile(expected, { taskId, value })) return;
          if (equal(this.values[taskId], this.confirmed[taskId])) { this.ready.delete(taskId); this.notice(); continue; }
          if (this.revision === expected + 1) { failures = 0; this.notice(); continue; }
        } catch { /* Keep draft and uncertainty until a successful read. */ }
        failures += 1;
        const delay = fault.details?.retry_after_seconds ?? 1;
        if (failures >= 2 || delay > 10) { this.paused = true; this.notice(); return; }
        this.notice("Не удалось сохранить ответ. Повторяем отправку…");
        await new Promise(resolve => setTimeout(resolve, Math.max(1, delay) * 1000));
      }
    }
  }
  async submit() {
    if (this.conflict) throw new Error("answers_conflict");
    this.finishing = true;
    try {
      await this.running;
      if (this.closed) return;
      if (this.conflict) throw new Error("answers_conflict");
      if (this.uncertain && !await this.reconcile(this.revision)) {
        if (this.closed) return;
        throw new Error("answers_conflict");
      }
      const expected = this.revision;
      const answers = Object.entries(this.values).map(([id, value]) => ({ task_id: Number(id), answer_payload: value }));
      this.persist();
      try {
        await this.options.client.request({ path: `${this.path}/submit`, method: "POST", body: { expected_revision: expected, answers } });
        this.acceptClosed();
      } catch (error) {
        const fault = error as { status?: number };
        if (!fault.status || fault.status >= 500 || fault.status === 409) {
          this.uncertain = true;
          if (!await this.reconcile(expected) && this.closed) return;
        }
        throw error;
      }
    } finally { this.finishing = false; }
  }
  dispose() { this.persist(); clearTimeout(this.draftTimer); this.disposed = true; }
}
