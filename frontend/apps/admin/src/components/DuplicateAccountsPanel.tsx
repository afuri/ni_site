import { useEffect, useState } from "react";
import { Button, Table } from "@ui";
import { adminApiClient } from "../lib/adminClient";
import { formatDate } from "../lib/formatters";

type DuplicateUser = {
  id: number;
  login: string;
  email: string | null;
  surname: string | null;
  name: string | null;
  father_name: string | null;
  class_grade: number | null;
  region_name: string | null;
  school_id: number | null;
  school_short_name: string | null;
  city_name: string | null;
  is_active: boolean;
  is_email_verified: boolean;
  created_at: string;
  attempt_count: number;
};

type DuplicateGroup = { group_id: number; users: DuplicateUser[] };
type DuplicatePage = { total_groups: number; groups: DuplicateGroup[] };

const pageSize = 20;

const csvCell = (value: string | number | null | undefined): string => {
  const raw = String(value ?? "");
  // Prevent user-controlled names and emails from becoming spreadsheet formulas.
  const safe = /^[\s]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

const buildCsv = (groups: DuplicateGroup[]): string => {
  const rows: (string | number | null | undefined)[][] = [[
    "Группа", "ID", "Логин", "Email", "Фамилия", "Имя", "Отчество",
    "Класс", "ID школы", "Школа", "Город", "Регион", "Активен",
    "Email подтверждён", "Попыток", "Дата регистрации"
  ]];
  for (const group of groups) {
    for (const user of group.users) {
      rows.push([
        group.group_id, user.id, user.login, user.email, user.surname, user.name,
        user.father_name, user.class_grade, user.school_id, user.school_short_name,
        user.city_name, user.region_name, user.is_active ? "Да" : "Нет",
        user.is_email_verified ? "Да" : "Нет", user.attempt_count,
        formatDate(user.created_at)
      ]);
    }
  }
  return `\ufeff${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
};

export function DuplicateAccountsPanel() {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [totalGroups, setTotalGroups] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = (pageNumber: number) => adminApiClient.request<DuplicatePage>({
    path: `/admin/user-duplicates?limit=${pageSize}&offset=${(pageNumber - 1) * pageSize}`,
    method: "GET"
  });

  const load = async (pageNumber: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPage(pageNumber);
      setGroups(data.groups);
      setTotalGroups(data.total_groups);
      setPage(pageNumber);
    } catch {
      setError("Не удалось загрузить список возможных дубликатов.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(1); }, []);

  const downloadCsv = async () => {
    setExporting(true);
    setError(null);
    try {
      const allGroups: DuplicateGroup[] = [];
      for (let pageNumber = 1; ; pageNumber += 1) {
        const data = await fetchPage(pageNumber);
        allGroups.push(...data.groups);
        if (data.groups.length < pageSize || pageNumber * pageSize >= data.total_groups) break;
      }
      const blob = new Blob([buildCsv(allGroups)], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "possible_duplicate_students.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Не удалось выгрузить список возможных дубликатов.");
    } finally {
      setExporting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalGroups / pageSize));

  return (
    <section className="admin-section admin-duplicate-panel" aria-label="Возможные дубликаты учеников">
      <div className="admin-toolbar">
        <div>
          <h2>Возможные дубликаты учеников</h2>
          <p className="admin-hint">Совпадают фамилия, имя, отчество и ID школы. Регистр, пробелы и е/ё при сравнении не различаются. Класс показан для проверки, но не участвует в поиске. Совпадение не доказывает, что это один ребёнок.</p>
        </div>
        <div className="admin-toolbar-actions">
          <Button type="button" variant="outline" disabled={loading || exporting} onClick={() => void load(1)}>Обновить список</Button>
          <Button type="button" variant="outline" disabled={loading || exporting} onClick={() => void downloadCsv()}>Скачать CSV</Button>
        </div>
      </div>
      {error ? <p className="admin-error" role="alert">{error}</p> : null}
      <p className="admin-hint">Найдено групп совпадений: {totalGroups}. Страница {page} из {totalPages}.</p>
      <div className="admin-table-scroll admin-table-wide admin-directory-table" role="region" aria-label="Таблица возможных дубликатов">
        <Table>
          <thead><tr>
            <th>Группа</th><th>ID</th><th>Логин</th><th>Email</th><th>Фамилия</th><th>Имя</th>
            <th>Отчество</th><th>Класс</th><th>ID школы</th><th>Школа</th><th>Город</th>
            <th>Регион</th><th>Активен</th><th>Email OK</th><th>Попыток</th><th>Регистрация</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={16}>Загрузка...</td></tr> : groups.length === 0 ? (
              <tr><td colSpan={16}>Совпадения не найдены.</td></tr>
            ) : groups.flatMap((group) => group.users.map((user) => (
              <tr key={user.id} className={user.id === group.group_id ? "admin-duplicate-group-start" : undefined}>
                <td>{group.group_id}</td><td>{user.id}</td><td>{user.login}</td><td>{user.email ?? "—"}</td>
                <td>{user.surname}</td><td>{user.name}</td><td>{user.father_name}</td>
                <td>{user.class_grade ?? "—"}</td><td>{user.school_id}</td><td>{user.school_short_name ?? "—"}</td>
                <td>{user.city_name ?? "—"}</td><td>{user.region_name ?? "—"}</td>
                <td>{user.is_active ? "Да" : "Нет"}</td><td>{user.is_email_verified ? "Да" : "Нет"}</td>
                <td>{user.attempt_count}</td><td>{formatDate(user.created_at)}</td>
              </tr>
            )))}
          </tbody>
        </Table>
      </div>
      <div className="admin-toolbar-actions admin-table-pagination">
        <Button type="button" variant="outline" disabled={loading || page <= 1} onClick={() => void load(1)}>В начало</Button>
        <Button type="button" variant="outline" disabled={loading || page <= 1} onClick={() => void load(page - 1)}>Назад</Button>
        <Button type="button" variant="outline" disabled={loading || page >= totalPages} onClick={() => void load(page + 1)}>Вперёд</Button>
        <Button type="button" variant="outline" disabled={loading || page >= totalPages} onClick={() => void load(totalPages)}>В конец</Button>
      </div>
    </section>
  );
}
