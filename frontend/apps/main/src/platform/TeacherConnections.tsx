import React, { useEffect, useState } from "react";
import type { ApiError, ManualTeacher, TeacherRelation, UserRead } from "@api";
import { Button, TextInput } from "@ui";
import type { PlatformApi } from "./platformApi";

const teacherName = (teacher: TeacherRelation) =>
  [teacher.teacher_surname, teacher.teacher_name, teacher.teacher_father_name].filter(Boolean).join(" ") || `Учитель №${teacher.teacher_id}`;

export function TeacherConnections({ api, user, onUserUpdated }: {
  api: PlatformApi;
  user: UserRead;
  onUserUpdated: (user: UserRead) => void;
}) {
  const [confirmed, setConfirmed] = useState<TeacherRelation[]>([]);
  const [pending, setPending] = useState<TeacherRelation[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [busyTeacherId, setBusyTeacherId] = useState<number | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [requestStatus, setRequestStatus] = useState<"idle" | "saving">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [manualName, setManualName] = useState("");
  const [manualSubject, setManualSubject] = useState("");
  const [manualSaving, setManualSaving] = useState(false);

  const load = async () => {
    setStatus("loading");
    try {
      const [confirmedItems, pendingItems] = await Promise.all([
        api.getTeachers("confirmed"),
        api.getTeachers("pending")
      ]);
      setConfirmed(confirmedItems ?? []);
      setPending(pendingItems ?? []);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  };
  useEffect(() => { void load(); }, [api]);

  const requestTeacher = async () => {
    const value = identifier.trim();
    if (!value) {
      setMessage("Введите логин или email учителя.");
      return;
    }
    setRequestStatus("saving");
    setMessage(null);
    try {
      await api.requestTeacher(value);
      setIdentifier("");
      setMessage("Запрос отправлен.");
      await load();
    } catch (error) {
      const code = (error as ApiError)?.code;
      setMessage(code === "user_not_found" || code === "user_not_teacher" ? "Учитель с таким логином или email не найден." : "Не удалось отправить запрос.");
    } finally {
      setRequestStatus("idle");
    }
  };

  const updateLink = async (teacherId: number, action: "confirm" | "remove") => {
    setBusyTeacherId(teacherId);
    setMessage(null);
    try {
      if (action === "confirm") await api.confirmTeacher(teacherId);
      else await api.removeTeacher(teacherId);
      await load();
    } catch {
      setMessage("Не удалось изменить связь с учителем.");
    } finally {
      setBusyTeacherId(null);
    }
  };

  const saveManual = async (next: ManualTeacher[]) => {
    setManualSaving(true);
    setMessage(null);
    try {
      onUserUpdated(await api.updateProfile({ manual_teachers: next }));
      return true;
    } catch {
      setMessage("Не удалось сохранить список учителей.");
      return false;
    } finally {
      setManualSaving(false);
    }
  };
  const addManual = async () => {
    const fullName = manualName.trim();
    const subject = manualSubject.trim();
    if (!fullName || !subject) {
      setMessage("Укажите ФИО и предмет учителя.");
      return;
    }
    const saved = await saveManual([...(user.manual_teachers ?? []), { id: Date.now(), full_name: fullName, subject }]);
    if (saved) {
      setManualName("");
      setManualSubject("");
    }
  };

  const incoming = pending.filter((item) => item.requested_by === "teacher");
  const outgoing = pending.filter((item) => item.requested_by !== "teacher");
  return (
    <section className="student-panel student-profile-section">
      <h2>Учителя</h2>
      {status === "loading" ? <p className="student-resource-state" role="status">Загружаем связи с учителями…</p> : null}
      {status === "error" ? <p className="student-resource-state is-error" role="alert">Не удалось загрузить связи с учителями.</p> : null}
      {incoming.length > 0 ? <div className="student-teacher-group"><h3>Входящие запросы</h3>{incoming.map((item) => <article className="student-teacher-row" key={item.id}><div><strong>{teacherName(item)}</strong><span>{item.teacher_subject || "Предмет не указан"}</span></div><div className="student-row-actions"><button type="button" className="student-primary-action" disabled={busyTeacherId === item.teacher_id} onClick={() => void updateLink(item.teacher_id, "confirm")}>Подтвердить</button><button type="button" className="student-secondary-action" disabled={busyTeacherId === item.teacher_id} onClick={() => void updateLink(item.teacher_id, "remove")}>Отклонить</button></div></article>)}</div> : null}
      <div className="student-profile-columns">
        <div className="student-profile-card">
          <h3>Запросить сопровождение</h3>
          <TextInput label="Логин или email учителя" name="teacherIdentifier" value={identifier} onChange={(event) => setIdentifier(event.target.value)} />
          <Button type="button" isLoading={requestStatus === "saving"} onClick={() => void requestTeacher()}>Отправить запрос</Button>
          {outgoing.length > 0 ? <div className="student-pending-list">{outgoing.map((item) => <p key={item.id}>Ожидает подтверждения: <strong>{teacherName(item)}</strong> <button type="button" onClick={() => void updateLink(item.teacher_id, "remove")}>Отменить</button></p>)}</div> : null}
        </div>
        <div className="student-profile-card">
          <h3>Добавить учителя вручную</h3>
          <TextInput label="ФИО учителя" name="manualTeacherName" value={manualName} onChange={(event) => setManualName(event.target.value)} />
          <TextInput label="Предмет" name="manualTeacherSubject" value={manualSubject} onChange={(event) => setManualSubject(event.target.value)} />
          <Button type="button" isLoading={manualSaving} onClick={() => void addManual()}>Добавить</Button>
        </div>
      </div>
      <div className="student-teacher-group">
        <h3>Мои учителя</h3>
        {confirmed.length === 0 && (user.manual_teachers ?? []).length === 0 ? <p className="student-resource-state">Список учителей пуст.</p> : null}
        {confirmed.map((item) => <article className="student-teacher-row" key={`linked-${item.id}`}><div><strong>{teacherName(item)}</strong><span>{item.teacher_subject || "Предмет не указан"}</span></div><button type="button" className="student-secondary-action" disabled={busyTeacherId === item.teacher_id} onClick={() => void updateLink(item.teacher_id, "remove")}>Удалить связь</button></article>)}
        {(user.manual_teachers ?? []).map((item) => <article className="student-teacher-row" key={`manual-${item.id}`}><div><strong>{item.full_name}</strong><span>{item.subject} · добавлен вручную</span></div><button type="button" className="student-secondary-action" disabled={manualSaving} onClick={() => void saveManual(user.manual_teachers.filter((teacher) => teacher.id !== item.id))}>Удалить</button></article>)}
      </div>
      {message ? <p className="student-form-message" role="status">{message}</p> : null}
    </section>
  );
}
