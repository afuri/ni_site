import React, { useEffect, useState } from "react";
import { Button, Modal, Table } from "@ui";
import { adminApiClient } from "../lib/adminClient";
import { useUploadImageUrls } from "../hooks/useUploadImageUrls";

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
  gender: string | null;
  class_grade: number | null;
  city: string | null;
  school: string | null;
  region_id: number | null;
  region_name: string | null;
  school_id: number | null;
  school_status: "selected" | "missing" | "submission_pending" | "submission_rejected" | "not_required" | null;
  teachers: string | null;
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

const formatGender = (value?: string | null) => {
  if (!value) {
    return "—";
  }
  if (value === "male") {
    return "Мужской";
  }
  if (value === "female") {
    return "Женский";
  }
  return value;
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

const resolveMockImage = (key: string) => loadMockS3()[key];

export function ResultsPage() {
  const [olympiads, setOlympiads] = useState<OlympiadItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [attemptPage, setAttemptPage] = useState(0);
  const [attemptTotal, setAttemptTotal] = useState(0);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [attemptsStatus, setAttemptsStatus] = useState<"idle" | "loading" | "error">("idle");
  const [attemptsError, setAttemptsError] = useState<string | null>(null);

  const [attemptView, setAttemptView] = useState<AttemptView | null>(null);
  const [attemptViewStatus, setAttemptViewStatus] = useState<"idle" | "loading" | "error">("idle");
  const [attemptViewError, setAttemptViewError] = useState<string | null>(null);
  const attemptImageUrls = useUploadImageUrls(attemptView?.tasks.map((task) => task.image_key) ?? [], resolveMockImage);

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

  useEffect(() => { setAttemptPage(0); }, [selectedId]);

  useEffect(() => {
    if (!selectedId) {
      return;
    }
    const controller = new AbortController();
    setAttemptsStatus("loading");
    setAttemptsError(null);
    adminApiClient
      .request<{items: AttemptRow[]; total: number}>({
        path: `/admin/results/olympiads/${selectedId}/attempts?limit=200&offset=${attemptPage*200}&include_total=true`,
        method: "GET",
        signal: controller.signal
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setAttempts(data?.items ?? []);
        setAttemptTotal(data?.total ?? 0);
        setAttemptsStatus("idle");
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setAttemptsStatus("error");
        setAttemptsError("Не удалось загрузить результаты.");
      });
    return () => controller.abort();
  }, [selectedId, attemptPage]);


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
  };

  const exportCsv = async () => {
    if (!attempts.length || !selectedId) {
      return;
    }
    const exportItems: AttemptRow[] = [];
    try {
      for (let offset=0; ; offset+=500) {
        const page = await adminApiClient.request<{items: AttemptRow[]}>({path: `/admin/results/olympiads/${selectedId}/attempts?limit=500&offset=${offset}`, method:"GET"});
        exportItems.push(...page.items);
        if (page.items.length < 500) break;
      }
    } catch { setAttemptsError("Не удалось загрузить данные для экспорта."); return; }
    const header = [
      "№",
      "ID попытки",
      "Дата выполнения",
      "Время начала",
      "Время завершения",
      "Длительность (мин)",
      "ID пользователя",
      "Логин пользователя",
      "ФИО пользователя",
      "Пол",
      "Класс",
      "ID региона",
      "Регион",
      "ID школы",
      "Город",
      "Школа",
      "Статус школы",
      "Учителя пользователя",
      "Баллы",
      "Проценты",
      "Диплом"
    ];
    const rows = exportItems.map((item, index) => [
      index + 1,
      item.id,
      formatDateOnly(item.started_at),
      formatTime(item.started_at),
      formatTime(item.completed_at),
      getDurationMinutes(item.started_at, item.completed_at, item.duration_sec) ?? "—",
      item.user_id,
      item.user_login,
      item.user_full_name ?? "—",
      formatGender(item.gender),
      item.class_grade ?? "—",
      item.region_id ?? "—",
      item.region_name ?? "—",
      item.school_id ?? "—",
      item.city ?? "—",
      item.school ?? "—",
      item.school_status ?? "—",
      item.teachers ?? "—",
      `${item.score_total}/${item.score_max}`,
      `${item.percent}%`,
      item.school_status === "selected" || item.school_status === "not_required"
        ? `${API_BASE_URL}/attempts/${item.id}/diploma`
        : "Недоступен"
    ]);
    const csvBody = [header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\r\n");
    const csv = `\ufeff${csvBody}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `results-${selectedId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="admin-section admin-results-page">
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
          Всего попыток: {attemptsStatus === "loading" ? "..." : attemptTotal}
        </p>
      ) : null}

      <div><Button type="button" variant="outline" disabled={attemptPage === 0} onClick={() => setAttemptPage((page) => page-1)}>Назад</Button><span> Страница {attemptPage+1} </span><Button type="button" variant="outline" disabled={(attemptPage+1)*200 >= attemptTotal} onClick={() => setAttemptPage((page) => page+1)}>Вперёд</Button></div>
      {attemptsStatus === "error" && attemptsError ? <div className="admin-alert">{attemptsError}</div> : null}

      {selectedId ? (
        <div className="admin-table-scroll admin-results-scroll admin-directory-table" role="region" aria-label="Таблица результатов">
          <Table>
            <thead>
              <tr>
                <th>№</th>
                <th>ID попытки</th>
                <th>Дата выполнения</th>
                <th>Время начала</th>
                <th>Время завершения</th>
                <th>Длительность попытки</th>
                <th>ID пользователя</th>
                <th>Логин пользователя</th>
                <th>ФИО пользователя</th>
                <th>Пол</th>
                <th>Класс</th>
                <th>ID региона</th>
                <th>Регион</th>
                <th>ID школы</th>
                <th>Город</th>
                <th>Школа</th>
                <th>Статус школы</th>
                <th>Учителя пользователя</th>
                <th>Баллы</th>
                <th>Проценты</th>
                <th>Диплом</th>
              </tr>
            </thead>
            <tbody>
              {attemptsStatus === "loading" ? (
                <tr>
                  <td colSpan={21}>Загрузка...</td>
                </tr>
              ) : attempts.length === 0 ? (
                <tr>
                  <td colSpan={21}>Нет попыток.</td>
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
                    <td>{item.user_id}</td>
                    <td>{item.user_login}</td>
                    <td>{item.user_full_name ?? "—"}</td>
                    <td>{formatGender(item.gender)}</td>
                    <td>{item.class_grade ?? "—"}</td>
                    <td>{item.region_id ?? "—"}</td>
                    <td>{item.region_name ?? "—"}</td>
                    <td>{item.school_id ?? "—"}</td>
                    <td>{item.city ?? "—"}</td>
                    <td>{item.school ?? "—"}</td>
                    <td>{item.school_status ?? "—"}</td>
                    <td>{item.teachers ?? "—"}</td>
                    <td>
                      {item.score_total} / {item.score_max}
                    </td>
                    <td>{item.percent}%</td>
                    <td>
                      {item.school_status === "selected" || item.school_status === "not_required" ? (
                        <a className="admin-link" href={`${API_BASE_URL}/attempts/${item.id}/diploma`} target="_blank" rel="noreferrer">Скачать</a>
                      ) : <span className="admin-hint">Недоступен</span>}
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
