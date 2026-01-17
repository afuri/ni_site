import React, { useEffect, useState } from "react";
import { Button, Table, TextInput } from "@ui";
import { adminApiClient } from "../lib/adminClient";

type SchoolRead = {
  id: number;
  city: string;
  name: string;
  full_school_name: string | null;
  email: string | null;
  consorcium: number;
  peterson: number;
  sirius: number;
  user_count: number;
};

type SchoolForm = {
  city: string;
  name: string;
  full_school_name: string;
  email: string;
  consorcium: string;
  peterson: string;
  sirius: string;
};

const emptyForm: SchoolForm = {
  city: "",
  name: "",
  full_school_name: "",
  email: "",
  consorcium: "0",
  peterson: "0",
  sirius: "0"
};

export function SchoolsPage() {
  const [form, setForm] = useState<SchoolForm>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [listStatus, setListStatus] = useState<"idle" | "loading" | "error">("idle");
  const [listError, setListError] = useState<string | null>(null);
  const [schools, setSchools] = useState<SchoolRead[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [filters, setFilters] = useState({ city: "", name: "" });

  const loadSchools = async () => {
    setListStatus("loading");
    setListError(null);
    const params = new URLSearchParams();
    if (filters.city.trim()) {
      params.set("city", filters.city.trim());
    }
    if (filters.name.trim()) {
      params.set("name", filters.name.trim());
    }
    params.set("limit", "500");
    try {
      const [data, summary] = await Promise.all([
        adminApiClient.request<SchoolRead[]>({
          path: `/admin/schools?${params.toString()}`,
          method: "GET"
        }),
        adminApiClient.request<{ total_count: number }>({
          path: "/admin/schools/summary",
          method: "GET"
        })
      ]);
      setSchools(data ?? []);
      setTotalCount(summary?.total_count ?? 0);
      setListStatus("idle");
    } catch {
      setListStatus("error");
      setListError("Не удалось загрузить список школ.");
    }
  };

  useEffect(() => {
    void loadSchools();
  }, []);

  const totals = schools.reduce(
    (acc, school) => ({
      consorcium: acc.consorcium + (school.consorcium ?? 0),
      peterson: acc.peterson + (school.peterson ?? 0),
      sirius: acc.sirius + (school.sirius ?? 0),
      user_count: acc.user_count + (school.user_count ?? 0)
    }),
    { consorcium: 0, peterson: 0, sirius: 0, user_count: 0 }
  );

  const filterActive = Boolean(filters.city.trim() || filters.name.trim());

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const trimmed = {
      city: form.city.trim(),
      name: form.name.trim(),
      full_school_name: form.full_school_name.trim(),
      email: form.email.trim()
    };
    if (!trimmed.city || !trimmed.name || !trimmed.full_school_name || !trimmed.email) {
      setFormError("Заполните все поля.");
      return;
    }
    setStatus("saving");
    try {
      await adminApiClient.request<SchoolRead>({
        path: "/admin/schools",
        method: "POST",
        body: {
          ...trimmed,
          consorcium: Number(form.consorcium),
          peterson: Number(form.peterson),
          sirius: Number(form.sirius)
        }
      });
      setForm(emptyForm);
      setStatus("idle");
      await loadSchools();
    } catch {
      setStatus("error");
      setFormError("Не удалось сохранить школу.");
    }
  };

  return (
    <div>
      <h1 className="admin-title">Школы</h1>

      <form className="admin-form" onSubmit={handleSubmit}>
        <div className="admin-form-grid">
          <TextInput
            label="Город"
            name="city"
            value={form.city}
            onChange={(event) => setForm((prev) => ({ ...prev, city: event.target.value }))}
          />
          <TextInput
            label="Название"
            name="name"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
          />
        </div>
        <TextInput
          label="Полное название"
          name="full_school_name"
          value={form.full_school_name}
          onChange={(event) => setForm((prev) => ({ ...prev, full_school_name: event.target.value }))}
        />
        <TextInput
          label="Email"
          name="email"
          value={form.email}
          onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
        />
        <div className="admin-form-grid">
          <label className="field">
            <span className="field-label">Consorcium</span>
            <select
              className="field-input"
              value={form.consorcium}
              onChange={(event) => setForm((prev) => ({ ...prev, consorcium: event.target.value }))}
            >
              <option value="0">0</option>
              <option value="1">1</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Peterson</span>
            <select
              className="field-input"
              value={form.peterson}
              onChange={(event) => setForm((prev) => ({ ...prev, peterson: event.target.value }))}
            >
              <option value="0">0</option>
              <option value="1">1</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Sirius</span>
            <select
              className="field-input"
              value={form.sirius}
              onChange={(event) => setForm((prev) => ({ ...prev, sirius: event.target.value }))}
            >
              <option value="0">0</option>
              <option value="1">1</option>
            </select>
          </label>
        </div>
        {formError ? <div className="admin-error">{formError}</div> : null}
        <div className="admin-form-actions">
          <Button type="submit" isLoading={status === "saving"}>
            Добавить школу
          </Button>
        </div>
      </form>

      <div className="admin-table">
        <div className="admin-table-actions admin-table-actions-stacked">
          <div className="admin-filter-row">
            <TextInput
              label="Город"
              name="filter-city"
              value={filters.city}
              onChange={(event) => setFilters((prev) => ({ ...prev, city: event.target.value }))}
            />
            <TextInput
              label="Школа"
              name="filter-name"
              value={filters.name}
              onChange={(event) => setFilters((prev) => ({ ...prev, name: event.target.value }))}
            />
            <div className="admin-filter-button">
              <Button
                type="button"
                variant="outline"
                onClick={loadSchools}
                isLoading={listStatus === "loading"}
              >
                Обновить
              </Button>
            </div>
          </div>
          <div className="admin-table-meta">
            {filterActive ? (
              <span className="admin-hint">
                выбрано {schools.length} из {totalCount}
              </span>
            ) : null}
            {listError ? <span className="admin-hint admin-hint-error">{listError}</span> : null}
          </div>
        </div>
        <Table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Город</th>
              <th>Название</th>
              <th>Полное название</th>
              <th>Email</th>
              <th>Consorcium</th>
              <th>Peterson</th>
              <th>Sirius</th>
              <th>Пользователи</th>
            </tr>
          </thead>
          <tbody>
            {schools.length === 0 ? (
              <tr>
                <td colSpan={9}>{listStatus === "loading" ? "Загрузка..." : "Нет данных."}</td>
              </tr>
            ) : (
              schools.map((school) => (
                <tr key={school.id}>
                  <td>{school.id}</td>
                  <td>{school.city}</td>
                  <td>{school.name}</td>
                  <td>{school.full_school_name ?? ""}</td>
                  <td>{school.email ?? ""}</td>
                  <td>{school.consorcium}</td>
                  <td>{school.peterson}</td>
                  <td>{school.sirius}</td>
                  <td>{school.user_count ?? 0}</td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr>
              <td />
              <td>ИТОГО</td>
              <td />
              <td />
              <td />
              <td>{totals.consorcium}</td>
              <td>{totals.peterson}</td>
              <td>{totals.sirius}</td>
              <td>{totals.user_count}</td>
            </tr>
          </tfoot>
        </Table>
      </div>
    </div>
  );
}
