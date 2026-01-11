import React, { useEffect, useState } from "react";
import { Button, Modal, Table, TextInput } from "@ui";
import { adminApiClient } from "../lib/adminClient";
import { formatDate } from "../lib/formatters";

type ContentItem = {
  id: number;
  content_type: "article" | "news";
  status: "draft" | "published";
  title: string;
  body: string;
  image_keys: string[];
  author_id: number;
  published_by_id: number | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

type ContentForm = {
  contentType: "article" | "news";
  title: string;
  body: string;
  imageKeys: string;
  publish: boolean;
};

const emptyForm: ContentForm = {
  contentType: "article",
  title: "",
  body: "",
  imageKeys: "",
  publish: false
};

export function ContentPage() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [form, setForm] = useState<ContentForm>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ContentItem | null>(null);
  const [deleteStatus, setDeleteStatus] = useState<"idle" | "deleting" | "error">("idle");
  const [publishStatus, setPublishStatus] = useState<number | null>(null);

  const loadContent = async () => {
    setStatus("loading");
    setError(null);
    try {
      const data = await adminApiClient.request<ContentItem[]>({ path: "/admin/content", method: "GET" });
      setItems(data ?? []);
      setStatus("idle");
    } catch {
      setStatus("error");
      setError("Не удалось загрузить материалы.");
    }
  };

  useEffect(() => {
    void loadContent();
  }, []);

  const openCreate = () => {
    setFormMode("create");
    setForm(emptyForm);
    setEditingId(null);
    setIsFormOpen(true);
  };

  const openEdit = (item: ContentItem) => {
    setFormMode("edit");
    setEditingId(item.id);
    setForm({
      contentType: item.content_type,
      title: item.title,
      body: item.body,
      imageKeys: item.image_keys.join(", "),
      publish: item.status === "published"
    });
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    setFormError(null);
    setIsSaving(true);
    const imageKeys = form.imageKeys
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    try {
      if (formMode === "create") {
        await adminApiClient.request({
          path: "/admin/content",
          method: "POST",
          body: {
            content_type: form.contentType,
            title: form.title,
            body: form.body,
            image_keys: imageKeys,
            publish: form.publish
          }
        });
      } else if (editingId) {
        await adminApiClient.request({
          path: `/admin/content/${editingId}`,
          method: "PUT",
          body: {
            title: form.title,
            body: form.body,
            image_keys: imageKeys.length > 0 ? imageKeys : undefined
          }
        });
      }
      setIsFormOpen(false);
      await loadContent();
    } catch {
      setFormError("Не удалось сохранить материал.");
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
      await adminApiClient.request({ path: `/admin/content/${deleteTarget.id}`, method: "DELETE" });
      setDeleteTarget(null);
      await loadContent();
    } catch {
      setDeleteStatus("error");
    }
  };

  const togglePublish = async (item: ContentItem) => {
    setPublishStatus(item.id);
    try {
      await adminApiClient.request({
        path: `/admin/content/${item.id}/publish?publish=${item.status !== "published"}`,
        method: "POST"
      });
      await loadContent();
    } finally {
      setPublishStatus(null);
    }
  };

  return (
    <section className="admin-section">
      <div className="admin-toolbar">
        <div>
          <h1>Управление статьями и новостями</h1>
          <p className="admin-hint">Создавайте и публикуйте материалы для пользователей.</p>
        </div>
        <div className="admin-toolbar-actions">
          <Button type="button" onClick={openCreate}>
            Создать материал
          </Button>
        </div>
      </div>
      {status === "error" && error ? <div className="admin-alert">{error}</div> : null}
      <Table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Тип</th>
            <th>Заголовок</th>
            <th>Статус</th>
            <th>Обновлено</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {status === "loading" ? (
            <tr>
              <td colSpan={6}>Загрузка...</td>
            </tr>
          ) : items.length === 0 ? (
            <tr>
              <td colSpan={6}>Материалов пока нет.</td>
            </tr>
          ) : (
            items.map((item) => (
              <tr key={item.id}>
                <td>{item.id}</td>
                <td>{item.content_type === "news" ? "Новость" : "Статья"}</td>
                <td>{item.title}</td>
                <td>
                  <span className={`admin-tag ${item.status === "published" ? "admin-tag-success" : "admin-tag-muted"}`}>
                    {item.status === "published" ? "Опубликовано" : "Черновик"}
                  </span>
                </td>
                <td>{formatDate(item.updated_at)}</td>
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
                      {item.status === "published" ? "Снять" : "Опубликовать"}
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
        title={formMode === "create" ? "Новый материал" : "Редактирование материала"}
      >
        <div className="admin-form">
          {formMode === "create" ? (
            <label className="field">
              <span className="field-label">Тип</span>
              <select
                className="field-input"
                value={form.contentType}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, contentType: event.target.value as ContentForm["contentType"] }))
                }
              >
                <option value="article">Статья</option>
                <option value="news">Новость</option>
              </select>
            </label>
          ) : (
            <p className="admin-hint">Тип материала: {form.contentType === "news" ? "Новость" : "Статья"}</p>
          )}
          <TextInput
            label="Заголовок"
            name="title"
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
          />
          <label className="field">
            <span className="field-label">Текст</span>
            <textarea
              className="field-input admin-textarea"
              value={form.body}
              onChange={(event) => setForm((prev) => ({ ...prev, body: event.target.value }))}
            />
          </label>
          <TextInput
            label="Ключи изображений (через запятую)"
            name="imageKeys"
            value={form.imageKeys}
            onChange={(event) => setForm((prev) => ({ ...prev, imageKeys: event.target.value }))}
          />
          {formMode === "create" ? (
            <label className="field">
              <span className="field-label">Публиковать сразу</span>
              <input
                type="checkbox"
                checked={form.publish}
                onChange={(event) => setForm((prev) => ({ ...prev, publish: event.target.checked }))}
              />
            </label>
          ) : null}
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

      <Modal isOpen={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="Удалить материал">
        <p>Вы действительно хотите удалить материал “{deleteTarget?.title}”?</p>
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
