import React, { useEffect, useState } from "react";
import { Button, Modal, Table } from "@ui";
import { adminApiClient } from "../lib/adminClient";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

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
    let formatted = escapeHtml(text);
    formatted = formatted.replace(/`([^`]+)`/g, "<code>$1</code>");
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    formatted = formatted.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    formatted = formatted.replace(/~~([^~]+)~~/g, "<del>$1</del>");
    formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
      if (/^javascript:/i.test(url.trim())) {
        return label;
      }
      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });
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

type OlympiadItem = {
  id: number;
  title: string;
};

type AttemptRow = {
  id: number;
  user_id: number;
  user_login: string;
  user_full_name: string | null;
  class_grade: number | null;
  city: string | null;
  school: string | null;
  linked_teachers: string | null;
  started_at: string;
  completed_at: string | null;
  duration_sec: number;
  score_total: number;
  score_max: number;
  percent: number;
};

type AttemptTask = {
  task_id: number;
  title: string;
  content: string;
  task_type: string;
  image_key?: string | null;
  payload: { image_position?: "before" | "after" };
  sort_order: number;
  max_score: number;
  answer_payload?: Record<string, unknown> | null;
  updated_at?: string | null;
  is_correct?: boolean | null;
};

type AttemptView = {
  attempt: { id: number };
  user: { id: number; login: string; full_name: string | null };
  olympiad_title: string;
  tasks: AttemptTask[];
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";
const MOCK_S3_STORAGE_KEY = "ni_admin_s3_mock";

const loadMockS3 = (): Record<string, string> => {
  if (typeof window === "undefined") {
    return {};
  }
  const raw = window.localStorage.getItem(MOCK_S3_STORAGE_KEY);
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const formatTime = (value?: string | null) => {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
};

const formatDateOnly = (value?: string | null) => {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString("ru-RU");
};

const getDurationMinutes = (startedAt?: string | null, completedAt?: string | null, fallbackSec?: number | null) => {
  if (startedAt && completedAt) {
    const start = new Date(startedAt);
    const end = new Date(completedAt);
    const diffMs = end.getTime() - start.getTime();
    if (!Number.isNaN(diffMs) && diffMs >= 0) {
      return Math.round(diffMs / 60000);
    }
  }
  if (typeof fallbackSec === "number" && Number.isFinite(fallbackSec)) {
    return Math.round(fallbackSec / 60);
  }
  return null;
};

const formatAnswer = (answer?: Record<string, unknown> | null) => {
  if (!answer) {
    return "Нет ответа";
  }
  if ("choice_id" in answer) {
    return `Вариант: ${String(answer.choice_id)}`;
  }
  if ("choice_ids" in answer && Array.isArray(answer.choice_ids)) {
    return `Варианты: ${(answer.choice_ids as string[]).join(", ")}`;
  }
  if ("text" in answer) {
    return String(answer.text ?? "");
  }
  try {
    return JSON.stringify(answer);
  } catch {
    return String(answer);
  }
};

const escapeCsv = (value: string | number | null | undefined) => {
  const raw = value === null || value === undefined ? "" : String(value);
  if (raw.includes(",") || raw.includes("\"") || raw.includes("\n")) {
    return `"${raw.replace(/\"/g, "\"\"")}"`;
  }
  return raw;
};

