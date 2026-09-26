import React, { useEffect, useRef, useState } from "react";
import type { ApiClient } from "@api";
import { Button, Modal } from "@ui";

export function AccountDeletionRequest({ client }: { client: ApiClient }) {
  const [request, setRequest] = useState<{ id: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const load = async () => {
    setError("");
    try { setRequest(await client.request({ path: "/users/me/deletion-request", method: "GET" })); setReady(true); }
    catch { setError("Не удалось проверить заявку на удаление."); }
  };
  useEffect(() => { void load(); }, [client]);
  const submit = async (cancel: boolean) => {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError("");
    try {
      const result = await client.request<{ id: number }>({ path: "/users/me/deletion-request", method: cancel ? "DELETE" : "POST", ...(cancel ? {} : { body: { confirmed: true } }) });
      setRequest(cancel ? null : result); setOpen(false);
    } catch { setError("Не удалось изменить заявку. Обновите её состояние и повторите."); }
    finally { saving.current = false; setBusy(false); }
  };
  return <section aria-label="Удаление аккаунта">
    <h3>Удаление аккаунта</h3>
    {request ? <><p role="status">Заявка на удаление отправлена. До её исполнения администратором вы можете её отменить.</p><Button type="button" variant="outline" isLoading={busy} onClick={() => void submit(true)}>Отменить заявку на удаление</Button></>
      : <Button type="button" variant="outline" disabled={!ready || busy} onClick={() => setOpen(true)}>Подать заявку на удаление аккаунта</Button>}
    {error ? <><p role="alert">{error}</p><Button type="button" disabled={busy} onClick={() => void load()}>Обновить состояние заявки</Button></> : null}
    <Modal isOpen={open} title="Удаление аккаунта" closeOnBackdrop={false} onClose={() => { if (!busy) setOpen(false); }}>
      <p>После обработки заявки администратором аккаунт, связи, попытки, ответы, результаты и дипломы будут удалены без возможности восстановления через сайт. Сейчас будет отправлена только заявка.</p>
      <Button type="button" disabled={busy} variant="outline" onClick={() => setOpen(false)}>Не удалять</Button>
      <Button type="button" isLoading={busy} onClick={() => void submit(false)}>Подтвердить отправку заявки</Button>
    </Modal>
  </section>;
}
