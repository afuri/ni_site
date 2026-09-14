import React, { useEffect, useState } from "react";
import { Button, Table, TextInput } from "@ui";
import type { RegionLookup, SchoolLookup } from "@api";
import { adminApiClient } from "../lib/adminClient";

type SchoolRead = {
  id: number; city_id: number; city_name: string; region_id: number; region_name: string; user_count: number;
  full_name: string; short_name: string; address: string; url: string | null; email: string | null;
  is_sirius: boolean; is_consortium: boolean; is_peterson: boolean; is_partner: boolean;
  is_platform: boolean; curator: string | null; info: string | null; is_active: boolean;
};
type CityRead = { id: number; region_id: number; name: string; is_active: boolean };
type SubmissionStatus = "pending" | "approved" | "rejected";
type SchoolSubmission = {
  id: number; user_id: number; region_id: number; country_name: string | null; region_name: string | null;
  city_name: string; school_short_name: string; school_full_name: string | null; address: string | null;
  url: string | null; email: string | null; status: SubmissionStatus; admin_comment: string | null;
  resolved_school_id: number | null; created_at: string;
};
type SchoolForm = {
  regionId: string; cityId: string; fullName: string; shortName: string; address: string; url: string;
  email: string; curator: string; info: string; isSirius: boolean; isConsortium: boolean;
  isPeterson: boolean; isPartner: boolean; isPlatform: boolean; isActive: boolean;
};
type SchoolFilters = {
  regionId: string; cityId: string; query: string; isActive: string; isSirius: string;
  isConsortium: string; isPeterson: string; isPartner: string; isPlatform: string;
};

const emptySchoolForm: SchoolForm = {
  regionId: "", cityId: "", fullName: "", shortName: "", address: "", url: "", email: "",
  curator: "", info: "", isSirius: false, isConsortium: false, isPeterson: false,
  isPartner: false, isPlatform: false, isActive: true
};
const emptyFilters: SchoolFilters = {
  regionId: "", cityId: "", query: "", isActive: "", isSirius: "", isConsortium: "",
  isPeterson: "", isPartner: "", isPlatform: ""
};

