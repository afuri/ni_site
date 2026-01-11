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

export function ReportsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({ userId: "", action: "", statusCode: "" });

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
  }, []);

  return (
    <section className="admin-section">
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
    </section>
  );
}
