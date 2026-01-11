import React, { useEffect, useState } from "react";
import { Button, Modal, Table, TextInput } from "@ui";
import { adminApiClient } from "../lib/adminClient";
import { formatDate, fromDateTimeLocal, toDateTimeLocal } from "../lib/formatters";

type OlympiadItem = {
  id: number;
  title: string;
  description: string | null;
  scope: string;
  age_group: string;
  attempts_limit: number;
  duration_sec: number;
  available_from: string;
  available_to: string;
  pass_percent: number;
  is_published: boolean;
  created_by_user_id: number;
};

type OlympiadForm = {
  title: string;
  description: string;
  ageGroup: string;
  attemptsLimit: string;
  durationSec: string;
  availableFrom: string;
  availableTo: string;
  passPercent: string;
};

const emptyForm: OlympiadForm = {
  title: "",
  description: "",
  ageGroup: "7-8",
  attemptsLimit: "1",
  durationSec: "600",
  availableFrom: "",
  availableTo: "",
  passPercent: "60"
};

export function OlympiadsPage() {
  const [olympiads, setOlympiads] = useState<OlympiadItem[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [form, setForm] = useState<OlympiadForm>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OlympiadItem | null>(null);
  const [deleteStatus, setDeleteStatus] = useState<"idle" | "deleting" | "error">("idle");
  const [publishStatus, setPublishStatus] = useState<number | null>(null);

  const loadOlympiads = async () => {
    setStatus("loading");
    setError(null);
    try {
      const data = await adminApiClient.request<OlympiadItem[]>({
        path: "/admin/olympiads?mine=true",
        method: "GET"
      });
      setOlympiads(data ?? []);
      setStatus("idle");
    } catch {
      setStatus("error");
      setError("Не удалось загрузить олимпиады.");
    }
  };

  useEffect(() => {
    void loadOlympiads();
  }, []);

  const openCreate = () => {
    setFormMode("create");
    setForm(emptyForm);
    setEditingId(null);
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEdit = (olympiad: OlympiadItem) => {
    setFormMode("edit");
    setEditingId(olympiad.id);
    setForm({
      title: olympiad.title,
      description: olympiad.description ?? "",
      ageGroup: olympiad.age_group,
      attemptsLimit: String(olympiad.attempts_limit),
      durationSec: String(olympiad.duration_sec),
      availableFrom: toDateTimeLocal(olympiad.available_from),
      availableTo: toDateTimeLocal(olympiad.available_to),
      passPercent: String(olympiad.pass_percent)
    });
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    setFormError(null);
    const availableFrom = fromDateTimeLocal(form.availableFrom);
    const availableTo = fromDateTimeLocal(form.availableTo);
    if (!availableFrom || !availableTo) {
      setFormError("Укажите даты начала и окончания.");
      return;
    }
    setIsSaving(true);
    try {
      const body = {
        title: form.title,
        description: form.description,
        age_group: form.ageGroup,
        attempts_limit: Number(form.attemptsLimit),
        duration_sec: Number(form.durationSec),
        available_from: availableFrom,
        available_to: availableTo,
        pass_percent: Number(form.passPercent)
      };
      if (formMode === "create") {
        await adminApiClient.request({ path: "/admin/olympiads", method: "POST", body });
      } else if (editingId) {
        await adminApiClient.request({ path: `/admin/olympiads/${editingId}`, method: "PUT", body });
      }
      setIsFormOpen(false);
      await loadOlympiads();
    } catch {
      setFormError("Не удалось сохранить олимпиаду.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    setDeleteStatus("deleting");
    try {
      await adminApiClient.request({ path: `/admin/olympiads/${deleteTarget.id}`, method: "DELETE" });
      setDeleteTarget(null);
      await loadOlympiads();
    } catch {
      setDeleteStatus("error");
    }
  };

  const togglePublish = async (item: OlympiadItem) => {
    setPublishStatus(item.id);
    try {
      await adminApiClient.request({
        path: `/admin/olympiads/${item.id}/publish?publish=${!item.is_published}`,
        method: "POST"
      });
      await loadOlympiads();
    } finally {
      setPublishStatus(null);
    }
  };

  return (
    <section className="admin-section">
      <div className="admin-toolbar">
        <div>
          <h1>Управление олимпиадами</h1>
          <p className="admin-hint">Планируйте расписание и настройте параметры олимпиады.</p>
        </div>
        <div className="admin-toolbar-actions">
          <Button type="button" onClick={openCreate}>
            Создать олимпиаду
          </Button>
        </div>
      </div>
      {status === "error" && error ? <div className="admin-alert">{error}</div> : null}
      <Table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Название</th>
            <th>Группа</th>
            <th>Доступно</th>
            <th>Статус</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {status === "loading" ? (
            <tr>
              <td colSpan={6}>Загрузка...</td>
            </tr>
          ) : olympiads.length === 0 ? (
            <tr>
              <td colSpan={6}>Олимпиад пока нет.</td>
            </tr>
          ) : (
            olympiads.map((item) => (
              <tr key={item.id}>
                <td>{item.id}</td>
                <td>{item.title}</td>
                <td>{item.age_group}</td>
                <td>
                  {formatDate(item.available_from)} — {formatDate(item.available_to)}
                </td>
                <td>
                  <span className={`admin-tag ${item.is_published ? "admin-tag-success" : "admin-tag-muted"}`}>
                    {item.is_published ? "Опубликована" : "Черновик"}
                  </span>
                </td>
                <td>
                  <div className="admin-table-actions">
                    <Button type="button" size="sm" variant="outline" onClick={() => openEdit(item)}>
                      Редактировать
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => togglePublish(item)}
                      disabled={publishStatus === item.id}
                    >
                      {item.is_published ? "Скрыть" : "Опубликовать"}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setDeleteTarget(item)}>
                      Удалить
                    </Button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </Table>

      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={formMode === "create" ? "Новая олимпиада" : "Редактирование олимпиады"}
      >
        <div className="admin-form">
          <div className="admin-form-grid">
            <TextInput
              label="Название"
              name="title"
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            />
            <label className="field">
              <span className="field-label">Группа</span>
              <select
                className="field-input"
                value={form.ageGroup}
                onChange={(event) => setForm((prev) => ({ ...prev, ageGroup: event.target.value }))}
              >
                <option value="1">1 класс</option>
                <option value="2">2 класс</option>
                <option value="3-4">3-4 класс</option>
                <option value="5-6">5-6 класс</option>
                <option value="7-8">7-8 класс</option>
              </select>
            </label>
          </div>
          <label className="field">
            <span className="field-label">Описание</span>
            <textarea
              className="field-input admin-textarea"
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            />
          </label>
          <div className="admin-form-grid">
            <TextInput
              label="Лимит попыток"
              name="attemptsLimit"
              value={form.attemptsLimit}
              onChange={(event) => setForm((prev) => ({ ...prev, attemptsLimit: event.target.value }))}
            />
            <TextInput
              label="Длительность (сек)"
              name="durationSec"
              value={form.durationSec}
              onChange={(event) => setForm((prev) => ({ ...prev, durationSec: event.target.value }))}
            />
            <TextInput
              label="Проходной процент"
              name="passPercent"
              value={form.passPercent}
              onChange={(event) => setForm((prev) => ({ ...prev, passPercent: event.target.value }))}
            />
          </div>
          <div className="admin-form-grid">
            <label className="field">
              <span className="field-label">Доступна с</span>
              <input
                className="field-input"
                type="datetime-local"
                value={form.availableFrom}
                onChange={(event) => setForm((prev) => ({ ...prev, availableFrom: event.target.value }))}
              />
            </label>
            <label className="field">
              <span className="field-label">Доступна до</span>
              <input
                className="field-input"
                type="datetime-local"
                value={form.availableTo}
                onChange={(event) => setForm((prev) => ({ ...prev, availableTo: event.target.value }))}
              />
            </label>
          </div>
          {formError ? <span className="admin-error">{formError}</span> : null}
          <div className="admin-modal-actions">
            <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
              Отмена
            </Button>
            <Button type="button" onClick={handleSave} isLoading={isSaving}>
              Сохранить
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="Удалить олимпиаду">
        <p>Вы действительно хотите удалить олимпиаду “{deleteTarget?.title}”?</p>
        {deleteStatus === "error" ? <p className="admin-error">Не удалось удалить запись.</p> : null}
        <div className="admin-modal-actions">
          <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
            Отмена
          </Button>
          <Button type="button" onClick={handleDelete} isLoading={deleteStatus === "deleting"}>
            Удалить
          </Button>
        </div>
      </Modal>
    </section>
  );
}
