import React, { useEffect, useMemo, useState } from "react";
import { Button, Table, TextInput } from "@ui";
import { adminApiClient } from "../lib/adminClient";
import { formatDate, fromDateTimeLocal, toDateTimeLocal } from "../lib/formatters";

type Subject = "math" | "cs";

type Campaign = {
  id: number;
  code: string;
  title_default: string;
  common_text: string;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
};

type CampaignForm = {
  code: string;
  title_default: string;
  common_text: string;
  is_active: boolean;
  starts_at: string;
  ends_at: string;
};

type GroupMessage = {
  id: number;
  campaign_id: number;
  subject: Subject;
  group_number: number;
  group_title: string;
  group_text: string;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  updated_at: string;
};

type GroupForm = {
  subject: Subject;
  group_number: string;
  group_title: string;
  group_text: string;
  is_active: boolean;
  starts_at: string;
  ends_at: string;
};

type Fallback = {
  id: number;
  campaign_id: number;
  enabled: boolean;
  title: string;
  text: string;
  updated_at: string;
};

type FallbackForm = {
  enabled: boolean;
  title: string;
  text: string;
};

type ImportResult = {
  campaign_id: number;
  subject: Subject;
  source_file: string;
  total_rows: number;
  valid_rows: number;
  inserted_rows: number;
  skipped_duplicate_rows: number;
  skipped_invalid_format: number;
  skipped_unknown_user: number;
  skipped_not_student: number;
  skipped_group_out_of_range: number;
};

const emptyCampaignForm: CampaignForm = {
  code: "",
  title_default: "",
  common_text: "",
  is_active: false,
  starts_at: "",
  ends_at: ""
};

const emptyGroupForm: GroupForm = {
  subject: "math",
  group_number: "1",
  group_title: "",
  group_text: "",
  is_active: true,
  starts_at: "",
  ends_at: ""
};

const emptyFallbackForm: FallbackForm = {
  enabled: false,
  title: "",
  text: ""
};

