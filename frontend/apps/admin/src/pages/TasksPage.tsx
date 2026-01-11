import React, { useEffect, useState } from "react";
import { Button, Modal, Table, TextInput, useAuth } from "@ui";
import type { UserRead } from "@api";
import { adminApiClient } from "../lib/adminClient";

const MOCK_S3_STORAGE_KEY = "ni_admin_s3_mock";

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

type TaskPreview = {
  subject: string;
  title: string;
  content: string;
  taskType: string;
  imageUrl: string | null;
  imagePosition: "before" | "after";
  author: string | null;
  options?: AnswerOption[];
  shortAnswer?: ShortAnswerForm;
};

type AnswerOption = {
  id: string;
  text: string;
  isCorrect: boolean;
};

type ShortAnswerForm = {
  subtype: "int" | "float" | "text";
  expected: string;
  epsilon: string;
};

type TaskForm = {
  subject: string;
  title: string;
  content: string;
  taskType: string;
  imageKey: string;
  imagePosition: "before" | "after";
  options: AnswerOption[];
  shortAnswer: ShortAnswerForm;
};

const DEFAULT_OPTIONS: AnswerOption[] = [
  { id: "A", text: "", isCorrect: false },
  { id: "B", text: "", isCorrect: false }
];

const DEFAULT_SHORT_ANSWER: ShortAnswerForm = {
  subtype: "text",
  expected: "",
  epsilon: "0.01"
};

const emptyForm: TaskForm = {
  subject: "math",
  title: "",
  content: "",
  taskType: "single_choice",
  imageKey: "",
  imagePosition: "after",
  options: DEFAULT_OPTIONS,
  shortAnswer: DEFAULT_SHORT_ANSWER
};

const mockS3Memory = new Map<string, string>();

const loadMockS3 = () => {
  if (typeof window === "undefined") {
    return {};
  }
  const raw = window.localStorage.getItem(MOCK_S3_STORAGE_KEY);
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
};

const saveMockS3 = (data: Record<string, string>) => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(MOCK_S3_STORAGE_KEY, JSON.stringify(data));
};

const storeMockS3Object = (key: string, value: string) => {
  mockS3Memory.set(key, value);
  const data = loadMockS3();
  data[key] = value;
  try {
    saveMockS3(data);
  } catch {
    // Quota exceeded, fallback to memory only.
  }
};

const getMockS3Object = (key: string) => {
  if (mockS3Memory.has(key)) {
    return mockS3Memory.get(key) ?? null;
  }
  const data = loadMockS3();
  Object.entries(data).forEach(([storedKey, storedValue]) => {
    mockS3Memory.set(storedKey, storedValue);
  });
  return data[key] ?? null;
};

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const renderMarkdown = (value: string) => {
  const lines = value.split(/\r?\n/);
  const html: string[] = [];
  let inList = false;
  let listType: "ul" | "ol" | null = null;
  let inCode = false;

  const closeList = () => {
    if (inList) {
      html.push(`</${listType}>`);
      inList = false;
      listType = null;
    }
  };

  const formatInline = (text: string) => {
    let formatted = text;
    formatted = formatted.replace(/`([^`]+)`/g, (_, code) => `<code>${escapeHtml(code)}</code>`);
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    formatted = formatted.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    formatted = formatted.replace(/~~([^~]+)~~/g, "<del>$1</del>");
    formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
    return formatted;
  };

  lines.forEach((line) => {
    if (line.trim().startsWith("```")) {
      if (inCode) {
        html.push("</code></pre>");
        inCode = false;
      } else {
        closeList();
        inCode = true;
        html.push("<pre><code>");
      }
      return;
    }
    if (inCode) {
      html.push(escapeHtml(line));
      return;
    }
    const trimmed = line.trim();
    if (!trimmed) {
      closeList();
      html.push("<br />");
      return;
    }
    if (trimmed.startsWith("#")) {
      closeList();
      const level = Math.min(3, trimmed.match(/^#+/)?.[0].length ?? 1);
      const content = trimmed.replace(/^#+\s*/, "");
      html.push(`<h${level}>${formatInline(content)}</h${level}>`);
      return;
    }
    if (/^>\s+/.test(trimmed)) {
      closeList();
      const content = trimmed.replace(/^>\s+/, "");
      html.push(`<blockquote>${formatInline(content)}</blockquote>`);
      return;
    }
    if (/^\d+\.\s+/.test(trimmed)) {
      if (!inList || listType !== "ol") {
        closeList();
        html.push("<ol>");
        inList = true;
        listType = "ol";
      }
      const content = trimmed.replace(/^\d+\.\s+/, "");
      html.push(`<li>${formatInline(content)}</li>`);
      return;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      if (!inList || listType !== "ul") {
        closeList();
        html.push("<ul>");
        inList = true;
        listType = "ul";
      }
      const content = trimmed.replace(/^[-*]\s+/, "");
      html.push(`<li>${formatInline(content)}</li>`);
      return;
    }
    if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
      closeList();
      html.push("<hr />");
      return;
    }
    closeList();
    html.push(`<p>${formatInline(trimmed)}</p>`);
  });

  if (inCode) {
    html.push("</code></pre>");
  }
  closeList();
  return html.join("");
};

