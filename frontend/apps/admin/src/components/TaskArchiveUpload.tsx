import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button, Modal } from "@ui";
import { taskUploadApiClient } from "../lib/adminClient";
import "../styles/task-archive-upload.css";

type UploadItem = {
  index: string;
  title: string;
  content: string;
  task_type: string;
  payload: Record<string, unknown>;
  errors: string[];
  image_url: string | null;
};

export type TaskUpload = {
  token: string;
  status: "preparing" | "reviewing" | "completed" | "cancelled" | "failed";
  pool_title: string;
  subject: string;
  grade: number;
  total: number;
  saved: number;
  skipped: number;
  current_number: number | null;
  current: UploadItem | null;
  skipped_items: { index: string; reason: string; errors: string[] }[];
  saved_task_ids: number[];
  error: string | null;
};

type Props = {
  userId: number;
  renderMarkdown: (text: string) => string;
  onTasksChanged: () => Promise<void>;
};

const errorMessage = (error: unknown) => {
  const message = (error as { message?: string })?.message;
  return message && !["request_timeout", "Failed to fetch", "NetworkError"].includes(message)
    ? message : "Не удалось получить ответ сервера. Обновите состояние загрузки.";
};

export function TaskArchiveUpload({ userId, renderMarkdown, onTasksChanged }: Props) {
  const storageKey = `ni_admin_task_upload_${userId}`;
  const fileInput = useRef<HTMLInputElement>(null);
  const tokenRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const changedRef = useRef(onTasksChanged);
  changedRef.current = onTasksChanged;
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<TaskUpload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageResult, setImageResult] = useState<{ key: string; status: "ready" | "error" } | null>(null);
  const [imageAttempt, setImageAttempt] = useState(0);
  const activeImageKey = useRef<string | null>(null);

  const applySession = (next: TaskUpload) => {
    tokenRef.current = next.token;
    localStorage.setItem(storageKey, next.token);
    setSession(next);
    setOpen(true);
  };

  const restore = async () => {
    if (!tokenRef.current || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const next = await taskUploadApiClient.request<TaskUpload>({ path: `/admin/task-uploads/${tokenRef.current}` });
      applySession(next);
      if (next.saved) await changedRef.current();
    } catch (failure) {
      const status = (failure as { status?: number }).status;
      if (status === 404 || status === 410) {
        localStorage.removeItem(storageKey);
        tokenRef.current = null;
        setSession(null);
      }
      setError(errorMessage(failure));
      setOpen(true);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem(storageKey);
    if (token) {
      tokenRef.current = token;
      setOpen(true);
      void restore();
    }
  }, [storageKey]);

  useEffect(() => {
    if (session?.status !== "preparing") return;
    const timer = window.setInterval(() => { void restore(); }, 2000);
    return () => window.clearInterval(timer);
  }, [session?.status]);

  const close = () => {
    localStorage.removeItem(storageKey);
    tokenRef.current = null;
    setSession(null);
    setError(null);
    setOpen(false);
  };

  const upload = async (file: File) => {
    if (busyRef.current) return;
    const token = crypto.randomUUID();
    tokenRef.current = token;
    localStorage.setItem(storageKey, token);
    setOpen(true);
    setSession(null);
    setError(null);
    busyRef.current = true;
    setBusy(true);
    const body = new FormData();
    body.append("token", token);
    body.append("archive", file);
    try {
      applySession(await taskUploadApiClient.request<TaskUpload>({ path: "/admin/task-uploads", method: "POST", body }));
    } catch (failure) {
      const status = (failure as { status?: number }).status;
      if (status === 422 || status === 413) {
        localStorage.removeItem(storageKey);
        tokenRef.current = null;
      }
      setError(errorMessage(failure));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const act = async (action: "save" | "skip" | "cancel") => {
    if (!session || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    const suffix = action === "cancel" ? "cancel" : `tasks/${session.current?.index}/${action}`;
    try {
      const next = await taskUploadApiClient.request<TaskUpload>({
        path: `/admin/task-uploads/${session.token}/${suffix}`, method: "POST"
      });
      applySession(next);
      if (next.saved > session.saved) await changedRef.current();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const complete = session?.status === "completed" || session?.status === "cancelled";
  const reviewing = session?.status === "reviewing";
  const preparing = busy && !session || session?.status === "preparing";
  const item = session?.current;
  const imageKey = session && item?.image_url ? `${session.token}:${item.index}:${item.image_url}:${imageAttempt}` : null;
  activeImageKey.current = imageKey;
  const imageState = !imageKey ? "ready" : imageResult?.key === imageKey ? imageResult.status : "loading";
  // A cached image can finish before passive effects run. Never reset a load
  // result in an effect; associate it with the exact task and image attempt.
  const imageRef = useCallback((element: HTMLImageElement | null) => {
    if (element?.complete && imageKey && activeImageKey.current === imageKey) {
      setImageResult({ key: imageKey, status: element.naturalWidth > 0 ? "ready" : "error" });
    }
  }, [imageKey]);
  const finishImage = (status: "ready" | "error") => {
    if (imageKey && activeImageKey.current === imageKey) setImageResult({ key: imageKey, status });
  };
  const payload = item?.payload ?? {};
  const options = Array.isArray(payload.options) ? payload.options as { id: string; text: string }[] : [];
  const correct = Array.isArray(payload.correct_option_ids) ? payload.correct_option_ids : [payload.correct_option_id];
  const reviewed = session ? session.saved + session.skipped : 0;
  const subjectLabel = session?.subject === "math" ? "Математика" : "Информатика";
  const taskTypeLabel = item?.task_type === "single_choice" ? "Один вариант"
    : item?.task_type === "multi_choice" ? "Несколько вариантов" : "Короткий ответ";
  const answerTypeLabel = payload.subtype === "int" ? "Целое число"
    : payload.subtype === "float" ? "Дробное число" : "Текст";
  const image = item?.image_url ? <>
    <figure className="task-upload-figure">
      <a href={item.image_url} target="_blank" rel="noreferrer" aria-label="Открыть изображение задания в полном размере">
        <img ref={imageRef} key={imageKey} src={item.image_url} alt={item.title} className="task-upload-image"
          onLoad={() => finishImage("ready")} onError={() => finishImage("error")} />
      </a>
      <figcaption>Нажмите на изображение, чтобы открыть полный размер</figcaption>
    </figure>
    {imageState === "loading" ? <p role="status" className="task-upload-muted">Загрузка изображения…</p> : null}
    {imageState === "error" ? <div role="alert" className="task-upload-alert"><p>Не удалось открыть изображение. Повторите его загрузку перед сохранением задания.</p>
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setImageAttempt((attempt) => attempt + 1)}>Повторить загрузку изображения</Button>
    </div> : null}
  </> : null;

  return <>
    <Button type="button" size="sm" variant="outline" className="task-upload-trigger" onClick={() => open ? setOpen(true) : fileInput.current?.click()} disabled={busy}>
      Загрузить архив
    </Button>
    <input ref={fileInput} type="file" accept=".zip,application/zip" hidden aria-label="Архив заданий"
      onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) void upload(file);
      }} />
    <Modal isOpen={open} title={complete ? "Результат загрузки" : "Проверка заданий"}
      description={complete ? undefined : "Просмотрите условие и ответ перед сохранением в банк заданий."}
      className={`task-upload-modal${complete ? " task-upload-report-modal" : ""}`}
      backdropClassName="task-upload-backdrop" closeOnBackdrop={Boolean(complete)} showCloseButton={Boolean(complete)}
      onClose={complete ? close : () => {}}
      footer={reviewing && item ? <>
        <div className="task-upload-actions">
          <Button type="button" size="sm" variant="ghost" className="task-upload-cancel" onClick={() => void act("cancel")} disabled={busy}>Отменить оставшуюся загрузку</Button>
          <div className="task-upload-next-actions">
            <Button type="button" size="sm" variant="outline" onClick={() => void act("skip")} disabled={busy}>Пропустить</Button>
            <Button type="button" size="sm" onClick={() => void act("save")} disabled={busy || Boolean(item.errors.length) || imageState !== "ready"}>Сохранить и далее</Button>
          </div>
        </div>
        <p className="task-upload-footer-note">Сохранённые задания останутся в банке. Пропущенные можно добавить вручную.</p>
      </> : complete ? <div className="task-upload-actions task-upload-actions-end"><Button type="button" size="sm" onClick={close}>Закрыть</Button></div> : undefined}>
      {error ? <p role="alert" className="task-upload-alert">{error}</p> : null}
      {preparing ? <div role="status" className="task-upload-preparing"><span className="task-upload-loading" aria-hidden="true" /><div><strong>Подготавливаем задания</strong><p>Проверка архива и загрузка изображений в хранилище…</p></div></div> : null}
      {reviewing && item ? <div className="task-upload-review">
        <div className="task-upload-overview">
          <p className="task-upload-pool">{session.pool_title}</p>
          <div className="task-upload-overview-row">
            <span className="task-upload-muted">{subjectLabel} · {session.grade} класс</span>
            <p role="status" className="task-upload-progress-label">Задание <strong>{session.current_number} из {session.total}</strong><span>Сохранено: {session.saved}</span><span>Пропущено: {session.skipped}</span></p>
          </div>
          <div className="task-upload-progress" role="progressbar" aria-label="Просмотр заданий" aria-valuemin={0} aria-valuemax={session.total} aria-valuenow={reviewed}>
            <span style={{ width: `${session.total ? reviewed / session.total * 100 : 0}%` }} />
          </div>
        </div>
        {item.errors.length ? <div role="alert" className="task-upload-alert"><strong>Задание требует исправления</strong><ul>{item.errors.map((message, index) => <li key={index}>{message}</li>)}</ul></div> : null}
        <div className="task-upload-columns">
          <article className="task-upload-card">
            <div className="task-upload-task-meta"><span className="task-upload-index">Задание {item.index}</span><span>{taskTypeLabel}</span></div>
            <h3 className="task-upload-task-title">{item.title}</h3>
            {payload.image_position === "before" ? image : null}
            <div className="admin-markdown-body task-upload-content" dangerouslySetInnerHTML={{ __html: renderMarkdown(item.content) }} />
            {payload.image_position !== "before" ? image : null}
          </article>
          <aside className="task-upload-answer">
            {options.length ? <><h4>Варианты ответов</h4><ul className="task-upload-options">{options.map((option) =>
              <li key={option.id} className={correct.includes(option.id) ? "is-correct" : ""}>
                <span className="task-upload-option-id">{option.id}</span><div>{option.text}{correct.includes(option.id) ? <small>Правильный ответ</small> : null}</div>
              </li>)}</ul></> : <><h4>Правильный ответ</h4><p className="task-upload-answer-value">{String(payload.expected ?? "—")}</p><span className="task-upload-answer-type">{answerTypeLabel}</span></>}
            {payload.subtype === "float" ? <p className="task-upload-answer-note">Погрешность: {String(payload.epsilon ?? 0.01)}</p> : null}
            {payload.subtype === "text" ? <p className="task-upload-answer-note">
              Регистр: {payload.case_insensitive === false ? "учитывается" : "не учитывается"};
              внешние пробелы: {payload.trim === false ? "учитываются" : "убираются"};
              повторные пробелы: {payload.collapse_spaces === false ? "учитываются" : "объединяются"}.
            </p> : null}
          </aside>
        </div>
      </div> : null}
      {complete ? <div className="task-upload-report">
        <div className={`task-upload-result-heading${session.status === "cancelled" ? " is-cancelled" : ""}`}>
          <span className="task-upload-result-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={session.status === "cancelled" ? "M8 8h8v8H8z" : "m5 12 4 4 10-10"} /></svg></span>
          <div><h3>{session.status === "cancelled" ? "Загрузка остановлена" : "Загрузка завершена"}</h3><p>{session.pool_title}</p></div>
        </div>
        <dl className="task-upload-totals">
          <div><dt>Всего заданий</dt><dd>{session.total}</dd></div>
          <div className="is-saved"><dt>Сохранено</dt><dd>{session.saved}</dd></div>
          <div><dt>Пропущено</dt><dd>{session.skipped}</dd></div>
        </dl>
        <p role="status" className="task-upload-report-status">Сохранено {session.saved} из {session.total}. Пропущено {session.skipped}.</p>
        {session.skipped_items.length ? <details className="task-upload-skipped">
          <summary>Пропущенные задания ({session.skipped_items.length})</summary>
          <ul>{session.skipped_items.map((skipped) => <li key={skipped.index}>
          <strong>Задание {skipped.index}</strong><span>{skipped.reason === "cancelled" ? "загрузка отменена" : skipped.reason === "validation_error" ? skipped.errors.join("; ") : "пропущено"}</span>
          </li>)}</ul>
        </details> : null}
        {session.skipped ? <p className="task-upload-muted">Пропущенные задания можно добавить вручную через админ-панель.</p> : null}
      </div> : null}
      {session?.status === "failed" ? <><p role="alert" className="task-upload-alert">{session.error}</p><Button size="sm" onClick={close}>Закрыть</Button></> : null}
      {!complete && (error || imageState === "error") && tokenRef.current ? <Button size="sm" variant="outline" onClick={() => void restore()} disabled={busy}>Обновить состояние</Button> : null}
      {!session && !busy && error ? <Button size="sm" variant="ghost" onClick={close}>Закрыть</Button> : null}
    </Modal>
  </>;
}