export function AnnouncementsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignsStatus, setCampaignsStatus] = useState<"idle" | "loading" | "error">("idle");
  const [campaignsError, setCampaignsError] = useState<string | null>(null);

  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const selectedCampaign = useMemo(
    () => campaigns.find((item) => item.id === selectedCampaignId) ?? null,
    [campaigns, selectedCampaignId]
  );

  const [campaignForm, setCampaignForm] = useState<CampaignForm>(emptyCampaignForm);
  const [campaignFormMode, setCampaignFormMode] = useState<"create" | "edit">("create");
  const [campaignSaving, setCampaignSaving] = useState(false);
  const [campaignFormError, setCampaignFormError] = useState<string | null>(null);

  const [groups, setGroups] = useState<GroupMessage[]>([]);
  const [groupsStatus, setGroupsStatus] = useState<"idle" | "loading" | "error">("idle");
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [groupsSubjectFilter, setGroupsSubjectFilter] = useState<"all" | Subject>("all");
  const [groupForm, setGroupForm] = useState<GroupForm>(emptyGroupForm);
  const [groupSaving, setGroupSaving] = useState(false);
  const [groupFormError, setGroupFormError] = useState<string | null>(null);

  const [fallbackForm, setFallbackForm] = useState<FallbackForm>(emptyFallbackForm);
  const [fallbackStatus, setFallbackStatus] = useState<"idle" | "loading" | "saving" | "error">("idle");
  const [fallbackError, setFallbackError] = useState<string | null>(null);

  const [mathFile, setMathFile] = useState<File | null>(null);
  const [csFile, setCsFile] = useState<File | null>(null);
  const [importStatus, setImportStatus] = useState<Subject | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [lastImportResult, setLastImportResult] = useState<ImportResult | null>(null);

  const loadCampaigns = async () => {
    setCampaignsStatus("loading");
    setCampaignsError(null);
    try {
      const data = await adminApiClient.request<Campaign[]>({
        path: "/admin/announcements/campaigns",
        method: "GET"
      });
      const next = data ?? [];
      setCampaigns(next);
      setSelectedCampaignId((prev) => {
        if (prev && next.some((item) => item.id === prev)) {
          return prev;
        }
        return next[0]?.id ?? null;
      });
      setCampaignsStatus("idle");
    } catch {
      setCampaigns([]);
      setCampaignsStatus("error");
      setCampaignsError("Не удалось загрузить кампании.");
    }
  };

  const loadGroups = async (campaignId: number, subject: "all" | Subject) => {
    setGroupsStatus("loading");
    setGroupsError(null);
    try {
      const query = subject === "all" ? "" : `?subject=${subject}`;
      const data = await adminApiClient.request<GroupMessage[]>({
        path: `/admin/announcements/campaigns/${campaignId}/groups${query}`,
        method: "GET"
      });
      setGroups(data ?? []);
      setGroupsStatus("idle");
    } catch {
      setGroups([]);
      setGroupsStatus("error");
      setGroupsError("Не удалось загрузить групповые сообщения.");
    }
  };

  const loadFallback = async (campaignId: number) => {
    setFallbackStatus("loading");
    setFallbackError(null);
    try {
      const data = await adminApiClient.request<Fallback | null>({
        path: `/admin/announcements/campaigns/${campaignId}/fallback`,
        method: "GET"
      });
      setFallbackForm({
        enabled: data?.enabled ?? false,
        title: data?.title ?? "",
        text: data?.text ?? ""
      });
      setFallbackStatus("idle");
    } catch {
      setFallbackForm(emptyFallbackForm);
      setFallbackStatus("error");
      setFallbackError("Не удалось загрузить fallback-объявление.");
    }
  };

  useEffect(() => {
    void loadCampaigns();
  }, []);

  useEffect(() => {
    if (!selectedCampaignId) {
      setGroups([]);
      setFallbackForm(emptyFallbackForm);
      return;
    }
    void loadGroups(selectedCampaignId, groupsSubjectFilter);
    void loadFallback(selectedCampaignId);
  }, [selectedCampaignId, groupsSubjectFilter]);

  const startCreateCampaign = () => {
    setCampaignFormMode("create");
    setCampaignForm(emptyCampaignForm);
    setCampaignFormError(null);
  };

  const startEditCampaign = (campaign: Campaign) => {
    setCampaignFormMode("edit");
    setCampaignForm({
      code: campaign.code,
      title_default: campaign.title_default,
      common_text: campaign.common_text,
      is_active: campaign.is_active,
      starts_at: toDateTimeLocal(campaign.starts_at),
      ends_at: toDateTimeLocal(campaign.ends_at)
    });
    setCampaignFormError(null);
    setSelectedCampaignId(campaign.id);
  };

  const saveCampaign = async (event: React.FormEvent) => {
    event.preventDefault();
    setCampaignFormError(null);
    if (!campaignForm.title_default.trim() || !campaignForm.common_text.trim()) {
      setCampaignFormError("Заполните поля названия и общего текста.");
      return;
    }
    if (campaignFormMode === "create" && !campaignForm.code.trim()) {
      setCampaignFormError("Укажите код кампании.");
      return;
    }
    setCampaignSaving(true);
    try {
      if (campaignFormMode === "create") {
        const created = await adminApiClient.request<Campaign>({
          path: "/admin/announcements/campaigns",
          method: "POST",
          body: {
            code: campaignForm.code.trim(),
            title_default: campaignForm.title_default.trim(),
            common_text: campaignForm.common_text.trim(),
            is_active: campaignForm.is_active,
            starts_at: fromDateTimeLocal(campaignForm.starts_at),
            ends_at: fromDateTimeLocal(campaignForm.ends_at)
          }
        });
        await loadCampaigns();
        if (created?.id) {
          setSelectedCampaignId(created.id);
        }
        startCreateCampaign();
      } else if (selectedCampaignId) {
        await adminApiClient.request<Campaign>({
          path: `/admin/announcements/campaigns/${selectedCampaignId}`,
          method: "PATCH",
          body: {
            title_default: campaignForm.title_default.trim(),
            common_text: campaignForm.common_text.trim(),
            is_active: campaignForm.is_active,
            starts_at: fromDateTimeLocal(campaignForm.starts_at),
            ends_at: fromDateTimeLocal(campaignForm.ends_at)
          }
        });
        await loadCampaigns();
      }
    } catch {
      setCampaignFormError("Не удалось сохранить кампанию.");
    } finally {
      setCampaignSaving(false);
    }
  };

  const saveGroupMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCampaignId) {
      return;
    }
    setGroupFormError(null);
    const groupNumber = Number(groupForm.group_number);
    if (!groupForm.group_title.trim() || !groupForm.group_text.trim()) {
      setGroupFormError("Заполните заголовок и текст группы.");
      return;
    }
    if (!Number.isInteger(groupNumber) || groupNumber < 1 || groupNumber > 21) {
      setGroupFormError("Номер группы должен быть от 1 до 21.");
      return;
    }
    setGroupSaving(true);
    try {
      await adminApiClient.request<GroupMessage>({
        path: `/admin/announcements/campaigns/${selectedCampaignId}/groups`,
        method: "PUT",
        body: {
          subject: groupForm.subject,
          group_number: groupNumber,
          group_title: groupForm.group_title.trim(),
          group_text: groupForm.group_text.trim(),
          is_active: groupForm.is_active,
          starts_at: fromDateTimeLocal(groupForm.starts_at),
          ends_at: fromDateTimeLocal(groupForm.ends_at)
        }
      });
      await loadGroups(selectedCampaignId, groupsSubjectFilter);
    } catch {
      setGroupFormError("Не удалось сохранить сообщение группы.");
    } finally {
      setGroupSaving(false);
    }
  };

  const editGroup = (item: GroupMessage) => {
    setGroupForm({
      subject: item.subject,
      group_number: String(item.group_number),
      group_title: item.group_title,
      group_text: item.group_text,
      is_active: item.is_active,
      starts_at: toDateTimeLocal(item.starts_at),
      ends_at: toDateTimeLocal(item.ends_at)
    });
  };

  const saveFallback = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCampaignId) {
      return;
    }
    setFallbackError(null);
    if (fallbackForm.enabled && (!fallbackForm.title.trim() || !fallbackForm.text.trim())) {
      setFallbackError("Для включенного fallback заполните заголовок и текст.");
      return;
    }
    setFallbackStatus("saving");
    try {
      await adminApiClient.request<Fallback>({
        path: `/admin/announcements/campaigns/${selectedCampaignId}/fallback`,
        method: "PUT",
        body: {
          enabled: fallbackForm.enabled,
          title: fallbackForm.title.trim() || "Объявление",
          text: fallbackForm.text.trim() || "Спасибо за участие."
        }
      });
      await loadFallback(selectedCampaignId);
    } catch {
      setFallbackStatus("error");
      setFallbackError("Не удалось сохранить fallback-объявление.");
    } finally {
      if (fallbackStatus !== "error") {
        setFallbackStatus("idle");
      }
    }
  };

  const runImport = async (subject: Subject) => {
    if (!selectedCampaignId) {
      return;
    }
    const file = subject === "math" ? mathFile : csFile;
    if (!file) {
      setImportError(`Выберите CSV файл для ${subject === "math" ? "математики" : "информатики"}.`);
      return;
    }
    setImportError(null);
    setImportStatus(subject);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const data = await adminApiClient.request<ImportResult>({
        path: `/admin/announcements/campaigns/${selectedCampaignId}/import/${subject}`,
        method: "POST",
        body: formData
      });
      setLastImportResult(data);
      await loadGroups(selectedCampaignId, groupsSubjectFilter);
    } catch {
      setImportError("Не удалось импортировать CSV.");
    } finally {
      setImportStatus(null);
    }
  };

  return (
    <section className="admin-section">
      <div className="admin-toolbar">
        <div>
          <h1>Объявления</h1>
          <p className="admin-hint">
            Управление кампаниями, назначениями групп и fallback-объявлением для личного кабинета учеников.
          </p>
        </div>
        <div className="admin-toolbar-actions">
          <Button type="button" variant="outline" onClick={loadCampaigns} isLoading={campaignsStatus === "loading"}>
            Обновить
          </Button>
        </div>
      </div>

      {campaignsError ? <div className="admin-alert">{campaignsError}</div> : null}

      <div className="admin-announcements-grid">
        <div>
          <h2>Кампании</h2>
          <div className="admin-table-scroll">
            <Table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Код</th>
                  <th>Активна</th>
                  <th>Окно</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {campaigns.length === 0 ? (
                  <tr>
                    <td colSpan={5}>{campaignsStatus === "loading" ? "Загрузка..." : "Кампании не найдены."}</td>
                  </tr>
                ) : (
                  campaigns.map((item) => (
                    <tr key={item.id} className={item.id === selectedCampaignId ? "admin-ann-row-active" : ""}>
                      <td>{item.id}</td>
                      <td>{item.code}</td>
                      <td>{item.is_active ? "Да" : "Нет"}</td>
                      <td>
                        {item.starts_at ? formatDate(item.starts_at) : "—"} -{" "}
                        {item.ends_at ? formatDate(item.ends_at) : "—"}
                      </td>
                      <td>
                        <div className="admin-table-actions">
                          <Button type="button" size="sm" variant="outline" onClick={() => setSelectedCampaignId(item.id)}>
                            Выбрать
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => startEditCampaign(item)}>
                            Изменить
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </div>
        </div>

        <div>
          <h2>{campaignFormMode === "create" ? "Новая кампания" : "Редактирование кампании"}</h2>
          <form className="admin-form" onSubmit={saveCampaign}>
            <div className="admin-form-grid">
              <TextInput
                label="Код"
                name="campaign-code"
                value={campaignForm.code}
                disabled={campaignFormMode === "edit"}
                onChange={(event) => setCampaignForm((prev) => ({ ...prev, code: event.target.value }))}
              />
              <TextInput
                label="Заголовок по умолчанию"
                name="campaign-title-default"
                value={campaignForm.title_default}
                onChange={(event) => setCampaignForm((prev) => ({ ...prev, title_default: event.target.value }))}
              />
            </div>
            <label className="field">
              <span className="field-label">Общий текст</span>
              <textarea
                className="field-input admin-textarea"
                rows={4}
                value={campaignForm.common_text}
                onChange={(event) => setCampaignForm((prev) => ({ ...prev, common_text: event.target.value }))}
              />
            </label>
            <div className="admin-form-grid">
              <label className="field">
                <span className="field-label">Начало</span>
                <input
                  className="field-input"
                  type="datetime-local"
                  value={campaignForm.starts_at}
                  onChange={(event) => setCampaignForm((prev) => ({ ...prev, starts_at: event.target.value }))}
                />
              </label>
              <label className="field">
                <span className="field-label">Окончание</span>
                <input
                  className="field-input"
                  type="datetime-local"
                  value={campaignForm.ends_at}
                  onChange={(event) => setCampaignForm((prev) => ({ ...prev, ends_at: event.target.value }))}
                />
              </label>
            </div>
            <label className="admin-class-option">
              <input
                type="checkbox"
                checked={campaignForm.is_active}
                onChange={(event) => setCampaignForm((prev) => ({ ...prev, is_active: event.target.checked }))}
              />
              Активна
            </label>
            {campaignFormError ? <p className="admin-error">{campaignFormError}</p> : null}
            <div className="admin-form-actions">
              <Button type="submit" isLoading={campaignSaving}>
                {campaignFormMode === "create" ? "Создать кампанию" : "Сохранить кампанию"}
              </Button>
              {campaignFormMode === "edit" ? (
                <Button type="button" variant="outline" onClick={startCreateCampaign}>
                  Сбросить
                </Button>
              ) : null}
            </div>
          </form>
        </div>
      </div>

      <div className="admin-announcements-grid">
        <div>
          <h2>Сообщения групп</h2>
          <div className="admin-toolbar-actions">
            <label className="field">
              <span className="field-label">Фильтр предмета</span>
              <select
                className="field-input"
                value={groupsSubjectFilter}
                onChange={(event) => setGroupsSubjectFilter(event.target.value as "all" | Subject)}
                disabled={!selectedCampaignId}
              >
                <option value="all">Все</option>
                <option value="math">Математика</option>
                <option value="cs">Информатика</option>
              </select>
            </label>
          </div>
          {groupsError ? <p className="admin-error">{groupsError}</p> : null}
          <div className="admin-table-scroll">
            <Table>
              <thead>
                <tr>
                  <th>Предмет</th>
                  <th>Группа</th>
                  <th>Заголовок</th>
                  <th>Активно</th>
                  <th>Обновлено</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {groups.length === 0 ? (
                  <tr>
                    <td colSpan={6}>{groupsStatus === "loading" ? "Загрузка..." : "Нет сообщений групп."}</td>
                  </tr>
                ) : (
                  groups.map((item) => (
                    <tr key={item.id}>
                      <td>{item.subject}</td>
                      <td>{item.group_number}</td>
                      <td>{item.group_title}</td>
                      <td>{item.is_active ? "Да" : "Нет"}</td>
                      <td>{formatDate(item.updated_at)}</td>
                      <td>
                        <Button type="button" size="sm" variant="outline" onClick={() => editGroup(item)}>
                          В форму
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          </div>
        </div>

        <div>
          <h2>Редактор группы</h2>
          <form className="admin-form" onSubmit={saveGroupMessage}>
            <div className="admin-form-grid">
              <label className="field">
                <span className="field-label">Предмет</span>
                <select
                  className="field-input"
                  value={groupForm.subject}
                  onChange={(event) => setGroupForm((prev) => ({ ...prev, subject: event.target.value as Subject }))}
                  disabled={!selectedCampaignId}
                >
                  <option value="math">Математика</option>
                  <option value="cs">Информатика</option>
                </select>
              </label>
              <TextInput
                label="Группа (1-21)"
                name="group-number"
                type="number"
                min={1}
                max={21}
                value={groupForm.group_number}
                disabled={!selectedCampaignId}
                onChange={(event) => setGroupForm((prev) => ({ ...prev, group_number: event.target.value }))}
              />
            </div>
            <TextInput
              label="Заголовок группы"
              name="group-title"
              value={groupForm.group_title}
              disabled={!selectedCampaignId}
              onChange={(event) => setGroupForm((prev) => ({ ...prev, group_title: event.target.value }))}
            />
            <label className="field">
              <span className="field-label">Текст группы</span>
              <textarea
                className="field-input admin-textarea"
                rows={4}
                value={groupForm.group_text}
                disabled={!selectedCampaignId}
                onChange={(event) => setGroupForm((prev) => ({ ...prev, group_text: event.target.value }))}
              />
            </label>
            <div className="admin-form-grid">
              <label className="field">
                <span className="field-label">Начало (опционально)</span>
                <input
                  className="field-input"
                  type="datetime-local"
                  value={groupForm.starts_at}
                  disabled={!selectedCampaignId}
                  onChange={(event) => setGroupForm((prev) => ({ ...prev, starts_at: event.target.value }))}
                />
              </label>
              <label className="field">
                <span className="field-label">Окончание (опционально)</span>
                <input
                  className="field-input"
                  type="datetime-local"
                  value={groupForm.ends_at}
                  disabled={!selectedCampaignId}
                  onChange={(event) => setGroupForm((prev) => ({ ...prev, ends_at: event.target.value }))}
                />
              </label>
            </div>
            <label className="admin-class-option">
              <input
                type="checkbox"
                checked={groupForm.is_active}
                disabled={!selectedCampaignId}
                onChange={(event) => setGroupForm((prev) => ({ ...prev, is_active: event.target.checked }))}
              />
              Активно
            </label>
            {groupFormError ? <p className="admin-error">{groupFormError}</p> : null}
            <div className="admin-form-actions">
              <Button type="submit" isLoading={groupSaving} disabled={!selectedCampaignId}>
                Сохранить группу
              </Button>
            </div>
          </form>
        </div>
      </div>

      <div className="admin-announcements-grid">
        <div>
          <h2>Fallback-объявление</h2>
          <form className="admin-form" onSubmit={saveFallback}>
            <label className="admin-class-option">
              <input
                type="checkbox"
                checked={fallbackForm.enabled}
                disabled={!selectedCampaignId}
                onChange={(event) => setFallbackForm((prev) => ({ ...prev, enabled: event.target.checked }))}
              />
              Включено
            </label>
            <TextInput
              label="Заголовок"
              name="fallback-title"
              value={fallbackForm.title}
              disabled={!selectedCampaignId}
              onChange={(event) => setFallbackForm((prev) => ({ ...prev, title: event.target.value }))}
            />
            <label className="field">
              <span className="field-label">Текст</span>
              <textarea
                className="field-input admin-textarea"
                rows={4}
                value={fallbackForm.text}
                disabled={!selectedCampaignId}
                onChange={(event) => setFallbackForm((prev) => ({ ...prev, text: event.target.value }))}
              />
            </label>
            {fallbackError ? <p className="admin-error">{fallbackError}</p> : null}
            <div className="admin-form-actions">
              <Button type="submit" isLoading={fallbackStatus === "saving"} disabled={!selectedCampaignId}>
                Сохранить fallback
              </Button>
            </div>
          </form>
        </div>

        <div>
          <h2>Импорт групп из CSV</h2>
          <p className="admin-hint">
            Формат: 2 колонки `user_id,group_number` или `user_id;group_number`. Группы от 1 до 21.
          </p>
          <div className="admin-form-grid">
            <label className="field">
              <span className="field-label">CSV математика</span>
              <input
                className="field-input"
                type="file"
                accept=".csv,text/csv"
                disabled={!selectedCampaignId}
                onChange={(event) => setMathFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <div className="admin-form-actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => void runImport("math")}
                disabled={!selectedCampaignId}
                isLoading={importStatus === "math"}
              >
                Импорт math
              </Button>
            </div>
          </div>
          <div className="admin-form-grid">
            <label className="field">
              <span className="field-label">CSV информатика</span>
              <input
                className="field-input"
                type="file"
                accept=".csv,text/csv"
                disabled={!selectedCampaignId}
                onChange={(event) => setCsFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <div className="admin-form-actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => void runImport("cs")}
                disabled={!selectedCampaignId}
                isLoading={importStatus === "cs"}
              >
                Импорт cs
              </Button>
            </div>
          </div>
          {importError ? <p className="admin-error">{importError}</p> : null}
          {lastImportResult ? (
            <div className="admin-ann-import-result">
              <p className="admin-hint">Последний импорт: {lastImportResult.subject}</p>
              <ul>
                <li>Всего строк: {lastImportResult.total_rows}</li>
                <li>Валидных: {lastImportResult.valid_rows}</li>
                <li>Вставлено: {lastImportResult.inserted_rows}</li>
                <li>Дубликаты: {lastImportResult.skipped_duplicate_rows}</li>
                <li>Неверный формат: {lastImportResult.skipped_invalid_format}</li>
                <li>Неизвестный user_id: {lastImportResult.skipped_unknown_user}</li>
                <li>Не student: {lastImportResult.skipped_not_student}</li>
                <li>Группа вне диапазона: {lastImportResult.skipped_group_out_of_range}</li>
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