export function ResultsPage() {
  const [olympiads, setOlympiads] = useState<OlympiadItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [attemptsStatus, setAttemptsStatus] = useState<"idle" | "loading" | "error">("idle");
  const [attemptsError, setAttemptsError] = useState<string | null>(null);

  const [attemptView, setAttemptView] = useState<AttemptView | null>(null);
  const [attemptViewStatus, setAttemptViewStatus] = useState<"idle" | "loading" | "error">("idle");
  const [attemptViewError, setAttemptViewError] = useState<string | null>(null);
  const [attemptImageUrls, setAttemptImageUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const loadOlympiads = async () => {
      try {
        const data = await adminApiClient.request<OlympiadItem[]>({
          path: "/admin/olympiads?mine=false&limit=200",
          method: "GET"
        });
        setOlympiads(data ?? []);
      } catch {
        setOlympiads([]);
      }
    };
    void loadOlympiads();
  }, []);

  useEffect(() => {
    setSelectedId(null);
    setAttempts([]);
    setAttemptsStatus("idle");
    setAttemptsError(null);
  }, []);

  useEffect(() => {
    if (!selectedId) {
      return;
    }
    setAttemptsStatus("loading");
    setAttemptsError(null);
    adminApiClient
      .request<AttemptRow[]>({
        path: `/admin/results/olympiads/${selectedId}/attempts`,
        method: "GET"
      })
      .then((data) => {
        setAttempts(data ?? []);
        setAttemptsStatus("idle");
      })
      .catch(() => {
        setAttemptsStatus("error");
        setAttemptsError("Не удалось загрузить результаты.");
      });
  }, [selectedId]);

  useEffect(() => {
    if (!attemptView) {
      setAttemptImageUrls({});
      return;
    }
    const missingKeys = attemptView.tasks
      .map((task) => task.image_key)
      .filter((key): key is string => Boolean(key))
      .filter((key) => !attemptImageUrls[key]);
    if (missingKeys.length === 0) {
      return;
    }
    let isMounted = true;
    const loadImages = async () => {
      const entries = await Promise.all(
        missingKeys.map(async (key) => {
          if (key.startsWith("http") || key.startsWith("data:")) {
            return [key, key] as const;
          }
          const mockData = loadMockS3()[key];
          if (mockData) {
            return [key, mockData] as const;
          }
          try {
            const safeKey = key.split("/").map(encodeURIComponent).join("/");
            const payload = await adminApiClient.request<{ url: string; public_url?: string | null }>({
              path: `/uploads/${safeKey}`,
              method: "GET"
            });
            return [key, payload.public_url ?? payload.url] as const;
          } catch {
            return [key, ""] as const;
          }
        })
      );
      if (!isMounted) {
        return;
      }
      setAttemptImageUrls((prev) => {
        const next = { ...prev };
        entries.forEach(([key, url]) => {
          if (url) {
            next[key] = url;
          }
        });
        return next;
      });
    };
    void loadImages();
    return () => {
      isMounted = false;
    };
  }, [attemptView, attemptImageUrls]);

  const handleAttemptOpen = async (attemptId: number) => {
    setAttemptViewStatus("loading");
    setAttemptViewError(null);
    try {
      const data = await adminApiClient.request<AttemptView>({
        path: `/admin/results/attempts/${attemptId}`,
        method: "GET"
      });
      const tasks = [...(data.tasks ?? [])].sort((a, b) => a.sort_order - b.sort_order);
      setAttemptView({ ...data, tasks });
      setAttemptViewStatus("idle");
    } catch {
      setAttemptViewStatus("error");
      setAttemptViewError("Не удалось загрузить попытку.");
    }
  };

  const handleAttemptClose = () => {
    setAttemptView(null);
    setAttemptViewError(null);
    setAttemptViewStatus("idle");
    setAttemptImageUrls({});
  };

  const exportCsv = () => {
    if (!attempts.length || !selectedId) {
      return;
    }
    const header = [
      "№",
      "ID попытки",
      "Дата выполнения",
      "Время начала",
      "Время завершения",
      "Длительность (мин)",
      "Логин пользователя",
      "ФИО пользователя",
      "Класс",
      "Город",
      "Школа",
      "Привязанные учителя",
      "Баллы",
      "Проценты",
      "Диплом"
    ];
    const rows = attempts.map((item, index) => [
      index + 1,
      item.id,
      formatDateOnly(item.started_at),
      formatTime(item.started_at),
      formatTime(item.completed_at),
      getDurationMinutes(item.started_at, item.completed_at, item.duration_sec) ?? "—",
      item.user_login,
      item.user_full_name ?? "—",
      item.class_grade ?? "—",
      item.city ?? "—",
      item.school ?? "—",
      item.linked_teachers ?? "—",
      `${item.score_total}/${item.score_max}`,
      `${item.percent}%`,
      `${API_BASE_URL}/attempts/${item.id}/diploma`
    ]);
    const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `results-${selectedId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="admin-section">
      <div className="admin-toolbar">
        <div>
          <h1>Результаты</h1>
          <p className="admin-hint">Выберите тип данных и конкретную запись для просмотра.</p>
        </div>
        <div className="admin-toolbar-actions">
          <Button type="button" variant="outline" onClick={exportCsv} disabled={!attempts.length}>
            Экспорт в CSV
          </Button>
        </div>
      </div>

      <div className="admin-report-filters">
        <label className="field">
          <span className="field-label">Наименование</span>
          <select
            className="field-input"
            value={selectedId ?? ""}
            onChange={(event) => setSelectedId(event.target.value ? Number(event.target.value) : null)}
          >
            <option value="">Выберите значение</option>
            {olympiads.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      {selectedId ? (
        <p className="admin-hint">
          Всего попыток: {attemptsStatus === "loading" ? "..." : attempts.length}
        </p>
      ) : null}

      {attemptsStatus === "error" && attemptsError ? <div className="admin-alert">{attemptsError}</div> : null}

      {selectedId ? (
        <div className="admin-table-scroll admin-results-scroll">
          <Table>
            <thead>
              <tr>
                <th>№</th>
                <th>ID попытки</th>
                <th>Дата выполнения</th>
                <th>Время начала</th>
                <th>Время завершения</th>
                <th>Длительность попытки</th>
                <th>Логин пользователя</th>
                <th>ФИО пользователя</th>
                <th>Класс</th>
                <th>Город</th>
                <th>Школа</th>
                <th>Привязанные учителя</th>
                <th>Баллы</th>
                <th>Проценты</th>
                <th>Диплом</th>
              </tr>
            </thead>
            <tbody>
              {attemptsStatus === "loading" ? (
                <tr>
                  <td colSpan={15}>Загрузка...</td>
                </tr>
              ) : attempts.length === 0 ? (
                <tr>
                  <td colSpan={15}>Нет попыток.</td>
                </tr>
              ) : (
                attempts.map((item, index) => (
                  <tr key={item.id}>
                    <td>{index + 1}</td>
                    <td>
                      <button
                        type="button"
                        className="admin-link-button"
                        onClick={() => handleAttemptOpen(item.id)}
                      >
                        {item.id}
                      </button>
                    </td>
                    <td>{formatDateOnly(item.started_at)}</td>
                    <td>{formatTime(item.started_at)}</td>
                    <td>{formatTime(item.completed_at)}</td>
                    <td>
                      {(() => {
                        const minutes = getDurationMinutes(item.started_at, item.completed_at, item.duration_sec);
                        return minutes === null ? "—" : `${minutes} мин`;
                      })()}
                    </td>
                    <td>{item.user_login}</td>
                    <td>{item.user_full_name ?? "—"}</td>
                    <td>{item.class_grade ?? "—"}</td>
                    <td>{item.city ?? "—"}</td>
                    <td>{item.school ?? "—"}</td>
                    <td>{item.linked_teachers ?? "—"}</td>
                    <td>
                      {item.score_total} / {item.score_max}
                    </td>
                    <td>{item.percent}%</td>
                    <td>
                      <a
                        className="admin-link"
                        href={`${API_BASE_URL}/attempts/${item.id}/diploma`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Скачать
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </div>
      ) : null}

      <Modal
        isOpen={attemptViewStatus === "loading" || Boolean(attemptView) || Boolean(attemptViewError)}
        onClose={handleAttemptClose}
        title={attemptView?.olympiad_title ?? "Просмотр попытки"}
        className="admin-result-modal"
      >
        {attemptViewStatus === "loading" ? <p>Загрузка...</p> : null}
        {attemptViewError ? <p className="admin-error">{attemptViewError}</p> : null}
        {attemptView ? (
          <div className="admin-attempt">
            <p className="admin-hint">
              Пользователь: {attemptView.user.full_name ?? attemptView.user.login}
            </p>
            <div className="admin-attempt-tasks">
              {attemptView.tasks.map((task, index) => {
                const imageUrl = task.image_key ? attemptImageUrls[task.image_key] : null;
                const imagePosition = task.payload?.image_position ?? "after";
                return (
                  <div className="admin-attempt-task" key={task.task_id}>
                    <h4>
                      Задание {index + 1}. {task.title}
                    </h4>
                    {imageUrl && imagePosition === "before" ? (
                      <img src={imageUrl} alt="Иллюстрация" className="admin-attempt-image" />
                    ) : null}
                    <div
                      className="admin-attempt-content"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(task.content) }}
                    />
                    {imageUrl && imagePosition !== "before" ? (
                      <img src={imageUrl} alt="Иллюстрация" className="admin-attempt-image" />
                    ) : null}
                    <div
                      className={[
                        "admin-attempt-answer",
                        task.is_correct === true ? "is-correct" : "",
                        task.is_correct === false ? "is-wrong" : ""
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <span>Ответ:</span> {formatAnswer(task.answer_payload ?? null)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
