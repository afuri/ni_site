import React, { useEffect, useState } from "react";
import type { SchoolSubmission, SchoolSubmissionCreate } from "@api";
import { Button, Modal, TextInput } from "@ui";

type FormState = {
  countryName: string;
  regionName: string;
  cityName: string;
  schoolShortName: string;
  schoolFullName: string;
  address: string;
  url: string;
  email: string;
};

const emptyForm: FormState = {
  countryName: "", regionName: "", cityName: "", schoolShortName: "",
  schoolFullName: "", address: "", url: "", email: ""
};

const fromSubmission = (submission: SchoolSubmission | null): FormState => submission ? {
  countryName: submission.country_name ?? "",
  regionName: submission.region_name ?? "",
  cityName: submission.city_name,
  schoolShortName: submission.school_short_name,
  schoolFullName: submission.school_full_name ?? "",
  address: submission.address ?? "",
  url: submission.url ?? "",
  email: submission.email ?? ""
} : emptyForm;

export function SchoolSubmissionModal({ open, regionIsOther, submission, saving, serverError, onClose, onSubmit }: {
  open: boolean;
  regionIsOther: boolean;
  submission: SchoolSubmission | null;
  saving: boolean;
  serverError: string | null;
  onClose: () => void;
  onSubmit: (payload: SchoolSubmissionCreate) => Promise<void> | void;
}) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [validationError, setValidationError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setForm(fromSubmission(submission));
      setValidationError(null);
    }
  }, [open, submission]);

  const setField = (field: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setValidationError(null);
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const normalized = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim()])) as FormState;
    setForm(normalized);
    if (!normalized.cityName || !normalized.schoolShortName || !normalized.schoolFullName || !normalized.url) {
      setValidationError("Укажите город, краткое и полное названия школы, а также сайт.");
      return;
    }
    if (regionIsOther && (!normalized.countryName || !normalized.regionName)) {
      setValidationError("Для другой страны укажите страну и регион.");
      return;
    }
    void onSubmit({
      country_name: regionIsOther ? normalized.countryName : null,
      region_name: regionIsOther ? normalized.regionName : null,
      city_name: normalized.cityName,
      school_short_name: normalized.schoolShortName,
      school_full_name: normalized.schoolFullName,
      address: normalized.address || null,
      url: normalized.url,
      email: normalized.email || null
    });
  };

  return (
    <Modal isOpen={open} onClose={onClose} closeOnBackdrop={false} title="Добавление школы" className="student-school-submission-modal">
      <form className="student-profile-form" onSubmit={submit}>
        <div className="student-submission-instructions">
          <p>Информацию для заполнения можно найти на официальном сайте школы в разделе &lt;Сведения об образовательной организации&gt;.</p>
          <p>Наименования населенного пункта указываем без слов &quot;город, поселок, село&quot;.</p>
          <p>Заявка не создаёт школу автоматически. Сведения проверит администратор.</p>
        </div>
        {regionIsOther ? <><TextInput label="Страна" name="submissionCountry" required value={form.countryName} onChange={(event) => setField("countryName", event.target.value)} /><TextInput label="Регион школы" name="submissionRegion" required value={form.regionName} onChange={(event) => setField("regionName", event.target.value)} /></> : null}
        <TextInput label="Город" name="submissionCity" required value={form.cityName} onChange={(event) => setField("cityName", event.target.value)} />
        <TextInput label="Краткое название школы" name="submissionShortName" required placeholder="ГБОУ СОШ №1" value={form.schoolShortName} onChange={(event) => setField("schoolShortName", event.target.value)} />
        <TextInput label="Полное название школы" name="submissionFullName" required placeholder="Государственное бюджетное общеобразовательное учреждение средняя общеобразовательная школа №1" value={form.schoolFullName} onChange={(event) => setField("schoolFullName", event.target.value)} />
        <TextInput label="Адрес" name="submissionAddress" value={form.address} onChange={(event) => setField("address", event.target.value)} />
        <TextInput label="Сайт" name="submissionUrl" required placeholder="www.school.ru" value={form.url} onChange={(event) => setField("url", event.target.value)} />
        <TextInput label="Email школы" name="submissionEmail" type="email" placeholder="mail@mail.ru" value={form.email} onChange={(event) => setField("email", event.target.value)} />
        {validationError || serverError ? <p className="student-form-error" role="alert">{validationError || serverError}</p> : null}
        <div className="student-form-actions"><Button type="submit" isLoading={saving}>Отправить заявку</Button></div>
      </form>
    </Modal>
  );
}
