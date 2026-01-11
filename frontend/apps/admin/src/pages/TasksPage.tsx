import React, { useEffect, useState } from "react";
import { Button, Modal, Table, TextInput } from "@ui";
import { adminApiClient } from "../lib/adminClient";

type TaskItem = {
  id: number;
  subject: string;
  title: string;
  content: string;
  task_type: string;
  image_key: string | null;
  payload: Record<string, unknown>;
  created_by_user_id: number;
};

type TaskForm = {
  subject: string;
  title: string;
  content: string;
  taskType: string;
  imageKey: string;
  payload: string;
};

const emptyForm: TaskForm = {
  subject: "math",
  title: "",
  content: "",
  taskType: "single_choice",
  imageKey: "",
  payload: ""
};

export function TasksPage() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [form, setForm] = useState<TaskForm>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TaskItem | null>(null);
  const [deleteStatus, setDeleteStatus] = useState<"idle" | "deleting" | "error">("idle");

  const loadTasks = async () => {
    setStatus("loading");
    setError(null);
    try {
      const data = await adminApiClient.request<TaskItem[]>({ path: "/admin/tasks", method: "GET" });
      setTasks(data ?? []);
      setStatus("idle");
    } catch {
      setStatus("error");
      setError("Не удалось загрузить задания.");
    }
  };

  useEffect(() => {
    void loadTasks();
  }, []);

  const openCreate = () => {
    setFormMode("create");
    setForm(emptyForm);
    setEditingTaskId(null);
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEdit = (task: TaskItem) => {
    setFormMode("edit");
    setEditingTaskId(task.id);
    setForm({
      subject: task.subject,
      title: task.title,
      content: task.content,
      taskType: task.task_type,
      imageKey: task.image_key ?? "",
      payload: JSON.stringify(task.payload ?? {}, null, 2)
    });
    setFormError(null);
    setIsFormOpen(true);
  };

  const parsePayload = () => {
    if (!form.payload.trim()) {
      return null;
    }
    try {
      return JSON.parse(form.payload) as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  const handleSave = async () => {
    setFormError(null);
    const payload = parsePayload();
    if (!payload) {
      setFormError("Заполните payload в формате JSON.");
      return;
    }
    setIsSaving(true);
    try {
      const body = {
        subject: form.subject,
        title: form.title,
        content: form.content,
        task_type: form.taskType,
        image_key: form.imageKey ? form.imageKey : null,
        payload
      };
      if (formMode === "create") {
        await adminApiClient.request({ path: "/admin/tasks", method: "POST", body });
      } else if (editingTaskId) {
        await adminApiClient.request({
          path: `/admin/tasks/${editingTaskId}`,
          method: "PUT",
          body
        });
      }
      setIsFormOpen(false);
      await loadTasks();
    } catch {
      setFormError("Не удалось сохранить задание.");
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
      await adminApiClient.request({ path: `/admin/tasks/${deleteTarget.id}`, method: "DELETE" });
      setDeleteTarget(null);
      await loadTasks();
    } catch {
      setDeleteStatus("error");
    }
  };

  return (
    <section className="admin-section">
      <div className="admin-toolbar">
        <div>
          <h1>Управление заданиями</h1>
          <p className="admin-hint">Создавайте и редактируйте задания банка.</p>
        </div>
        <div className="admin-toolbar-actions">
          <Button type="button" onClick={openCreate}>
            Создать задание
          </Button>
        </div>
      </div>
      {status === "error" && error ? <div className="admin-alert">{error}</div> : null}
      <Table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Предмет</th>
            <th>Название</th>
            <th>Тип</th>
            <th>Автор</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {status === "loading" ? (
            <tr>
              <td colSpan={6}>Загрузка...</td>
            </tr>
          ) : tasks.length === 0 ? (
            <tr>
              <td colSpan={6}>Заданий пока нет.</td>
            </tr>
          ) : (
            tasks.map((task) => (
              <tr key={task.id}>
                <td>{task.id}</td>
                <td>{task.subject}</td>
                <td>{task.title}</td>
                <td>{task.task_type}</td>
                <td>{task.created_by_user_id}</td>
                <td>
                  <div className="admin-table-actions">
                    <Button type="button" size="sm" variant="outline" onClick={() => openEdit(task)}>
                      Редактировать
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setDeleteTarget(task)}>
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
        title={formMode === "create" ? "Новое задание" : "Редактирование задания"}
      >
        <div className="admin-form">
          <div className="admin-form-grid">
            <label className="field">
              <span className="field-label">Предмет</span>
              <select
                className="field-input"
                value={form.subject}
                onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value }))}
              >
                <option value="math">Математика</option>
                <option value="cs">Информатика</option>
              </select>
            </label>
            <label className="field">
              <span className="field-label">Тип задания</span>
              <select
                className="field-input"
                value={form.taskType}
                onChange={(event) => setForm((prev) => ({ ...prev, taskType: event.target.value }))}
              >
                <option value="single_choice">Один вариант</option>
                <option value="multi_choice">Несколько вариантов</option>
                <option value="short_text">Короткий ответ</option>
              </select>
            </label>
          </div>
          <TextInput
            label="Название"
            name="title"
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
          />
          <label className="field">
            <span className="field-label">Условие</span>
            <textarea
              className="field-input admin-textarea"
              value={form.content}
              onChange={(event) => setForm((prev) => ({ ...prev, content: event.target.value }))}
            />
          </label>
          <TextInput
            label="Ключ изображения (опционально)"
            name="imageKey"
            value={form.imageKey}
            onChange={(event) => setForm((prev) => ({ ...prev, imageKey: event.target.value }))}
          />
          <label className="field">
            <span className="field-label">Payload (JSON)</span>
            <textarea
              className="field-input admin-textarea"
              value={form.payload}
              onChange={(event) => setForm((prev) => ({ ...prev, payload: event.target.value }))}
              placeholder='{"options":[{"id":"a","text":"4"}],"correct_option_id":"a"}'
            />
          </label>
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

      <Modal isOpen={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="Удалить задание">
        <p>Вы действительно хотите удалить задание “{deleteTarget?.title}”?</p>
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
