import React, { useEffect, useState } from "react";
import { Button, Table, TextInput } from "@ui";
import { adminApiClient } from "../lib/adminClient";
import { formatDate } from "../lib/formatters";

type AuditLog = {
  id: number;
  user_id: number | null;
  action: string;
  method: string;
  path: string;
  status_code: number;
  ip: string | null;
  user_agent: string | null;
  request_id: string | null;
  created_at: string;
};

type Filters = {
  userId: string;
  action: string;
  statusCode: string;
};

type AttemptsStats = {
  active_attempts: number;
  active_attempts_open: number;
  active_users_open: number;
  updated_at: string;
};

type StartsSeriesPoint = {
  bucket: string;
  started_attempts: number;
};

type StartsSeries = {
  step_minutes: number;
  points: StartsSeriesPoint[];
};

export function ReportsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({ userId: "", action: "", statusCode: "" });
  const [stats, setStats] = useState<AttemptsStats | null>(null);
  const [statsStatus, setStatsStatus] = useState<"idle" | "loading" | "error">("idle");
  const [statsError, setStatsError] = useState<string | null>(null);
  const [series, setSeries] = useState<StartsSeriesPoint[]>([]);
  const [seriesStep, setSeriesStep] = useState<number>(30);
  const [seriesStatus, setSeriesStatus] = useState<"idle" | "loading" | "error">("idle");
  const [seriesError, setSeriesError] = useState<string | null>(null);

  const loadStats = async () => {
    setStatsStatus("loading");
    setStatsError(null);
    try {
      const data = await adminApiClient.request<AttemptsStats>({
        path: "/admin/stats/attempts",
        method: "GET"
      });
      setStats(data ?? null);
      setStatsStatus("idle");
    } catch {
      setStatsStatus("error");
      setStatsError("Не удалось загрузить статистику.");
    }
  };

  const loadSeries = async () => {
    setSeriesStatus("loading");
    setSeriesError(null);
    try {
      const data = await adminApiClient.request<StartsSeries>({
        path: "/admin/stats/attempts/completions",
        method: "GET"
      });
      setSeries(data?.points ?? []);
      setSeriesStep(data?.step_minutes ?? 30);
      setSeriesStatus("idle");
    } catch {
      setSeriesStatus("error");
      setSeriesError("Не удалось загрузить статистику запусков.");
    }
  };

  const loadLogs = async () => {
    setStatus("loading");
    setError(null);
    const params = new URLSearchParams();
    if (filters.userId) params.set("user_id", filters.userId);
    if (filters.action) params.set("action", filters.action);
    if (filters.statusCode) params.set("status_code", filters.statusCode);
    try {
      const data = await adminApiClient.request<AuditLog[]>({
        path: `/admin/audit-logs?${params.toString()}`,
        method: "GET"
      });
      setLogs(data ?? []);
      setStatus("idle");
    } catch {
      setStatus("error");
      setError("Не удалось загрузить журнал.");
    }
  };

  useEffect(() => {
    void loadLogs();
    void loadStats();
    void loadSeries();
  }, []);

  const reloadStats = () => {
    void loadStats();
    void loadSeries();
  };

  const formatRangeLabel = (value: string) => {
    const start = new Date(value);
    if (Number.isNaN(start.getTime())) return value;
    const end = new Date(start.getTime() + seriesStep * 60 * 1000);
    const formatTime = (date: Date) => {
      try {
        return date.toLocaleTimeString("ru-RU", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Moscow"
        });
      } catch {
        return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
      }
    };
    return `${formatTime(start)}–${formatTime(end)}`;
  };

  return (
    <section className="admin-section">
      <div className="admin-toolbar">
        <div>
          <h1>Статистика</h1>
          <p className="admin-hint">Активные попытки и онлайн‑нагрузка олимпиады.</p>
        </div>
        <div className="admin-toolbar-actions">
          <Button
            type="button"
            variant="outline"
            onClick={reloadStats}
            disabled={statsStatus === "loading" || seriesStatus === "loading"}
          >
            Обновить
          </Button>
        </div>
      </div>
      {statsStatus === "error" && statsError ? <div className="admin-alert">{statsError}</div> : null}
      <div className="admin-stats-grid">
        <div className="admin-stat-card">
          <span className="admin-stat-label">Активные попытки</span>
          <strong className="admin-stat-value">{stats?.active_attempts ?? "—"}</strong>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-label">Активные (не истекли)</span>
          <strong className="admin-stat-value">{stats?.active_attempts_open ?? "—"}</strong>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-label">Уникальных пользователей</span>
          <strong className="admin-stat-value">{stats?.active_users_open ?? "—"}</strong>
        </div>
      </div>
      <div className="admin-section" style={{ marginTop: "24px" }}>
        <div className="admin-toolbar">
          <div>
            <h2>Начатые попытки по времени</h2>
            <p className="admin-hint">
              Шаг {seriesStep} минут, с 00:00 по Москве до текущего времени.
            </p>
          </div>
        </div>
        {seriesStatus === "error" && seriesError ? <div className="admin-alert">{seriesError}</div> : null}
        <div className="admin-table-scroll">
          <Table>
            <thead>
              <tr>
                <th>Интервал (МСК)</th>
                <th>Начато попыток</th>
              </tr>
            </thead>
            <tbody>
              {seriesStatus === "loading" ? (
                <tr>
                  <td colSpan={2}>Загрузка статистики...</td>
                </tr>
              ) : series.length === 0 ? (
                <tr>
                  <td colSpan={2}>Нет данных за сегодня.</td>
                </tr>
              ) : (
                series.map((point) => (
                  <tr key={point.bucket}>
                    <td>{formatRangeLabel(point.bucket)}</td>
                    <td>{point.started_attempts}</td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </div>
      </div>
      <div className="admin-section" style={{ marginTop: "24px" }}>
        <div className="admin-toolbar">
          <div>
            <h1>Отчеты и журнал действий</h1>
            <p className="admin-hint">Аудит действий администраторов и модераторов.</p>
          </div>
          <div className="admin-toolbar-actions">
            <Button type="button" variant="outline" onClick={loadLogs}>
              Обновить
            </Button>
            <a
              className="btn btn-outline btn-sm"
              href={`${import.meta.env.VITE_API_BASE_URL ?? "/api/v1"}/admin/audit-logs/export`}
            >
              Скачать CSV
            </a>
          </div>
        </div>
        <div className="admin-report-filters">
          <TextInput
            label="User ID"
            name="userId"
            value={filters.userId}
            onChange={(event) => setFilters((prev) => ({ ...prev, userId: event.target.value }))}
          />
          <TextInput
            label="Действие"
            name="action"
            value={filters.action}
            onChange={(event) => setFilters((prev) => ({ ...prev, action: event.target.value }))}
          />
          <TextInput
            label="Статус"
            name="statusCode"
            value={filters.statusCode}
            onChange={(event) => setFilters((prev) => ({ ...prev, statusCode: event.target.value }))}
          />
        </div>
        <Button type="button" variant="outline" onClick={loadLogs}>
          Применить фильтры
        </Button>
        {status === "error" && error ? <div className="admin-alert">{error}</div> : null}
        <Table>
          <thead>
            <tr>
              <th>ID</th>
              <th>User</th>
              <th>Action</th>
              <th>Path</th>
              <th>Status</th>
              <th>Дата</th>
            </tr>
          </thead>
          <tbody>
            {status === "loading" ? (
              <tr>
                <td colSpan={6}>Загрузка...</td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={6}>Записей не найдено.</td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id}>
                  <td>{log.id}</td>
                  <td>{log.user_id ?? "—"}</td>
                  <td>{log.action}</td>
                  <td>{log.path}</td>
                  <td>{log.status_code}</td>
                  <td>{formatDate(log.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </div>
    </section>
  );
}
