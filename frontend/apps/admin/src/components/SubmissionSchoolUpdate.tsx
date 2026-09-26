import React, { useEffect, useRef, useState } from "react";
import { Button, Table, TextInput } from "@ui";
import type { ApiError } from "@api";
import { adminApiClient } from "../lib/adminClient";

type Submission = {
  id: number; user_id: number; city_name: string; school_short_name: string;
  school_full_name: string | null; address: string | null; url: string | null; email: string | null;
};
type School = {
  id: number; region_id: number; region_name: string; city_name: string;
  short_name: string; full_name: string; address: string; url: string | null;
  email: string | null; user_count: number; is_active: boolean; updated_at: string;
};
type Details = {
  city_name: string; short_name: string; full_name: string; address: string; url: string; email: string;
};
const fields: Array<{ key: keyof Details; label: string; maxLength: number }> = [
  { key: "city_name", label: "Город", maxLength: 120 },
  { key: "short_name", label: "Краткое название", maxLength: 255 },
  { key: "full_name", label: "Полное название", maxLength: 512 },
  { key: "address", label: "Адрес", maxLength: 512 },
  { key: "url", label: "Сайт", maxLength: 2048 },
  { key: "email", label: "Email", maxLength: 255 }
];

export function SubmissionSchoolUpdate({ submission, onCompleted, onSavingChange }: {
  submission: Submission;
  onCompleted: () => Promise<void>;
  onSavingChange: (saving: boolean) => void;
}) {
  const [schoolId, setSchoolId] = useState("");
  const [school, setSchool] = useState<School | null>(null);
  const [details, setDetails] = useState<Details | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "saving">("idle");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const saving = useRef(false);
  useEffect(() => () => { requestId.current += 1; }, []);

  const loadSchool = async () => {
    const id = Number(schoolId);
    if (!Number.isSafeInteger(id) || id <= 0) {
      setError("Введите положительный целочисленный ID школы.");
      return;
    }
    const request = ++requestId.current;
    setSchool(null); setDetails(null); setError(null); setConfirming(false); setStatus("loading");
    try {
      const target = await adminApiClient.request<School>({ path: `/admin/schools/${id}`, method: "GET" });
      if (request !== requestId.current) return;
      if (!target.is_active) { setError("Школа неактивна. Сначала проверьте её в справочнике."); return; }
      if (!target.updated_at) { setError("API не поддерживает подтверждённое обновление школы. Обновите backend."); return; }
      setSchool(target);
      setDetails({
        city_name: submission.city_name,
        short_name: submission.school_short_name,
        full_name: submission.school_full_name || target.full_name,
        address: submission.address || target.address,
        url: submission.url || target.url || "",
        email: submission.email || target.email || ""
      });
    } catch (cause) {
      if (request === requestId.current) setError((cause as ApiError)?.code === "school_not_found" ? "Школа с таким ID не найдена." : "Не удалось загрузить школу.");
    } finally {
      if (request === requestId.current) setStatus("idle");
    }
  };

  const preview = (event: React.FormEvent) => {
    event.preventDefault();
    if (!school || !details) return;
    const normalized = Object.fromEntries(Object.entries(details).map(([key, value]) => [key, value.trim()])) as Details;
    if (fields.some(({ key }) => key !== "email" && !normalized[key])) {
      setError("Заполните город, оба названия, адрес и сайт.");
      return;
    }
    setDetails(normalized); setError(null); setConfirming(true);
  };

  const confirm = async () => {
    if (!school || !details || !confirming || saving.current) return;
    saving.current = true; setStatus("saving"); setError(null); onSavingChange(true);
    try {
      await adminApiClient.request({
        path: `/admin/school-submissions/${submission.id}/approve`, method: "POST",
        body: { update_school: {
          school_id: school.id, expected_updated_at: school.updated_at, confirmed: true,
          ...details, email: details.email || null
        } }
      });
      await onCompleted();
    } catch (cause) {
      const code = (cause as ApiError)?.code;
      const messages: Record<string, string> = {
        school_update_conflict: "Данные школы изменились после загрузки. Вернитесь к редактированию и загрузите школу заново.",
        school_submission_not_pending: "Эта заявка уже обработана. Обновите список заявок.",
        school_inactive: "Школа или её география неактивна. Проверьте справочник.",
        region_inactive: "Город или регион неактивен. Проверьте справочник.",
        school_not_found: "Школа больше не найдена."
      };
      setError(messages[code ?? ""] ?? "Не удалось обновить школу и одобрить заявку. Проверьте поля и повторите.");
    } finally {
      saving.current = false; setStatus("idle"); onSavingChange(false);
    }
  };

  return <section className="admin-form" aria-label="Обновление школы из заявки">
    <p className="admin-hint">Укажите ID школы, данные которой устарели. Регион, ID, служебные признаки и связи пользователей сохраняются. Город можно исправить в пределах региона этой школы.</p>
    {!confirming ? <>
      <div className="admin-toolbar-actions">
        <TextInput label="ID обновляемой школы" name="replacementSchoolId" inputMode="numeric" value={schoolId} onChange={(event) => {
          requestId.current += 1; setSchoolId(event.target.value); setSchool(null); setDetails(null); setStatus("idle"); setError(null);
        }} />
        <Button type="button" variant="outline" onClick={() => void loadSchool()} isLoading={status === "loading"}>Загрузить школу</Button>
      </div>
      {school && details ? <form className="admin-form" onSubmit={preview}>
        <div className="admin-alert"><strong>Школа #{school.id}: {school.short_name}</strong><p>Регион: {school.region_name}. Город: {school.city_name}. Привязано пользователей: {school.user_count}.</p></div>
        <p className="admin-hint">Ниже данные из заявки. Если адрес, сайт или email в заявке отсутствуют, сохранены текущие значения школы. Проверьте их перед подтверждением.</p>
        <div className="admin-form-grid">{fields.map(({ key, label, maxLength }) =>
          <TextInput key={key} label={label} name={`replacement-${key}`} required={key !== "email"} type={key === "email" ? "email" : "text"} maxLength={maxLength} value={details[key]} onChange={(event) => setDetails({ ...details, [key]: event.target.value })} />
        )}</div>
        <Button type="submit">Проверить изменения</Button>
      </form> : null}
    </> : school && details ? <>
      <h3>Подтверждение обновления школы #{school.id}</h3>
      <p>Регион: <strong>{school.region_name}</strong>. Эти изменения будут видны всем пользователям школы (сейчас: {school.user_count}). Заявка #{submission.id} будет одобрена, пользователь #{submission.user_id} будет привязан к школе #{school.id}.</p>
      <div className="admin-table-scroll admin-school-update-comparison"><Table><thead><tr><th>Поле</th><th>Было</th><th>Станет</th></tr></thead><tbody>{fields.map(({ key, label }) =>
        <tr key={key}><th scope="row">{label}</th><td>{school[key] || "—"}</td><td>{details[key] || "—"}</td></tr>
      )}</tbody></Table></div>
      <p className="admin-hint">Признаки «Консорциум», «Петерсон», «Сириус», «Партнёр», «Платформа», куратор и информация о школе не изменятся.</p>
      <div className="admin-toolbar-actions"><Button type="button" variant="outline" disabled={status === "saving"} onClick={() => { setConfirming(false); setError(null); }}>Назад к редактированию</Button><Button type="button" onClick={() => void confirm()} isLoading={status === "saving"}>Подтвердить обновление и одобрить</Button></div>
    </> : null}
    {error ? <p className="admin-error" role="alert">{error}</p> : null}
  </section>;
}
