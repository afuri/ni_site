import React, { useEffect, useMemo, useState } from "react";
import type { ApiClient, ApiError, SchoolSubmission, SchoolSubmissionCreate, UserRead, UserUpdate } from "@api";
import { Button, TextInput } from "@ui";
import { SchoolDirectoryPicker, type SchoolSelectionValue } from "../components/SchoolDirectoryPicker";
import type { PlatformApi } from "./platformApi";
import { SchoolSubmissionModal } from "./SchoolSubmissionModal";
import { TeacherConnections } from "./TeacherConnections";
import { AccountDeletionRequest } from "../components/AccountDeletionRequest";

type ProfileForm = SchoolSelectionValue & {
  surname: string;
  name: string;
  fatherName: string;
  classGrade: string;
  gender: "" | "male" | "female";
};
type Errors = Partial<Record<keyof ProfileForm, string>>;

const cyrillicName = /^[А-ЯЁ][А-ЯЁа-яё -]+$/;
const fatherName = /^[А-ЯЁ][А-ЯЁа-яё-]*(?: [А-ЯЁ][А-ЯЁа-яё-]*)*$/;
const toForm = (user: UserRead): ProfileForm => ({
  surname: user.surname ?? "",
  name: user.name ?? "",
  fatherName: user.father_name ?? "",
  classGrade: user.class_grade === null ? "" : String(user.class_grade),
  gender: user.gender ?? "",
  regionId: user.region_id,
  schoolId: user.school_id,
  schoolQuery: user.school_short_name ?? "",
  schoolCity: user.city_name ?? "",
  schoolNotFound: !["selected", "not_required"].includes(user.school_status)
});

const statusCopy: Record<UserRead["school_status"], { title: string; text: string }> = {
  selected: { title: "Школа выбрана", text: "Регион, город и школа сохранены в профиле." },
  missing: { title: "Школа не выбрана", text: "Выберите школу из справочника или отправьте заявку на добавление." },
  submission_pending: { title: "Заявка рассматривается", text: "Участие в олимпиаде доступно, но диплом появится после подтверждения школы." },
  submission_rejected: { title: "Заявка требует исправления", text: "Проверьте комментарий администратора и отправьте исправленные сведения." },
  not_required: { title: "Школа не требуется", text: "Для дошкольника достаточно выбранного региона." }
};

