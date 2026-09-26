import React, { useEffect, useRef, useState } from "react";
import { Button, Modal, Table, TextInput } from "@ui";
import type { ApiError } from "@api";
import { adminApiClient } from "../lib/adminClient";

type Request = { id: number; user_id: number; login: string; created_at: string };
type Preview = { user_id: number; login: string; email: string; full_name: string; role: string; attempts: number; links: number };
export function AccountDeletionPanel({ onDeleted }: { onDeleted: (id: number) => void }) {
  const [id, setId] = useState("");
  const [rows, setRows] = useState<Request[]>([]);
  const [jobs, setJobs] = useState<number[]>([]);
  const [page, setPage] = useState(0);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [requestId, setRequestId] = useState<number | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [message, setMessage] = useState("");
  const [listError, setListError] = useState("");
  const load = async () => {
    try {
      const [requests, cleanup] = await Promise.all([
        adminApiClient.request<Request[]>({ path: `/admin/account-deletions/requests?offset=${page * 50}&limit=51`, method: "GET" }),
        adminApiClient.request<number[]>({ path: "/admin/account-deletions/cleanup", method: "GET" })
      ]);
      setRows(requests); setJobs(cleanup); setListError("");
    } catch { setListError("Не удалось загрузить заявки или очередь файлов. Обновите список."); }
  };
  useEffect(() => { void load(); }, [page]);
  const explain = (error: unknown) => {
    const messages: Record<string, string> = {
      user_not_found: "Пользователь не найден. Возможно, он уже удалён. Обновите списки.",
      admin_deletion_forbidden: "Удаление администраторов запрещено.",
      deletion_request_cancelled: "Заявка отменена пользователем. Удаление не выполнено.",
      deletion_target_changed: "Данные пользователя изменились. Загрузите его заново."
    };
    return messages[(error as ApiError)?.code ?? ""] ?? "Операция не завершена. Обновите списки: если аккаунт уже удалён, проверьте очередь очистки файлов.";
  };
  const inspect = async (target: number, application: number | null = null) => {
    if (!Number.isSafeInteger(target) || target <= 0) { setMessage("Введите положительный целочисленный ID."); return; }
    if (saving.current) return;
    saving.current = true; setBusy(true); setMessage("");
    try {
      const data = await adminApiClient.request<Preview>({ path: `/admin/account-deletions/${target}`, method: "GET" });
      setPreview(data); setRequestId(application); setConfirmation("");
    } catch (error) { setMessage(explain(error)); }
    finally { saving.current = false; setBusy(false); }
  };
  const remove = async () => {
    if (!preview || confirmation !== String(preview.user_id) || saving.current) return;
    saving.current = true; setBusy(true); setMessage("");
    try {
      const result = await adminApiClient.request<{ files_pending: boolean }>({
        path: `/admin/account-deletions/${preview.user_id}`, method: "DELETE",
        body: { confirmed: true, expected_login: preview.login, request_id: requestId }
      });
      onDeleted(preview.user_id); setPreview(null); setId("");
      setMessage(result.files_pending ? "Аккаунт и данные БД удалены. Файлы ещё не удалены — ожидают очистки в хранилище." : "Аккаунт, связанные данные и файлы удалены.");
      await load();
    } catch (error) { setMessage(explain(error)); }
    finally { saving.current = false; setBusy(false); }
  };
  const retry = async (target: number) => {
    if (saving.current) return;
    saving.current = true; setBusy(true);
    try {
      const result = await adminApiClient.request<{ files_pending: boolean }>({ path: `/admin/account-deletions/${target}/cleanup`, method: "POST" });
      setMessage(result.files_pending ? "Файлы пока не удалены. Проверьте доступность и права хранилища." : "Очистка файлов завершена.");
      await load();
    } catch (error) { setMessage(explain(error)); }
    finally { saving.current = false; setBusy(false); }
  };
  return <section className="admin-card" aria-label="Удаление пользователей">
    <h2>Удаление пользователей</h2>
    <p>Безвозвратное удаление аккаунта, связей, попыток, ответов, результатов и дипломов. Школы и общие учебные материалы сохраняются. Администраторов удалить нельзя.</p>
    <form className="admin-toolbar-actions" onSubmit={(event) => { event.preventDefault(); void inspect(Number(id)); }}>
      <TextInput label="ID удаляемого пользователя" name="deleteUserId" inputMode="numeric" value={id} disabled={busy} onChange={(event) => setId(event.target.value)} />
      <Button type="submit" disabled={busy}>Проверить пользователя</Button>
    </form>
    <h3>Заявки на удаление</h3>
    {listError ? <p role="alert">{listError}</p> : null}
    <Button type="button" disabled={busy} variant="outline" onClick={() => void load()}>Обновить заявки и очередь</Button>
    <div className="admin-table-scroll"><Table><thead><tr><th>Действие</th><th>ID пользователя</th><th>Логин</th><th>Дата заявки</th></tr></thead><tbody>{rows.slice(0, 50).map((row) => <tr key={row.id}><td><Button type="button" disabled={busy} onClick={() => void inspect(row.user_id, row.id)}>Рассмотреть удаление</Button></td><td>{row.user_id}</td><td>{row.login}</td><td>{new Date(row.created_at).toLocaleString("ru-RU")}</td></tr>)}</tbody></Table></div>
    {!rows.length && !listError ? <p>Заявок нет.</p> : null}
    <div className="admin-toolbar-actions"><Button type="button" disabled={busy || page === 0} onClick={() => setPage(page - 1)}>Предыдущие заявки</Button><span>Страница {page + 1}</span><Button type="button" disabled={busy || rows.length <= 50} onClick={() => setPage(page + 1)}>Следующие заявки</Button></div>
    {jobs.length ? <><h3>Файлы ожидают удаления</h3><p>Показаны первые 100 записей. Аккаунты уже удалены; автоматическая очистка требует запущенных worker и beat.</p>{jobs.map((target) => <p key={target}>Пользователь #{target} <Button type="button" disabled={busy} onClick={() => void retry(target)}>Повторить очистку #{target}</Button></p>)}</> : null}
    {message ? <p role="status">{message}</p> : null}
    <Modal isOpen={preview !== null} title="Подтверждение удаления пользователя" closeOnBackdrop={false} onClose={() => { if (!busy) { setPreview(null); setMessage(""); } }}>
      {preview ? <><p>#{preview.user_id}: {preview.full_name} — {preview.login}, {preview.email}. Роль: {preview.role}.</p><p>Попыток: {preview.attempts}. Связей: {preview.links}. Все данные аккаунта и дипломы будут удалены. Отменить выполненное удаление нельзя.</p><TextInput label="Для подтверждения введите ID пользователя" name="confirmDeleteId" value={confirmation} disabled={busy} onChange={(event) => setConfirmation(event.target.value)} /><Button type="button" variant="outline" disabled={busy} onClick={() => setPreview(null)}>Отмена</Button><Button type="button" isLoading={busy} disabled={confirmation !== String(preview.user_id)} onClick={() => void remove()}>Удалить пользователя навсегда</Button>{message ? <p role="alert">{message}</p> : null}</> : null}
    </Modal>
  </section>;
}