function BooleanFilter({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="field"><span className="field-label">{label}</span><select className="field-input" value={value} onChange={(event) => onChange(event.target.value)}><option value="">Все</option><option value="true">Да</option><option value="false">Нет</option></select></label>;
}
function Flag({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="admin-check"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>;
}
function buildSchoolParams(filters: SchoolFilters) {
  const params = new URLSearchParams();
  if (filters.regionId) params.set("region_id", filters.regionId);
  if (filters.cityId) params.set("city_id", filters.cityId);
  if (filters.query.trim()) params.set("query", filters.query.trim());
  if (filters.isActive) params.set("is_active", filters.isActive);
  if (filters.isSirius) params.set("is_sirius", filters.isSirius);
  if (filters.isConsortium) params.set("is_consortium", filters.isConsortium);
  if (filters.isPeterson) params.set("is_peterson", filters.isPeterson);
  if (filters.isPartner) params.set("is_partner", filters.isPartner);
  if (filters.isPlatform) params.set("is_platform", filters.isPlatform);
  return params;
}

export function SchoolsPage() {
  const pageSize = 50;
  const submissionPageSize = 25;
  const [regions, setRegions] = useState<RegionLookup[]>([]);
  const [filterCities, setFilterCities] = useState<CityRead[]>([]);
  const [formCities, setFormCities] = useState<CityRead[]>([]);
  const [schools, setSchools] = useState<SchoolRead[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<SchoolFilters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<SchoolFilters>(emptyFilters);
  const [listStatus, setListStatus] = useState<"idle" | "loading" | "error">("idle");
  const [listError, setListError] = useState<string | null>(null);
  const [form, setForm] = useState<SchoolForm>(emptySchoolForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formStatus, setFormStatus] = useState<"idle" | "saving" | "error">("idle");
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<SchoolSubmission[]>([]);
  const [submissionStatusFilter, setSubmissionStatusFilter] = useState<SubmissionStatus | "">("pending");
  const [submissionPage, setSubmissionPage] = useState(1);
  const [submissionStatus, setSubmissionStatus] = useState<"idle" | "loading" | "saving" | "error">("idle");
  const [selectedSubmission, setSelectedSubmission] = useState<SchoolSubmission | null>(null);
  const [approvalMode, setApprovalMode] = useState<"existing" | "new">("existing");
  const [existingQuery, setExistingQuery] = useState("");
  const [existingCandidates, setExistingCandidates] = useState<SchoolLookup[]>([]);
  const [existingSchoolId, setExistingSchoolId] = useState<number | null>(null);
  const [newSchoolForm, setNewSchoolForm] = useState<SchoolForm>(emptySchoolForm);
  const [rejectComment, setRejectComment] = useState("");
  const [duplicateIds, setDuplicateIds] = useState<number[] | null>(null);
  const [submissionMessage, setSubmissionMessage] = useState<string | null>(null);

  const loadCities = async (regionId: string) => regionId ? adminApiClient.request<CityRead[]>({ path: `/admin/schools/cities?region_id=${encodeURIComponent(regionId)}&limit=5000`, method: "GET" }) : [];
  const loadSchools = async (pageToLoad: number, nextFilters = appliedFilters) => {
    setListStatus("loading"); setListError(null);
    const params = buildSchoolParams(nextFilters); const summaryQuery = params.toString();
    params.set("limit", String(pageSize)); params.set("offset", String((pageToLoad - 1) * pageSize));
    try {
      const [data, summary] = await Promise.all([
        adminApiClient.request<SchoolRead[]>({ path: `/admin/schools?${params}`, method: "GET" }),
        adminApiClient.request<{ total_count: number }>({ path: `/admin/schools/summary${summaryQuery ? `?${summaryQuery}` : ""}`, method: "GET" })
      ]);
      setSchools(data ?? []); setTotalCount(summary?.total_count ?? 0); setPage(pageToLoad); setListStatus("idle");
    } catch { setListStatus("error"); setListError("Не удалось загрузить список школ."); }
  };
  const loadSubmissions = async (pageToLoad: number, statusFilter = submissionStatusFilter) => {
    setSubmissionStatus("loading");
    const params = new URLSearchParams({ limit: String(submissionPageSize), offset: String((pageToLoad - 1) * submissionPageSize) });
    if (statusFilter) params.set("status", statusFilter);
    try {
      const data = await adminApiClient.request<SchoolSubmission[]>({ path: `/admin/school-submissions?${params}`, method: "GET" });
      setSubmissions(data ?? []); setSubmissionPage(pageToLoad); setSubmissionStatus("idle");
    } catch { setSubmissionStatus("error"); setSubmissionMessage("Не удалось загрузить заявки."); }
  };

  useEffect(() => {
    adminApiClient.request<RegionLookup[]>({ path: "/lookup/regions?limit=100", method: "GET" }).then(setRegions).catch(() => setRegions([]));
    void loadSchools(1, emptyFilters); void loadSubmissions(1, "pending");
  }, []);
  useEffect(() => { loadCities(filters.regionId).then(setFilterCities).catch(() => setFilterCities([])); }, [filters.regionId]);
  useEffect(() => { loadCities(form.regionId).then(setFormCities).catch(() => setFormCities([])); }, [form.regionId]);
  useEffect(() => {
    if (!selectedSubmission || approvalMode !== "existing" || existingQuery.trim().length < 2) { setExistingCandidates([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => adminApiClient.request<SchoolLookup[]>({ path: `/lookup/schools?region_id=${selectedSubmission.region_id}&query=${encodeURIComponent(existingQuery.trim())}&limit=20`, method: "GET", signal: controller.signal }).then(setExistingCandidates).catch((error) => { if ((error as Error)?.name !== "AbortError") setExistingCandidates([]); }), 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [approvalMode, existingQuery, selectedSubmission]);

  const setField = <K extends keyof SchoolForm>(field: K, value: SchoolForm[K]) => setForm((current) => ({ ...current, [field]: value }));
  const payloadFrom = (value: SchoolForm) => ({ city_id: Number(value.cityId), full_name: value.fullName.trim(), short_name: value.shortName.trim(), address: value.address.trim(), url: value.url.trim() || null, email: value.email.trim() || null, curator: value.curator.trim() || null, info: value.info.trim() || null, is_sirius: value.isSirius, is_consortium: value.isConsortium, is_peterson: value.isPeterson, is_partner: value.isPartner, is_platform: value.isPlatform, is_active: value.isActive });
  const startEdit = (school: SchoolRead) => {
    setEditingId(school.id); setForm({ regionId: String(school.region_id), cityId: String(school.city_id), fullName: school.full_name, shortName: school.short_name, address: school.address, url: school.url ?? "", email: school.email ?? "", curator: school.curator ?? "", info: school.info ?? "", isSirius: school.is_sirius, isConsortium: school.is_consortium, isPeterson: school.is_peterson, isPartner: school.is_partner, isPlatform: school.is_platform, isActive: school.is_active });
    setFormMessage(null); window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const handleSchoolSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.regionId || !form.cityId || !form.fullName.trim() || !form.shortName.trim() || !form.address.trim()) { setFormStatus("error"); setFormMessage("Выберите регион и город, заполните названия и адрес."); return; }
    setFormStatus("saving"); setFormMessage(null);
    try {
      await adminApiClient.request<SchoolRead>({ path: editingId ? `/admin/schools/${editingId}` : "/admin/schools", method: editingId ? "PATCH" : "POST", body: payloadFrom(form) });
      setForm(emptySchoolForm); setEditingId(null); setFormStatus("idle"); setFormMessage("Школа сохранена."); await loadSchools(page);
    } catch { setFormStatus("error"); setFormMessage("Не удалось сохранить школу. Проверьте обязательные поля."); }
  };

  const selectSubmission = (submission: SchoolSubmission) => {
    setSelectedSubmission(submission); setApprovalMode("existing"); setExistingQuery(submission.school_short_name);
    setExistingSchoolId(null); setRejectComment(submission.admin_comment ?? ""); setDuplicateIds(null); setSubmissionMessage(null);
    setNewSchoolForm({ ...emptySchoolForm, regionId: String(submission.region_id), fullName: submission.school_full_name || submission.school_short_name, shortName: submission.school_short_name, address: submission.address ?? "", url: submission.url ?? "", email: submission.email ?? "" });
  };
  const newSchoolPayload = () => {
    const { city_id: _cityId, is_active: _isActive, ...fields } = payloadFrom(newSchoolForm);
    return { ...fields, region_id: selectedSubmission?.region_id, city_name: selectedSubmission?.city_name };
  };
  const refreshAfterReview = async () => { setSelectedSubmission(null); setDuplicateIds(null); await Promise.all([loadSubmissions(submissionPage), loadSchools(page)]); };
  const approveSubmission = async () => {
    if (!selectedSubmission) return; setSubmissionStatus("saving"); setSubmissionMessage(null);
    try {
      if (approvalMode === "existing") {
        if (!existingSchoolId) { setSubmissionStatus("error"); setSubmissionMessage("Выберите существующую школу."); return; }
        await adminApiClient.request({ path: `/admin/school-submissions/${selectedSubmission.id}/approve`, method: "POST", body: { existing_school_id: existingSchoolId } });
      } else {
        if (!newSchoolForm.fullName.trim() || !newSchoolForm.shortName.trim() || !newSchoolForm.address.trim()) { setSubmissionStatus("error"); setSubmissionMessage("Для новой школы обязательны названия и адрес."); return; }
        const new_school = newSchoolPayload();
        if (duplicateIds === null) {
          const candidates = await adminApiClient.request<number[]>({ path: `/admin/school-submissions/${selectedSubmission.id}/duplicate-candidates`, method: "POST", body: { new_school } });
          setDuplicateIds(candidates ?? []);
          if (candidates?.length) { setSubmissionStatus("idle"); setSubmissionMessage("Найдены возможные дубли. Проверьте ID и подтвердите повторно."); return; }
        }
        await adminApiClient.request({ path: `/admin/school-submissions/${selectedSubmission.id}/approve`, method: "POST", body: { new_school } });
      }
      await refreshAfterReview(); setSubmissionStatus("idle");
    } catch { setSubmissionStatus("error"); setSubmissionMessage("Не удалось одобрить заявку."); }
  };
  const rejectSubmission = async () => {
    if (!selectedSubmission || !rejectComment.trim()) { setSubmissionStatus("error"); setSubmissionMessage("Для отклонения обязателен комментарий."); return; }
    setSubmissionStatus("saving");
    try { await adminApiClient.request({ path: `/admin/school-submissions/${selectedSubmission.id}/reject`, method: "POST", body: { admin_comment: rejectComment.trim() } }); await refreshAfterReview(); setSubmissionStatus("idle"); }
    catch { setSubmissionStatus("error"); setSubmissionMessage("Не удалось отклонить заявку."); }
  };
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return <div>
    <h1 className="admin-title">Школы</h1>
    <form className="admin-form" onSubmit={handleSchoolSubmit}>
      <div className="admin-toolbar"><div><h2>{editingId ? `Редактирование школы #${editingId}` : "Добавление школы"}</h2><p className="admin-hint">Все поля канонического справочника.</p></div>{editingId ? <Button type="button" variant="outline" onClick={() => { setEditingId(null); setForm(emptySchoolForm); }}>Отменить</Button> : null}</div>
      <div className="admin-form-grid">
        <label className="field"><span className="field-label">Регион</span><select className="field-input" value={form.regionId} onChange={(event) => setForm((current) => ({ ...current, regionId: event.target.value, cityId: "" }))}><option value="">Выберите регион</option>{regions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}</select></label>
        <label className="field"><span className="field-label">Город</span><select className="field-input" value={form.cityId} onChange={(event) => setField("cityId", event.target.value)} disabled={!form.regionId}><option value="">Выберите город</option>{formCities.map((city) => <option key={city.id} value={city.id}>{city.name}{city.is_active ? "" : " (неактивен)"}</option>)}</select></label>
        <TextInput label="Краткое название" name="schoolShortName" value={form.shortName} onChange={(event) => setField("shortName", event.target.value)} /><TextInput label="Полное название" name="schoolFullName" value={form.fullName} onChange={(event) => setField("fullName", event.target.value)} /><TextInput label="Адрес" name="schoolAddress" value={form.address} onChange={(event) => setField("address", event.target.value)} /><TextInput label="Сайт" name="schoolUrl" value={form.url} onChange={(event) => setField("url", event.target.value)} /><TextInput label="Email" name="schoolEmail" type="email" value={form.email} onChange={(event) => setField("email", event.target.value)} /><TextInput label="Куратор" name="schoolCurator" value={form.curator} onChange={(event) => setField("curator", event.target.value)} />
      </div>
      <label className="field"><span className="field-label">Информация</span><textarea className="field-input admin-textarea" value={form.info} onChange={(event) => setField("info", event.target.value)} /></label>
      <div className="admin-check-grid"><Flag label="Consortium" checked={form.isConsortium} onChange={(value) => setField("isConsortium", value)} /><Flag label="Peterson" checked={form.isPeterson} onChange={(value) => setField("isPeterson", value)} /><Flag label="Sirius" checked={form.isSirius} onChange={(value) => setField("isSirius", value)} /><Flag label="Партнёр" checked={form.isPartner} onChange={(value) => setField("isPartner", value)} /><Flag label="Платформа" checked={form.isPlatform} onChange={(value) => setField("isPlatform", value)} /><Flag label="Активна" checked={form.isActive} onChange={(value) => setField("isActive", value)} /></div>
      {formMessage ? <div className={formStatus === "error" ? "admin-error" : "admin-hint"}>{formMessage}</div> : null}<div className="admin-form-actions"><Button type="submit" isLoading={formStatus === "saving"}>{editingId ? "Сохранить" : "Добавить школу"}</Button></div>
    </form>

    <section className="admin-section"><h2>Справочник школ</h2><div className="admin-report-filters">
      <label className="field"><span className="field-label">Регион</span><select className="field-input" value={filters.regionId} onChange={(event) => setFilters((current) => ({ ...current, regionId: event.target.value, cityId: "" }))}><option value="">Все</option>{regions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}</select></label>
      <label className="field"><span className="field-label">Город</span><select className="field-input" value={filters.cityId} onChange={(event) => setFilters((current) => ({ ...current, cityId: event.target.value }))} disabled={!filters.regionId}><option value="">Все</option>{filterCities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}</select></label>
      <TextInput label="Название" name="schoolQuery" value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} />
      <BooleanFilter label="Активна" value={filters.isActive} onChange={(value) => setFilters((current) => ({ ...current, isActive: value }))} /><BooleanFilter label="Consortium" value={filters.isConsortium} onChange={(value) => setFilters((current) => ({ ...current, isConsortium: value }))} /><BooleanFilter label="Peterson" value={filters.isPeterson} onChange={(value) => setFilters((current) => ({ ...current, isPeterson: value }))} /><BooleanFilter label="Sirius" value={filters.isSirius} onChange={(value) => setFilters((current) => ({ ...current, isSirius: value }))} /><BooleanFilter label="Партнёр" value={filters.isPartner} onChange={(value) => setFilters((current) => ({ ...current, isPartner: value }))} /><BooleanFilter label="Платформа" value={filters.isPlatform} onChange={(value) => setFilters((current) => ({ ...current, isPlatform: value }))} />
    </div><div className="admin-toolbar-actions"><Button type="button" variant="outline" onClick={() => { setAppliedFilters(filters); void loadSchools(1, filters); }}>Применить фильтры</Button><Button type="button" variant="outline" onClick={() => { setFilters(emptyFilters); setAppliedFilters(emptyFilters); void loadSchools(1, emptyFilters); }}>Сбросить</Button><span className="admin-hint">Показано {schools.length} из {totalCount}; страница {page} из {totalPages}</span><Button type="button" variant="outline" disabled={page <= 1} onClick={() => void loadSchools(page - 1)}>Назад</Button><Button type="button" variant="outline" disabled={page >= totalPages} onClick={() => void loadSchools(page + 1)}>Вперёд</Button></div>
    {listError ? <div className="admin-alert">{listError}</div> : null}<div className="admin-table-scroll admin-table-wide"><Table><thead><tr><th>ID</th><th>Регион</th><th>Город</th><th>Школа</th><th>Адрес</th><th>C</th><th>P</th><th>S</th><th>Партнёр</th><th>Платформа</th><th>Активна</th><th>Пользователи</th><th /></tr></thead><tbody>{listStatus === "loading" ? <tr><td colSpan={13}>Загрузка...</td></tr> : schools.length === 0 ? <tr><td colSpan={13}>Нет данных.</td></tr> : schools.map((school) => <tr key={school.id}><td>{school.id}</td><td>{school.region_name}</td><td>{school.city_name}</td><td title={school.full_name}>{school.short_name}</td><td>{school.address}</td><td>{school.is_consortium ? "Да" : "Нет"}</td><td>{school.is_peterson ? "Да" : "Нет"}</td><td>{school.is_sirius ? "Да" : "Нет"}</td><td>{school.is_partner ? "Да" : "Нет"}</td><td>{school.is_platform ? "Да" : "Нет"}</td><td>{school.is_active ? "Да" : "Нет"}</td><td>{school.user_count}</td><td><Button type="button" variant="outline" onClick={() => startEdit(school)}>Изменить</Button></td></tr>)}</tbody></Table></div></section>

    <section className="admin-section"><h2>Заявки на добавление школ</h2><div className="admin-toolbar-actions"><label className="field"><span className="field-label">Статус</span><select className="field-input" value={submissionStatusFilter} onChange={(event) => { const value = event.target.value as SubmissionStatus | ""; setSubmissionStatusFilter(value); void loadSubmissions(1, value); }}><option value="">Все</option><option value="pending">На рассмотрении</option><option value="approved">Одобрены</option><option value="rejected">Отклонены</option></select></label><span className="admin-hint">Страница {submissionPage}</span><Button type="button" variant="outline" disabled={submissionPage <= 1} onClick={() => void loadSubmissions(submissionPage - 1)}>Назад</Button><Button type="button" variant="outline" disabled={submissions.length < submissionPageSize} onClick={() => void loadSubmissions(submissionPage + 1)}>Вперёд</Button></div>
    <div className="admin-table-scroll"><Table><thead><tr><th>ID</th><th>Пользователь</th><th>Регион</th><th>Город</th><th>Школа</th><th>Статус</th><th>Создана</th><th /></tr></thead><tbody>{submissionStatus === "loading" ? <tr><td colSpan={8}>Загрузка...</td></tr> : submissions.length === 0 ? <tr><td colSpan={8}>Нет заявок.</td></tr> : submissions.map((submission) => <tr key={submission.id}><td>{submission.id}</td><td>{submission.user_id}</td><td>{submission.region_name ?? submission.region_id}</td><td>{submission.city_name}</td><td>{submission.school_short_name}</td><td>{submission.status}</td><td>{new Date(submission.created_at).toLocaleDateString("ru-RU")}</td><td><Button type="button" variant="outline" onClick={() => selectSubmission(submission)}>Открыть</Button></td></tr>)}</tbody></Table></div>
    {selectedSubmission ? <div className="admin-form admin-submission-review"><div className="admin-toolbar"><div><h3>Заявка #{selectedSubmission.id}</h3><p className="admin-hint">Пользователь #{selectedSubmission.user_id}: {selectedSubmission.city_name}, {selectedSubmission.school_short_name}</p></div><Button type="button" variant="outline" onClick={() => setSelectedSubmission(null)}>Закрыть</Button></div>
      {selectedSubmission.status === "pending" ? <><div className="admin-check-grid"><label className="admin-check"><input type="radio" checked={approvalMode === "existing"} onChange={() => { setApprovalMode("existing"); setDuplicateIds(null); }} /><span>Связать с существующей</span></label><label className="admin-check"><input type="radio" checked={approvalMode === "new"} onChange={() => { setApprovalMode("new"); setDuplicateIds(null); }} /><span>Создать новую</span></label></div>
      {approvalMode === "existing" ? <div><TextInput label="Поиск существующей школы" name="existingSchoolQuery" value={existingQuery} onChange={(event) => { setExistingQuery(event.target.value); setExistingSchoolId(null); }} /><div className="admin-candidate-list">{existingCandidates.map((candidate) => <button type="button" key={candidate.id} className={existingSchoolId === candidate.id ? "is-selected" : ""} onClick={() => setExistingSchoolId(candidate.id)}><strong>#{candidate.id} {candidate.short_name}</strong><span>{candidate.city}</span></button>)}</div></div> : <><div className="admin-form-grid"><TextInput label="Краткое название" name="newSubmissionShortName" value={newSchoolForm.shortName} onChange={(event) => setNewSchoolForm((current) => ({ ...current, shortName: event.target.value }))} /><TextInput label="Полное название" name="newSubmissionFullName" value={newSchoolForm.fullName} onChange={(event) => setNewSchoolForm((current) => ({ ...current, fullName: event.target.value }))} /><TextInput label="Адрес" name="newSubmissionAddress" value={newSchoolForm.address} onChange={(event) => setNewSchoolForm((current) => ({ ...current, address: event.target.value }))} /><TextInput label="Сайт" name="newSubmissionUrl" value={newSchoolForm.url} onChange={(event) => setNewSchoolForm((current) => ({ ...current, url: event.target.value }))} /><TextInput label="Email" name="newSubmissionEmail" value={newSchoolForm.email} onChange={(event) => setNewSchoolForm((current) => ({ ...current, email: event.target.value }))} /><TextInput label="Куратор" name="newSubmissionCurator" value={newSchoolForm.curator} onChange={(event) => setNewSchoolForm((current) => ({ ...current, curator: event.target.value }))} /></div><label className="field"><span className="field-label">Информация</span><textarea className="field-input admin-textarea" value={newSchoolForm.info} onChange={(event) => setNewSchoolForm((current) => ({ ...current, info: event.target.value }))} /></label><div className="admin-check-grid"><Flag label="Consortium" checked={newSchoolForm.isConsortium} onChange={(value) => setNewSchoolForm((current) => ({ ...current, isConsortium: value }))} /><Flag label="Peterson" checked={newSchoolForm.isPeterson} onChange={(value) => setNewSchoolForm((current) => ({ ...current, isPeterson: value }))} /><Flag label="Sirius" checked={newSchoolForm.isSirius} onChange={(value) => setNewSchoolForm((current) => ({ ...current, isSirius: value }))} /><Flag label="Партнёр" checked={newSchoolForm.isPartner} onChange={(value) => setNewSchoolForm((current) => ({ ...current, isPartner: value }))} /><Flag label="Платформа" checked={newSchoolForm.isPlatform} onChange={(value) => setNewSchoolForm((current) => ({ ...current, isPlatform: value }))} /></div>{duplicateIds ? <p className="admin-hint">Возможные дубли: {duplicateIds.length ? duplicateIds.map((id) => `#${id}`).join(", ") : "не найдены"}</p> : null}</>}
      <div className="admin-toolbar-actions"><Button type="button" onClick={approveSubmission} isLoading={submissionStatus === "saving"}>{approvalMode === "new" && duplicateIds === null ? "Проверить и одобрить" : "Одобрить"}</Button></div><TextInput label="Комментарий при отклонении" name="submissionRejectComment" value={rejectComment} onChange={(event) => setRejectComment(event.target.value)} /><Button type="button" variant="outline" onClick={rejectSubmission} disabled={submissionStatus === "saving"}>Отклонить заявку</Button></> : <p className="admin-hint">Комментарий: {selectedSubmission.admin_comment ?? "—"}; школа: {selectedSubmission.resolved_school_id ?? "—"}</p>}
      {submissionMessage ? <div className={submissionStatus === "error" ? "admin-error" : "admin-alert"}>{submissionMessage}</div> : null}</div> : null}
    </section>
  </div>;
}