export function StudentProfile({ user, client, api, onUserUpdated }: {
  user: UserRead;
  client: ApiClient;
  api: PlatformApi;
  onUserUpdated: (user: UserRead) => void;
}) {
  const [form, setForm] = useState<ProfileForm>(() => toForm(user));
  const [savedForm, setSavedForm] = useState<ProfileForm>(() => toForm(user));
  const [errors, setErrors] = useState<Errors>({});
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [submission, setSubmission] = useState<SchoolSubmission | null>(null);
  const [submissionOpen, setSubmissionOpen] = useState(false);
  const [submissionSaving, setSubmissionSaving] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [regionIsOther, setRegionIsOther] = useState(false);

  useEffect(() => {
    const next = toForm(user);
    setForm(next);
    setSavedForm(next);
  }, [user]);

  useEffect(() => {
    if (!["submission_pending", "submission_rejected"].includes(user.school_status)) {
      setSubmission(null);
      return;
    }
    api.getSchoolSubmission().then(setSubmission).catch(() => setSubmission(null));
  }, [api, user.school_status]);

  useEffect(() => {
    if (!user.region_id) {
      setRegionIsOther(false);
      return;
    }
    const controller = new AbortController();
    client.lookup.regions({ limit: 100, signal: controller.signal })
      .then((regions) => setRegionIsOther(regions.some((region) => region.id === user.region_id && region.is_other)))
      .catch((error) => { if ((error as Error).name !== "AbortError") setRegionIsOther(false); });
    return () => controller.abort();
  }, [client, user.region_id]);

  const dirty = useMemo(() => (Object.keys(form) as Array<keyof ProfileForm>).some((key) => form[key] !== savedForm[key]), [form, savedForm]);
  const setField = <K extends keyof ProfileForm>(field: K, value: ProfileForm[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setMessage(null);
  };
  const setGrade = (value: string) => {
    setForm((current) => ({
      ...current,
      classGrade: value,
      ...(value === "0" ? { schoolId: null, schoolQuery: "", schoolCity: "", schoolNotFound: false } : current.classGrade === "0" ? { schoolId: null, schoolQuery: "", schoolCity: "", schoolNotFound: true } : {})
    }));
    setErrors((current) => ({ ...current, classGrade: undefined, schoolQuery: undefined }));
  };

  const validate = () => {
    const next: Errors = {};
    if (!cyrillicName.test(form.surname.trim())) next.surname = "Введите фамилию кириллицей с заглавной буквы.";
    if (!cyrillicName.test(form.name.trim())) next.name = "Введите имя кириллицей с заглавной буквы.";
    if (form.fatherName.trim() && !fatherName.test(form.fatherName.trim())) next.fatherName = "Введите отчество кириллицей с заглавной буквы.";
    if (!form.gender) next.gender = "Выберите пол.";
    if (form.classGrade === "") next.classGrade = "Выберите класс.";
    if (form.regionId === null) next.regionId = "Выберите регион школы.";
    if (form.classGrade !== "0" && form.schoolId === null && !form.schoolNotFound) next.schoolQuery = "Выберите школу или отметьте, что её нет в списке.";
    if (user.class_grade === 0 && form.classGrade !== "0" && (form.schoolId === null || form.schoolNotFound)) next.schoolQuery = "Для перехода из дошкольников в ученики необходимо выбрать школу из списка.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;
    const normalized = { ...form, surname: form.surname.trim(), name: form.name.trim(), fatherName: form.fatherName.trim() };
    setForm(normalized);
    const gradeChanged = normalized.classGrade !== savedForm.classGrade;
    const geographyChanged = gradeChanged || normalized.regionId !== savedForm.regionId || normalized.schoolId !== savedForm.schoolId || normalized.schoolNotFound !== savedForm.schoolNotFound;
    const payload: UserUpdate = {
      surname: normalized.surname,
      name: normalized.name,
      father_name: normalized.fatherName || null,
      class_grade: Number(normalized.classGrade),
      gender: normalized.gender || null,
      ...(geographyChanged ? {
        region_id: normalized.regionId,
        school_id: normalized.classGrade === "0" ? null : normalized.schoolId,
        school_not_found: normalized.classGrade === "0" ? false : normalized.schoolNotFound
      } : {})
    };
    setSaveStatus("saving");
    setMessage(null);
    try {
      const updated = await api.updateProfile(payload);
      onUserUpdated(updated);
      setMessage("Данные сохранены.");
    } catch (error) {
      const code = (error as ApiError)?.code;
      const copy: Record<string, string> = {
        school_region_mismatch: "Выбранная школа относится к другому региону.",
        school_selection_required: user.class_grade === 0 && form.classGrade !== "0"
          ? "Для перехода из дошкольников в ученики необходимо выбрать школу из списка."
          : "Выберите школу или отметьте, что её нет в списке.",
        region_not_found: "Выбранный регион не найден.",
        school_not_found: "Выбранная школа не найдена."
      };
      setMessage(copy[code] ?? "Не удалось сохранить изменения.");
    } finally {
      setSaveStatus("idle");
    }
  };

  const createSubmission = async (payload: SchoolSubmissionCreate) => {
    setSubmissionSaving(true);
    setSubmissionError(null);
    try {
      setSubmission(await api.createSchoolSubmission(payload));
      setSubmissionOpen(false);
      onUserUpdated(await api.getProfile());
    } catch (error) {
      const apiError = error as ApiError;
      setSubmissionError(apiError.code === "school_submission_exists" ? "Заявка уже отправлена и ожидает рассмотрения." : apiError.message || "Не удалось отправить заявку.");
    } finally {
      setSubmissionSaving(false);
    }
  };

  const requestEmailVerification = async () => {
    setEmailStatus("sending");
    try {
      await api.requestEmailVerification(user.email);
      setEmailStatus("sent");
    } catch {
      setEmailStatus("error");
    }
  };

  const schoolState = statusCopy[user.school_status];
  return (
    <div className="student-profile-page">
      <section className="student-panel student-profile-section">
        <header className="student-profile-identity"><i aria-hidden="true">{(user.name || user.login).slice(0, 1).toUpperCase()}</i><div><h2>{[user.surname, user.name, user.father_name].filter(Boolean).join(" ") || user.login}</h2><p>{user.email} · {user.is_email_verified ? "email подтверждён" : "email не подтверждён"}</p></div></header>
        <form className="student-profile-form" onSubmit={save}>
          <div className="student-profile-columns">
            <TextInput label="Фамилия" name="profileSurname" value={form.surname} error={errors.surname} onChange={(event) => setField("surname", event.target.value)} />
            <TextInput label="Имя" name="profileName" value={form.name} error={errors.name} onChange={(event) => setField("name", event.target.value)} />
            <TextInput label="Отчество" name="profileFatherName" value={form.fatherName} error={errors.fatherName} onChange={(event) => setField("fatherName", event.target.value)} />
            <label className="field"><span className="field-label">Пол</span><select className={`field-input ${errors.gender ? "field-input-error" : ""}`} value={form.gender} onChange={(event) => setField("gender", event.target.value as ProfileForm["gender"])}><option value="">Выберите пол</option><option value="male">Мужской</option><option value="female">Женский</option></select>{errors.gender ? <span className="field-helper field-helper-error">{errors.gender}</span> : null}</label>
            <label className="field"><span className="field-label">Класс</span><select className={`field-input ${errors.classGrade ? "field-input-error" : ""}`} value={form.classGrade} onChange={(event) => setGrade(event.target.value)}><option value="">Выберите класс</option>{Array.from({ length: 12 }, (_, grade) => <option key={grade} value={grade}>{grade === 0 ? "Дошкольник" : `${grade} класс`}</option>)}</select>{errors.classGrade ? <span className="field-helper field-helper-error">{errors.classGrade}</span> : null}</label>
          </div>
          <div className="student-account-meta"><span>Логин: <strong>{user.login}</strong></span>{!user.is_email_verified ? <Button type="button" variant="outline" isLoading={emailStatus === "sending"} onClick={() => void requestEmailVerification()}>Отправить письмо повторно</Button> : null}{emailStatus === "sent" ? <span role="status">Письмо отправлено.</span> : null}{emailStatus === "error" ? <span className="field-helper-error" role="alert">Не удалось отправить письмо.</span> : null}</div>
          <h3 className="student-profile-geography-title">Регион и школа</h3>
          <div className={`student-school-status is-${user.school_status}`}><strong>{schoolState.title}</strong><span>{schoolState.text}</span>{user.school_status === "submission_rejected" && submission?.admin_comment ? <span>Комментарий администратора: {submission.admin_comment}</span> : null}</div>
          <SchoolDirectoryPicker client={client} value={form} onChange={(selection) => { setForm((current) => ({ ...current, ...selection })); setErrors((current) => ({ ...current, regionId: undefined, schoolQuery: undefined })); }} role="student" classGrade={form.classGrade} regionError={errors.regionId} schoolError={errors.schoolQuery} idPrefix="student-platform-profile" />
          {message ? <p className="student-form-message" role="status">{message}</p> : null}
          <div className="student-form-actions"><Button type="submit" isLoading={saveStatus === "saving"} disabled={!dirty}>Сохранить</Button><Button type="button" variant="outline" disabled={!dirty} onClick={() => { setForm(savedForm); setErrors({}); setMessage(null); }}>Отмена</Button></div>
        </form>
        {user.school_status === "missing" || user.school_status === "submission_rejected" ? <div className="student-school-submission-action"><Button type="button" onClick={() => { setSubmissionError(null); setSubmissionOpen(true); }}>{user.school_status === "submission_rejected" ? "Исправить заявку" : "Отправить сведения о школе"}</Button></div> : null}
      </section>
      <TeacherConnections api={api} user={user} onUserUpdated={onUserUpdated} />
      <AccountDeletionRequest client={client} />
      <SchoolSubmissionModal open={submissionOpen} regionIsOther={regionIsOther} submission={submission} saving={submissionSaving} serverError={submissionError} onClose={() => { setSubmissionOpen(false); setSubmissionError(null); }} onSubmit={createSubmission} />
    </div>
  );
}
