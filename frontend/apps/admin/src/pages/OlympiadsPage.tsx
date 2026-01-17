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
  results_released: boolean;
  created_by_user_id: number;
};

type OlympiadForm = {
  title: string;
  description: string;
  classGrades: number[];
  attemptsLimit: string;
  durationMinutes: string;
  availableFrom: string;
  availableTo: string;
  passPercent: string;
};

type TaskCatalogItem = {
  id: number;
  subject: string;
  title: string;
  task_type: string;
};

type TaskSelection = {
  checked: boolean;
  sortOrder: string;
  maxScore: string;
  existing: boolean;
};

const emptyForm: OlympiadForm = {
  title: "",
  description: "",
  classGrades: [7, 8],
  attemptsLimit: "1",
  durationMinutes: "10",
  availableFrom: "",
  availableTo: "",
  passPercent: "60"
};

const CLASS_GRADE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8];

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
  const [resultsStatus, setResultsStatus] = useState<number | null>(null);
  const [taskCatalog, setTaskCatalog] = useState<TaskCatalogItem[]>([]);
  const [taskSelection, setTaskSelection] = useState<Record<number, TaskSelection>>({});
  const [taskCatalogStatus, setTaskCatalogStatus] = useState<"idle" | "loading" | "error">("idle");
  const [taskCatalogError, setTaskCatalogError] = useState<string | null>(null);
  const [taskAttachError, setTaskAttachError] = useState<string | null>(null);
  const [taskFilter, setTaskFilter] = useState("");
  const [randomOrder, setRandomOrder] = useState(false);

  const parseAgeGroup = (value: string | null) => {
    if (!value) {
      return [];
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }
    if (trimmed.includes(",")) {
      return trimmed
        .split(",")
        .map((part) => Number(part.trim()))
        .filter((grade) => Number.isFinite(grade));
    }
    if (trimmed.includes("-")) {
      const [startRaw, endRaw] = trimmed.split("-", 2);
      const start = Number(startRaw);
      const end = Number(endRaw);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
        return [];
      }
      return Array.from({ length: end - start + 1 }, (_, index) => start + index);
    }
    const single = Number(trimmed);
    return Number.isFinite(single) ? [single] : [];
  };

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
    setTaskSelection({});
    setTaskAttachError(null);
    setTaskFilter("");
    setRandomOrder(false);
    void loadTaskCatalog();
    setIsFormOpen(true);
  };

  const openEdit = (olympiad: OlympiadItem) => {
    setFormMode("edit");
    setEditingId(olympiad.id);
    setForm({
      title: olympiad.title,
      description: olympiad.description ?? "",
      classGrades: parseAgeGroup(olympiad.age_group),
      attemptsLimit: String(olympiad.attempts_limit),
      durationMinutes: String(olympiad.duration_sec / 60),
      availableFrom: toDateTimeLocal(olympiad.available_from),
      availableTo: toDateTimeLocal(olympiad.available_to),
      passPercent: String(olympiad.pass_percent)
    });
    setTaskAttachError(null);
    setTaskFilter("");
    setRandomOrder(false);
    void loadTaskCatalog();
    void loadSelectedTasks(olympiad.id);
    setIsFormOpen(true);
  };

  const loadTaskCatalog = async () => {
    if (taskCatalogStatus === "loading") {
      return;
    }
    setTaskCatalogStatus("loading");
    setTaskCatalogError(null);
    try {
      const data = await adminApiClient.request<TaskCatalogItem[]>({
        path: "/admin/tasks",
        method: "GET"
      });
      setTaskCatalog(data ?? []);
      setTaskCatalogStatus("idle");
    } catch {
      setTaskCatalogStatus("error");
      setTaskCatalogError("Не удалось загрузить список заданий.");
    }
  };

  const loadSelectedTasks = async (olympiadId: number) => {
    try {
      const data = await adminApiClient.request<
        { task_id: number; sort_order: number; max_score: number }[]
      >({
        path: `/admin/olympiads/${olympiadId}/tasks`,
        method: "GET"
      });
      const nextSelection: Record<number, TaskSelection> = {};
      data.forEach((item) => {
        nextSelection[item.task_id] = {
          checked: true,
          sortOrder: String(item.sort_order),
          maxScore: String(item.max_score),
          existing: true
        };
      });
      setTaskSelection(nextSelection);
    } catch {
      // ignore selection preload errors
    }
  };

  const toggleTaskSelection = (taskId: number) => {
    setTaskSelection((prev) => {
      const current = prev[taskId];
      const isChecked = !current?.checked;
      return {
        ...prev,
        [taskId]: {
          checked: isChecked,
          sortOrder: current?.sortOrder ?? "1",
          maxScore: current?.maxScore ?? "1",
          existing: current?.existing ?? false
        }
      };
    });
  };

  const updateTaskSelection = (taskId: number, patch: Partial<TaskSelection>) => {
    setTaskSelection((prev) => ({
      ...prev,
      [taskId]: {
        checked: prev[taskId]?.checked ?? false,
        sortOrder: prev[taskId]?.sortOrder ?? "1",
        maxScore: prev[taskId]?.maxScore ?? "1",
        existing: prev[taskId]?.existing ?? false,
        ...patch
      }
    }));
  };

  const attachSelectedTasks = async (
    olympiadId: number,
    entries: { taskId: number; sortOrder: number; maxScore: number }[]
  ) => {
    if (entries.length === 0) {
      return;
    }
    await Promise.all(
      entries.map((item) =>
        adminApiClient.request({
          path: `/admin/olympiads/${olympiadId}/tasks`,
          method: "POST",
          body: {
            task_id: item.taskId,
            sort_order: item.sortOrder,
            max_score: item.maxScore
          }
        })
      )
    );
  };

  const normalizeGrades = (grades: number[]) => {
    const unique = Array.from(new Set(grades));
    return unique.filter((grade) => grade >= 1 && grade <= 8).sort((a, b) => a - b);
  };

  const prepareTaskEntries = () => {
    const entries = Object.entries(taskSelection)
      .map(([id, selection]) => ({ taskId: Number(id), ...selection }))
      .filter((item) => item.checked && !item.existing);
    if (entries.length === 0) {
      return { entries: [], error: null };
    }
    if (randomOrder) {
      const orderPool = Array.from({ length: entries.length }, (_, index) => index + 1);
      for (let i = orderPool.length - 1; i > 0; i -= 1) {
        const swapIndex = Math.floor(Math.random() * (i + 1));
        [orderPool[i], orderPool[swapIndex]] = [orderPool[swapIndex], orderPool[i]];
      }
      return {
        entries: entries.map((entry, index) => ({
          taskId: entry.taskId,
          sortOrder: orderPool[index],
          maxScore: Number(entry.maxScore || 1)
        })),
        error: null
      };
    }
    const maxOrder = entries.length;
    const usedOrders = new Set<number>();
    for (const entry of entries) {
      const order = Number(entry.sortOrder);
      if (!Number.isInteger(order) || order < 1 || order > maxOrder) {
        return {
          entries: [],
          error: `Порядок заданий должен быть от 1 до ${maxOrder}.`
        };
      }
      if (usedOrders.has(order)) {
        return {
          entries: [],
          error: "Порядок заданий должен быть уникальным."
        };
      }
      usedOrders.add(order);
    }
    return {
      entries: entries.map((entry) => ({
        taskId: entry.taskId,
        sortOrder: Number(entry.sortOrder || 1),
        maxScore: Number(entry.maxScore || 1)
      })),
      error: null
    };
  };

  const handleSave = async () => {
    setFormError(null);
    setTaskAttachError(null);
    const classGrades = normalizeGrades(form.classGrades);
    if (classGrades.length === 0) {
      setFormError("Выберите хотя бы один класс.");
      return;
    }
    const availableFrom = fromDateTimeLocal(form.availableFrom);
    const availableTo = fromDateTimeLocal(form.availableTo);
    if (!availableFrom || !availableTo) {
      setFormError("Укажите даты начала и окончания.");
      return;
    }
    const durationMinutes = Number(form.durationMinutes);
    if (Number.isNaN(durationMinutes) || durationMinutes <= 0) {
      setFormError("Укажите корректную длительность в минутах.");
      return;
    }
    const preparedTasks = prepareTaskEntries();
    if (preparedTasks.error) {
      setTaskAttachError(preparedTasks.error);
      return;
    }
    setIsSaving(true);
    try {
      const body = {
        title: form.title,
        description: form.description,
        age_group: classGrades,
        attempts_limit: Number(form.attemptsLimit),
        duration_sec: Math.round(durationMinutes * 60),
        available_from: availableFrom,
        available_to: availableTo,
        pass_percent: Number(form.passPercent)
      };
      let olympiadId = editingId;
      if (formMode === "create") {
        const created = await adminApiClient.request<OlympiadItem>({
          path: "/admin/olympiads",
          method: "POST",
          body
        });
        olympiadId = created.id;
      } else if (editingId) {
        const updated = await adminApiClient.request<OlympiadItem>({
          path: `/admin/olympiads/${editingId}`,
          method: "PUT",
          body
        });
        olympiadId = updated.id;
      }
      if (olympiadId) {
        try {
          await attachSelectedTasks(olympiadId, preparedTasks.entries);
        } catch {
          setTaskAttachError("Не удалось добавить задания к олимпиаде.");
        }
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

  const toggleResultsRelease = async (item: OlympiadItem) => {
    setResultsStatus(item.id);
    try {
      await adminApiClient.request({
        path: `/admin/olympiads/${item.id}/results?released=${!item.results_released}`,
        method: "POST"
      });
      await loadOlympiads();
    } finally {
      setResultsStatus(null);
    }
  };

  const normalizedFilter = taskFilter.trim().toLowerCase();
  const filteredTaskCatalog = normalizedFilter
    ? taskCatalog.filter((task) => task.title.toLowerCase().includes(normalizedFilter))
    : taskCatalog;

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
                  <div>
                    <span className={`admin-tag ${item.results_released ? "admin-tag-success" : "admin-tag-muted"}`}>
                      {item.results_released ? "Результаты открыты" : "Результаты скрыты"}
                    </span>
                  </div>
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
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleResultsRelease(item)}
                      disabled={resultsStatus === item.id}
                    >
                      {item.results_released ? "Скрыть результаты" : "Показать результаты"}
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
        className="admin-olympiad-modal"
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
              <span className="field-label">Классы</span>
              <div className="admin-class-grid">
                {CLASS_GRADE_OPTIONS.map((grade) => {
                  const isChecked = form.classGrades.includes(grade);
                  return (
                    <label key={grade} className="admin-class-option">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() =>
                          setForm((prev) => {
                            const next = new Set(prev.classGrades);
                            if (next.has(grade)) {
                              next.delete(grade);
                            } else {
                              next.add(grade);
                            }
                            return { ...prev, classGrades: Array.from(next).sort((a, b) => a - b) };
                          })
                        }
                      />
                      <span>{grade}</span>
                    </label>
                  );
                })}
              </div>
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
              label="Длительность (мин)"
              name="durationMinutes"
              value={form.durationMinutes}
              onChange={(event) => setForm((prev) => ({ ...prev, durationMinutes: event.target.value }))}
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
          <div className="admin-olympiad-tasks">
            <div className="admin-options-header">
              <span>Добавить задания</span>
              <Button type="button" size="sm" variant="outline" onClick={loadTaskCatalog}>
                Обновить список
              </Button>
            </div>
            <div className="admin-olympiad-tasks-actions">
              <label className="admin-class-option">
                <input
                  type="checkbox"
                  checked={randomOrder}
                  onChange={(event) => setRandomOrder(event.target.checked)}
                />
                <span>Случайный порядок</span>
              </label>
              <span className="admin-hint">
                При включении порядок будет назначен автоматически при сохранении.
              </span>
            </div>
            <TextInput
              label="Фильтр по названию"
              name="taskFilter"
              value={taskFilter}
              onChange={(event) => setTaskFilter(event.target.value)}
            />
            {taskCatalogStatus === "error" && taskCatalogError ? (
              <p className="admin-error">{taskCatalogError}</p>
            ) : null}
            <div className="admin-olympiad-tasks-list">
              {taskCatalogStatus === "loading" ? (
                <p className="admin-hint">Загрузка заданий...</p>
              ) : taskCatalog.length === 0 ? (
                <p className="admin-hint">Нет доступных заданий.</p>
              ) : filteredTaskCatalog.length === 0 ? (
                <p className="admin-hint">Нет заданий по фильтру.</p>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <th />
                      <th>ID</th>
                      <th>Название</th>
                      <th>Предмет</th>
                      <th>Тип</th>
                      <th>Порядок</th>
                      <th>Баллы</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTaskCatalog.map((task) => {
                      const selection = taskSelection[task.id];
                      return (
                        <tr key={task.id}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selection?.checked ?? false}
                              onChange={() => toggleTaskSelection(task.id)}
                            />
                          </td>
                          <td>{task.id}</td>
                          <td>{task.title}</td>
                          <td>{task.subject}</td>
                          <td>{task.task_type}</td>
                          <td>
                            <input
                              className="field-input admin-task-input"
                              value={selection?.sortOrder ?? "1"}
                              onChange={(event) =>
                                updateTaskSelection(task.id, { sortOrder: event.target.value })
                              }
                              disabled={!selection?.checked || randomOrder}
                            />
                          </td>
                          <td>
                            <input
                              className="field-input admin-task-input"
                              value={selection?.maxScore ?? "1"}
                              onChange={(event) =>
                                updateTaskSelection(task.id, { maxScore: event.target.value })
                              }
                              disabled={!selection?.checked}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              )}
            </div>
          </div>
          {formError ? <span className="admin-error">{formError}</span> : null}
          {taskAttachError ? <span className="admin-error">{taskAttachError}</span> : null}
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