export function TasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [authors, setAuthors] = useState<Record<number, string>>({});
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [form, setForm] = useState<TaskForm>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [copyingId, setCopyingId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaskItem | null>(null);
  const [deleteStatus, setDeleteStatus] = useState<"idle" | "deleting" | "error">("idle");
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isImagePreviewOpen, setIsImagePreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<TaskPreview | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const loadTasks = async () => {
    setStatus("loading");
    setError(null);
    try {
      const data = await adminApiClient.request<TaskItem[]>({ path: "/admin/tasks", method: "GET" });
      const nextTasks = data ?? [];
      setTasks(nextTasks);
      await loadAuthors(nextTasks);
      setStatus("idle");
    } catch {
      setStatus("error");
      setError("Не удалось загрузить задания.");
    }
  };

  const loadAuthors = async (items: TaskItem[]) => {
    const ids = Array.from(new Set(items.map((task) => task.created_by_user_id)));
    const missing = ids.filter((id) => !authors[id]);
    if (missing.length === 0) {
      return;
    }
    const entries = await Promise.all(
      missing.map(async (id) => {
        try {
          const adminUser = await adminApiClient.request<UserRead>({
            path: `/admin/users/${id}`,
            method: "GET"
          });
          return [id, adminUser.login] as const;
        } catch {
          return [id, `ID ${id}`] as const;
        }
      })
    );
    setAuthors((prev) => {
      const next = { ...prev };
      entries.forEach(([id, login]) => {
        next[id] = login;
      });
      return next;
    });
  };

  useEffect(() => {
    void loadTasks();
  }, []);

  const openCreate = () => {
    setFormMode("create");
    setForm(emptyForm);
    setEditingTaskId(null);
    setFormError(null);
    setImagePreviewUrl(null);
    setPreviewData(null);
    setIsFormOpen(true);
  };

  const openEdit = (task: TaskItem) => {
    const payload = task.payload ?? {};
    const taskType = task.task_type;
    const options = Array.isArray(payload.options)
      ? payload.options.map((option: Record<string, unknown>) => ({
          id: String(option.id ?? ""),
          text: String(option.text ?? ""),
          isCorrect: false
        }))
      : DEFAULT_OPTIONS;

    let correctOptionIds: string[] = [];
    if (taskType === "single_choice" && typeof payload.correct_option_id === "string") {
      correctOptionIds = [payload.correct_option_id];
    }
    if (taskType === "multi_choice" && Array.isArray(payload.correct_option_ids)) {
      correctOptionIds = payload.correct_option_ids.map((item: unknown) => String(item));
    }

    const hydratedOptions = options.map((option) => ({
      ...option,
      isCorrect: correctOptionIds.includes(option.id)
    }));

    const shortAnswer: ShortAnswerForm = {
      subtype:
        payload.subtype === "int" || payload.subtype === "float" || payload.subtype === "text"
          ? payload.subtype
          : "text",
      expected: payload.expected !== undefined && payload.expected !== null ? String(payload.expected) : "",
      epsilon:
        payload.epsilon !== undefined && payload.epsilon !== null ? String(payload.epsilon) : DEFAULT_SHORT_ANSWER.epsilon
    };
    const imagePosition =
      payload.image_position === "before" || payload.image_position === "after"
        ? payload.image_position
        : "after";

    setFormMode("edit");
    setEditingTaskId(task.id);
    setForm({
      subject: task.subject,
      title: task.title,
      content: task.content,
      taskType,
      imageKey: task.image_key ?? "",
      imagePosition,
      options: hydratedOptions.length > 0 ? hydratedOptions : DEFAULT_OPTIONS,
      shortAnswer
    });
    if (task.image_key) {
      const stored = getMockS3Object(task.image_key);
      if (stored) {
        setImagePreviewUrl(stored);
      } else if (task.image_key.startsWith("http") || task.image_key.startsWith("data:")) {
        setImagePreviewUrl(task.image_key);
      } else {
        setImagePreviewUrl(null);
      }
    } else {
      setImagePreviewUrl(null);
    }
    setFormError(null);
    setPreviewData(null);
    setIsFormOpen(true);
  };

  const buildChoicePayload = () => {
    const options = form.options.map((option) => ({
      id: option.id,
      text: option.text.trim()
    }));
    if (options.length < 2) {
      return { error: "Добавьте минимум два варианта ответа." };
    }
    if (options.some((option) => !option.text)) {
      return { error: "Заполните текст каждого варианта." };
    }
    const ids = options.map((option) => option.id);
    if (new Set(ids).size !== ids.length) {
      return { error: "ID вариантов ответа должны быть уникальными." };
    }
    const correctIds = form.options.filter((option) => option.isCorrect).map((option) => option.id);
    if (form.taskType === "single_choice") {
      if (correctIds.length !== 1) {
        return { error: "Выберите один правильный вариант." };
      }
      return { payload: { options, correct_option_id: correctIds[0], image_position: form.imagePosition } };
    }
    if (correctIds.length === 0) {
      return { error: "Выберите хотя бы один правильный вариант." };
    }
    return { payload: { options, correct_option_ids: correctIds, image_position: form.imagePosition } };
  };

  const buildShortAnswerPayload = () => {
    const expected = form.shortAnswer.expected.trim();
    if (!expected) {
      return { error: "Введите правильный ответ." };
    }
    const payload: Record<string, unknown> = {
      subtype: form.shortAnswer.subtype,
      image_position: form.imagePosition
    };
    if (form.shortAnswer.subtype === "int") {
      const parsed = Number.parseInt(expected, 10);
      if (Number.isNaN(parsed)) {
        return { error: "Правильный ответ должен быть целым числом." };
      }
      payload.expected = parsed;
    } else if (form.shortAnswer.subtype === "float") {
      const parsed = Number.parseFloat(expected.replace(",", "."));
      if (Number.isNaN(parsed)) {
        return { error: "Правильный ответ должен быть числом." };
      }
      payload.expected = parsed;
      const epsilonValue = form.shortAnswer.epsilon.trim();
      if (epsilonValue) {
        const epsilonParsed = Number.parseFloat(epsilonValue.replace(",", "."));
        if (Number.isNaN(epsilonParsed) || epsilonParsed <= 0) {
          return { error: "Укажите положительную погрешность." };
        }
        payload.epsilon = epsilonParsed;
      }
    } else {
      payload.expected = expected;
    }
    return { payload };
  };

  const getNextOptionId = () => {
    const used = new Set(form.options.map((option) => option.id));
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    for (const letter of alphabet) {
      if (!used.has(letter)) {
        return letter;
      }
    }
    return `OPT${form.options.length + 1}`;
  };

  const addOption = () => {
    setForm((prev) => ({
      ...prev,
      options: [...prev.options, { id: getNextOptionId(), text: "", isCorrect: false }]
    }));
  };

  const removeOption = (id: string) => {
    setForm((prev) => ({
      ...prev,
      options: prev.options.filter((option) => option.id !== id)
    }));
  };

  const updateOptionText = (id: string, value: string) => {
    setForm((prev) => ({
      ...prev,
      options: prev.options.map((option) =>
        option.id === id ? { ...option, text: value } : option
      )
    }));
  };

  const toggleCorrectOption = (id: string) => {
    setForm((prev) => ({
      ...prev,
      options: prev.options.map((option) => {
        if (option.id !== id) {
          return prev.taskType === "single_choice" ? { ...option, isCorrect: false } : option;
        }
        if (prev.taskType === "single_choice") {
          return { ...option, isCorrect: !option.isCorrect };
        }
        return { ...option, isCorrect: !option.isCorrect };
      })
    }));
  };

  const handleTaskTypeChange = (value: string) => {
    setForm((prev) => ({
      ...prev,
      taskType: value,
      options: prev.options.length > 0 ? prev.options : DEFAULT_OPTIONS
    }));
  };

  const resolveImageUrl = (imageKey: string | null) => {
    if (!imageKey) {
      return null;
    }
    const stored = getMockS3Object(imageKey);
    if (stored) {
      return stored;
    }
    if (imageKey.startsWith("http") || imageKey.startsWith("data:")) {
      return imageKey;
    }
    return null;
  };

  const openPreviewFromForm = () => {
    const imageUrl = imagePreviewUrl ?? resolveImageUrl(form.imageKey);
    const data: TaskPreview = {
      subject: form.subject,
      title: form.title,
      content: form.content,
      taskType: form.taskType,
      imageUrl,
      imagePosition: form.imagePosition,
      author: user?.login ?? null
    };
    if (form.taskType === "short_text") {
      data.shortAnswer = form.shortAnswer;
    } else {
      data.options = form.options;
    }
    setPreviewData(data);
    setIsPreviewOpen(true);
  };

  const openPreviewFromTask = (task: TaskItem) => {
    const payload = task.payload ?? {};
    const imageUrl = resolveImageUrl(task.image_key);
    const data: TaskPreview = {
      subject: task.subject,
      title: task.title,
      content: task.content,
      taskType: task.task_type,
      imageUrl,
      imagePosition:
        payload.image_position === "before" || payload.image_position === "after"
          ? payload.image_position
          : "after",
      author: authors[task.created_by_user_id] ?? `ID ${task.created_by_user_id}`
    };

    if (task.task_type === "short_text") {
      data.shortAnswer = {
        subtype:
          payload.subtype === "int" || payload.subtype === "float" || payload.subtype === "text"
            ? payload.subtype
            : "text",
        expected: payload.expected !== undefined && payload.expected !== null ? String(payload.expected) : "",
        epsilon:
          payload.epsilon !== undefined && payload.epsilon !== null
            ? String(payload.epsilon)
            : DEFAULT_SHORT_ANSWER.epsilon
      };
    } else {
      const options = Array.isArray(payload.options)
        ? payload.options.map((option: Record<string, unknown>) => ({
            id: String(option.id ?? ""),
            text: String(option.text ?? ""),
            isCorrect: false
          }))
        : [];
      let correctIds: string[] = [];
      if (task.task_type === "single_choice" && typeof payload.correct_option_id === "string") {
        correctIds = [payload.correct_option_id];
      }
      if (task.task_type === "multi_choice" && Array.isArray(payload.correct_option_ids)) {
        correctIds = payload.correct_option_ids.map((item: unknown) => String(item));
      }
      data.options = options.map((option) => ({
        ...option,
        isCorrect: correctIds.includes(option.id)
      }));
    }
    setPreviewData(data);
    setIsPreviewOpen(true);
  };

  const handleImageUpload = (file: File | null) => {
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : null;
      if (!result) {
        return;
      }
      const image = new Image();
      image.onload = () => {
        const targetWidth = 600;
        if (image.width <= targetWidth) {
          const now = new Date();
          const key = `tasks/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(
            now.getDate()
          ).padStart(2, "0")}/${Date.now()}-${file.name}`;
          storeMockS3Object(key, result);
          setForm((prev) => ({ ...prev, imageKey: key }));
          setImagePreviewUrl(result);
          return;
        }

        const scale = targetWidth / image.width;
        const outputWidth = Math.round(image.width * scale);
        const outputHeight = Math.round(image.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = outputWidth;
        canvas.height = outputHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return;
        }
        ctx.drawImage(image, 0, 0, outputWidth, outputHeight);
        const mime = file.type && file.type.startsWith("image/") ? file.type : "image/png";
        let dataUrl =
          mime === "image/jpeg" || mime === "image/jpg"
            ? canvas.toDataURL(mime, 0.9)
            : canvas.toDataURL(mime);
        if (!dataUrl || dataUrl === "data:") {
          dataUrl = canvas.toDataURL("image/png");
        }
        const now = new Date();
        const key = `tasks/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}/${String(
          now.getDate()
        ).padStart(2, "0")}/${Date.now()}-${file.name}`;
        storeMockS3Object(key, dataUrl);
        setForm((prev) => ({ ...prev, imageKey: key }));
        setImagePreviewUrl(dataUrl);
      };
      image.src = result;
    };
    reader.readAsDataURL(file);
  };

  const handleImageClear = () => {
    setForm((prev) => ({ ...prev, imageKey: "" }));
    setImagePreviewUrl(null);
  };

  const handleSave = async () => {
    setFormError(null);
    const result =
      form.taskType === "short_text" ? buildShortAnswerPayload() : buildChoicePayload();
    if ("error" in result) {
      setFormError(result.error ?? "Не удалось сформировать payload.");
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
        payload: result.payload
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

  const handleCopy = async (task: TaskItem) => {
    setCopyingId(task.id);
    try {
      const suffix = " копия";
      let title = `${task.title}${suffix}`;
      if (title.length > 255) {
        title = title.slice(0, 255);
      }
      await adminApiClient.request({
        path: "/admin/tasks",
        method: "POST",
        body: {
          subject: task.subject,
          title,
          content: task.content,
          task_type: task.task_type,
          image_key: task.image_key,
          payload: task.payload
        }
      });
      await loadTasks();
    } catch {
      setError("Не удалось скопировать задание.");
      setStatus("error");
    } finally {
      setCopyingId(null);
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
                <td>{authors[task.created_by_user_id] ?? `ID ${task.created_by_user_id}`}</td>
                <td>
                  <div className="admin-table-actions">
                    <Button type="button" size="sm" variant="outline" onClick={() => openEdit(task)}>
                      Редактировать
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => openPreviewFromTask(task)}>
                      Предпросмотр
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopy(task)}
                      isLoading={copyingId === task.id}
                    >
                      Скопировать
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
        className="admin-task-modal"
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
                onChange={(event) => handleTaskTypeChange(event.target.value)}
                disabled={formMode === "edit"}
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
          <div className="admin-markdown-preview">
            <span className="field-label">Предпросмотр (Markdown)</span>
            <div
              className="admin-markdown-body"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(form.content) }}
            />
          </div>
          <div className="admin-image-field">
            <span className="field-label">Изображение</span>
            <div className="admin-image-actions">
              <label className="admin-upload">
                <input
                  type="file"
                  accept="image/*"
                  className="admin-upload-input"
                  onChange={(event) => handleImageUpload(event.target.files?.[0] ?? null)}
                />
                <span className="admin-upload-label">Загрузить изображение</span>
              </label>
              <Button type="button" size="sm" variant="outline" onClick={() => setIsImagePreviewOpen(true)}>
                Предпросмотр
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={handleImageClear}>
                Очистить
              </Button>
            </div>
            <label className="field">
              <span className="field-label">Расположение изображения</span>
              <select
                className="field-input"
                value={form.imagePosition}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    imagePosition: event.target.value as TaskForm["imagePosition"]
                  }))
                }
              >
                <option value="before">Перед условием</option>
                <option value="after">После условия</option>
              </select>
            </label>
            <TextInput
              label="Ключ изображения"
              name="imageKey"
              value={form.imageKey}
              onChange={(event) => setForm((prev) => ({ ...prev, imageKey: event.target.value }))}
            />
          </div>
          {form.taskType === "short_text" ? (
            <div className="admin-short-answer">
              <label className="field">
                <span className="field-label">Тип ответа</span>
                <select
                  className="field-input"
                  value={form.shortAnswer.subtype}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      shortAnswer: { ...prev.shortAnswer, subtype: event.target.value as ShortAnswerForm["subtype"] }
                    }))
                  }
                >
                  <option value="text">Текст</option>
                  <option value="int">Целое число</option>
                  <option value="float">Дробное число</option>
                </select>
              </label>
              <TextInput
                label="Правильный ответ"
                name="expected"
                value={form.shortAnswer.expected}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    shortAnswer: { ...prev.shortAnswer, expected: event.target.value }
                  }))
                }
              />
              {form.shortAnswer.subtype === "float" ? (
                <TextInput
                  label="Погрешность"
                  name="epsilon"
                  value={form.shortAnswer.epsilon}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      shortAnswer: { ...prev.shortAnswer, epsilon: event.target.value }
                    }))
                  }
                />
              ) : null}
            </div>
          ) : (
            <div className="admin-options">
              <div className="admin-options-header">
                <span>Варианты ответа</span>
                <Button type="button" size="sm" variant="outline" onClick={addOption}>
                  Добавить вариант
                </Button>
              </div>
              {form.options.map((option) => (
                <div className="admin-option-row" key={option.id}>
                  <span className="admin-option-id">Вариант {option.id}</span>
                  <input
                    className="field-input"
                    value={option.text}
                    onChange={(event) => updateOptionText(option.id, event.target.value)}
                    placeholder="Текст варианта"
                  />
                  <label className="admin-option-correct">
                    <input
                      type="checkbox"
                      checked={option.isCorrect}
                      onChange={() => toggleCorrectOption(option.id)}
                    />
                    Правильный
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => removeOption(option.id)}
                    disabled={form.options.length <= 2}
                  >
                    Удалить
                  </Button>
                </div>
              ))}
            </div>
          )}
          {formError ? <span className="admin-error">{formError}</span> : null}
          <div className="admin-modal-actions">
            <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
              Отмена
            </Button>
            <Button type="button" variant="outline" onClick={openPreviewFromForm}>
              Предпросмотр
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

      <Modal isOpen={isImagePreviewOpen} onClose={() => setIsImagePreviewOpen(false)} title="Предпросмотр изображения">
        {imagePreviewUrl ? (
          <img src={imagePreviewUrl} alt="Предпросмотр" className="admin-image-preview" />
        ) : (
          <p className="admin-hint">Изображение не выбрано.</p>
        )}
      </Modal>

      <Modal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        title="Предпросмотр задания"
        className="admin-task-modal"
      >
        {previewData ? (
          <div className="admin-task-preview">
            <div className="admin-task-preview-meta">
              <span>Предмет: {previewData.subject}</span>
              <span>Тип: {previewData.taskType}</span>
              <span>Автор: {previewData.author ?? "—"}</span>
            </div>
            <h3>{previewData.title || "Без названия"}</h3>
            {previewData.imageUrl && previewData.imagePosition === "before" ? (
              <img src={previewData.imageUrl} alt={previewData.title} className="admin-image-preview" />
            ) : null}
            <div
              className="admin-markdown-body admin-task-preview-body"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(previewData.content) }}
            />
            {previewData.imageUrl && previewData.imagePosition === "after" ? (
              <img src={previewData.imageUrl} alt={previewData.title} className="admin-image-preview" />
            ) : null}
            {previewData.options ? (
              <div className="admin-task-preview-options">
                <h4>Варианты ответов</h4>
                <ul>
                  {previewData.options.map((option) => (
                    <li key={option.id} className={option.isCorrect ? "is-correct" : ""}>
                      <strong>{option.id}.</strong> {option.text} {option.isCorrect ? "(правильный)" : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {previewData.shortAnswer ? (
              <div className="admin-task-preview-options">
                <h4>Правильный ответ</h4>
                <p>
                  Тип: {previewData.shortAnswer.subtype} — Значение:{" "}
                  {previewData.shortAnswer.expected || "—"}
                </p>
                {previewData.shortAnswer.subtype === "float" ? (
                  <p>Погрешность: {previewData.shortAnswer.epsilon}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
