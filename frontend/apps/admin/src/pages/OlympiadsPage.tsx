import React, { useEffect, useState } from "react";
import { Button, Modal, Table, TextInput } from "@ui";
import { adminApiClient } from "../lib/adminClient";
import { useUploadImageUrls } from "../hooks/useUploadImageUrls";
import { formatDate, fromDateTimeLocal, toDateTimeLocal } from "../lib/formatters";
import { AdminIconButton } from "../components/AdminIconButton";
import { openPdfInNewTab, PdfPopupBlockedError, type ApiError } from "@api";

type OlympiadItem = {
  is_standalone?: boolean;
  has_participant_pdf?: boolean;
  archived_at?: string | null;
  rules_locked_at?: string | null;
  can_return_to_draft?: boolean;
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
  isStandalone: boolean;
  title: string;
  description: string;
  classGrades: number[];
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

type OlympiadPreviewTask = {
  task_id: number;
  sort_order: number;
  max_score: number;
  task: {
    id: number;
    title: string;
    content: string;
    task_type: string;
    image_key?: string | null;
    payload: Record<string, unknown>;
  };
};

type TaskSelection = {
  checked: boolean;
  sortOrder: string;
  maxScore: string;
  existing: boolean;
};

type PoolItem = {
  is_trial?: boolean;
  id: number;
  subject: string;
  grade_group: string;
  is_active: boolean;
  created_by_user_id: number;
  created_at: string;
  olympiad_ids: number[];
};

type PoolForm = {
  subject: string;
  isTrial: boolean;
  gradeGroup: string;
  olympiadIds: string;
  activate: boolean;
};

type PdfExportOptions = {
  includeDescription: boolean;
  includeTaskTitle: boolean;
  includeTaskAndAnswerType: boolean;
  includeCorrectAnswer: boolean;
};

const emptyForm: OlympiadForm = {
  isStandalone: false,
  title: "",
  description: "",
  classGrades: [7, 8],
  durationMinutes: "10",
  availableFrom: "",
  availableTo: "",
  passPercent: "60"
};

const CLASS_GRADE_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const SUBJECT_OPTIONS = [
  { value: "math", label: "Математика", gradeGroups: ["1", "2", "3", "4", "5", "6", "7", "8", "3-4", "5-6", "6-7", "7-8", "1-8"] },
  { value: "cs", label: "Информатика", gradeGroups: ["1", "2", "3", "4", "5", "6", "7", "8", "3-4", "5-6", "6-7", "7-8", "1-8"] }
];

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

export function OlympiadsPage() {
  const [showArchive, setShowArchive] = useState(false);
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
  const [draftTarget, setDraftTarget] = useState<OlympiadItem | null>(null);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [resultsStatus, setResultsStatus] = useState<number | null>(null);
  const [taskCatalog, setTaskCatalog] = useState<TaskCatalogItem[]>([]);
  const [taskSelection, setTaskSelection] = useState<Record<number, TaskSelection>>({});
  const [taskCatalogStatus, setTaskCatalogStatus] = useState<"idle" | "loading" | "error">("idle");
  const [taskCatalogError, setTaskCatalogError] = useState<string | null>(null);
  const [taskAttachError, setTaskAttachError] = useState<string | null>(null);
  const [taskFilter, setTaskFilter] = useState("");
  const [randomOrder, setRandomOrder] = useState(false);
  const [pools, setPools] = useState<PoolItem[]>([]);
  const [poolStatus, setPoolStatus] = useState<"idle" | "loading" | "error">("idle");
  const [poolError, setPoolError] = useState<string | null>(null);
  const [poolForm, setPoolForm] = useState<PoolForm>({
    subject: "math",
    isTrial: false,
    gradeGroup: "1",
    olympiadIds: "",
    activate: true
  });
  const [poolFormError, setPoolFormError] = useState<string | null>(null);
  const [poolSaving, setPoolSaving] = useState(false);
  const [poolActionStatus, setPoolActionStatus] = useState<number | null>(null);
  const [poolDeleteTarget, setPoolDeleteTarget] = useState<PoolItem | null>(null);
  const [poolDeleteError, setPoolDeleteError] = useState<string | null>(null);
  const [previewTarget, setPreviewTarget] = useState<OlympiadItem | null>(null);
  const [previewTasks, setPreviewTasks] = useState<OlympiadPreviewTask[]>([]);
  const [previewStatus, setPreviewStatus] = useState<"idle" | "loading" | "error">("idle");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewImageUrls = useUploadImageUrls(previewTarget ? previewTasks.map((item) => item.task.image_key) : []);
  const [pdfTarget, setPdfTarget] = useState<OlympiadItem | null>(null);
  const [participantPdfTarget, setParticipantPdfTarget] = useState<OlympiadItem | null>(null);
  const [participantPdfFile, setParticipantPdfFile] = useState<File | null>(null);
  const [participantPdfError, setParticipantPdfError] = useState<string | null>(null);
  const [participantPdfBusy, setParticipantPdfBusy] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfOptions, setPdfOptions] = useState<PdfExportOptions>({
    includeDescription: false,
    includeTaskTitle: false,
    includeTaskAndAnswerType: false,
    includeCorrectAnswer: false
  });

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

  const formatSubject = (value: string) => {
    const match = SUBJECT_OPTIONS.find((item) => item.value === value);
    return match ? match.label : value;
  };

  const parsePoolIds = (value: string) => {
    const raw = value
      .split(/[,\s]+/g)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item));
    return Array.from(new Set(raw));
  };

  const gradeGroupOptions =
    SUBJECT_OPTIONS.find((item) => item.value === poolForm.subject)?.gradeGroups ?? [];
  const previewTotalScore = previewTasks.reduce(
    (sum, item) => sum + (Number(item.max_score) || 0),
    0
  );

  const loadOlympiads = async () => {
    setStatus("loading");
    setError(null);
    try {
      const data = await adminApiClient.request<OlympiadItem[]>({
        path: `/admin/olympiads?mine=true&archived=${showArchive}`,
        method: "GET"
      });
      setOlympiads(data ?? []);
      setStatus("idle");
    } catch {
      setStatus("error");
      setError("Не удалось загрузить олимпиады.");
    }
  };

  useEffect(() => { void loadOlympiads(); }, [showArchive]);

  const loadPools = async () => {
    if (poolStatus === "loading") {
      return;
    }
    setPoolStatus("loading");
    setPoolError(null);
    try {
      const data = await adminApiClient.request<PoolItem[]>({
        path: "/admin/olympiad-pools",
        method: "GET"
      });
      setPools(data ?? []);
      setPoolStatus("idle");
    } catch {
      setPoolStatus("error");
      setPoolError("Не удалось загрузить пулы олимпиад.");
    }
  };

  const openPreview = async (olympiad: OlympiadItem) => {
    setPreviewTarget(olympiad);
    setPreviewStatus("loading");
    setPreviewError(null);
    setPreviewTasks([]);
    try {
      const data = await adminApiClient.request<OlympiadPreviewTask[]>({
        path: `/admin/olympiads/${olympiad.id}/tasks?with_details=true`,
        method: "GET"
      });
      const sorted = [...(data ?? [])].sort((a, b) => a.sort_order - b.sort_order);
      setPreviewTasks(sorted);
      setPreviewStatus("idle");
    } catch {
      setPreviewStatus("error");
      setPreviewError("Не удалось загрузить задания олимпиады.");
    }
  };

  useEffect(() => {
    void loadOlympiads();
    void loadPools();
  }, []);

  useEffect(() => {
    if (gradeGroupOptions.length === 0) {
      return;
    }
    if (!gradeGroupOptions.includes(poolForm.gradeGroup)) {
      setPoolForm((prev) => ({
        ...prev,
        gradeGroup: gradeGroupOptions[0]
      }));
    }
  }, [gradeGroupOptions, poolForm.gradeGroup]);

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
      isStandalone: Boolean(olympiad.is_standalone),
      title: olympiad.title,
      description: olympiad.description ?? "",
      classGrades: parseAgeGroup(olympiad.age_group),
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
      const pageSize = 200;
      const items: TaskCatalogItem[] = [];
      for (let offset = 0; ; offset += pageSize) {
        const page = await adminApiClient.request<{items: TaskCatalogItem[]}>({
          path: `/admin/tasks?limit=${pageSize}&offset=${offset}`, method: "GET"
        });
        items.push(...(page?.items ?? []));
        if (!page || page.items.length < pageSize) break;
      }
      setTaskCatalog(items);
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
    return unique.filter((grade) => grade >= 0 && grade <= 8).sort((a, b) => a - b);
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
    if (!Number.isFinite(durationMinutes) || durationMinutes < 1 || durationMinutes > 360) {
      setFormError("Укажите длительность от 1 до 360 минут.");
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
        is_standalone: form.isStandalone,
        title: form.title,
        description: form.description,
        age_group: classGrades,
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
    } catch (error) {
      setFormError((error as ApiError).code === "standalone_olympiad_in_pool"
        ? "Общая олимпиада не может входить в пул. Сначала удалите её пул."
        : "Не удалось сохранить олимпиаду.");
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
      await adminApiClient.request({ path: `/admin/olympiads/${deleteTarget.id}/archive`, method: "POST" });
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

  const closeDraftReturn = () => {
    if (draftSaving) return;
    setDraftTarget(null);
    setDraftError(null);
  };

  const handleReturnToDraft = async () => {
    if (!draftTarget || draftSaving) return;
    setDraftSaving(true);
    setDraftError(null);
    try {
      await adminApiClient.request({ path: `/admin/olympiads/${draftTarget.id}/return-to-draft`, method: "POST" });
      setDraftTarget(null);
      await loadOlympiads();
    } catch (error) {
      const code = (error as ApiError)?.code;
      setDraftError(code === "cannot_return_olympiad_to_draft"
        ? "Олимпиаду нельзя вернуть в черновик: она архивирована, входит в пул или имеет попытки/назначения. Обновите список."
        : code === "olympiad_not_found"
          ? "Олимпиада не найдена. Обновите список."
          : "Не удалось вернуть олимпиаду в черновик. Попробуйте ещё раз.");
    } finally {
      setDraftSaving(false);
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

  const openParticipantPdf = (item: OlympiadItem) => {
    setParticipantPdfTarget(item);
    setParticipantPdfFile(null);
    setParticipantPdfError(null);
  };

  const changeParticipantPdf = async (remove = false) => {
    if (!participantPdfTarget || participantPdfBusy) return;
    setParticipantPdfError(null);
    if (!remove && (!participantPdfFile || !participantPdfFile.name.toLowerCase().endsWith(".pdf"))) {
      setParticipantPdfError("Выберите проверенный PDF-файл.");
      return;
    }
    if (!remove && participantPdfFile!.size > 20 * 1024 * 1024) {
      setParticipantPdfError("Размер PDF не должен превышать 20 МБ.");
      return;
    }
    setParticipantPdfBusy(true);
    try {
      const data = new FormData();
      if (!remove) data.append("file", participantPdfFile!);
      await adminApiClient.request<OlympiadItem>({ path: `/admin/olympiads/${participantPdfTarget.id}/participant-pdf`,
        method: remove ? "DELETE" : "PUT", body: remove ? undefined : data, timeoutMs: 120000 });
      setParticipantPdfTarget(null);
      setParticipantPdfFile(null);
      await loadOlympiads();
    } catch (error) {
      setParticipantPdfError((error as ApiError).message || "Не удалось изменить PDF для участника.");
    } finally { setParticipantPdfBusy(false); }
  };

  const downloadParticipantPdf = async () => {
    if (!participantPdfTarget || participantPdfBusy) return;
    setParticipantPdfBusy(true);
    setParticipantPdfError(null);
    try {
      await openPdfInNewTab(() => adminApiClient.request<Blob>({ path: `/admin/olympiads/${participantPdfTarget.id}/participant-pdf`, responseType: "blob", timeoutMs: 120000 }));
    } catch (error) {
      setParticipantPdfError(error instanceof PdfPopupBlockedError
        ? "Разрешите открытие новых вкладок для этого сайта и повторите действие."
        : "Не удалось открыть PDF для проверки.");
    }
    finally { setParticipantPdfBusy(false); }
  };

  const openPdfExport = (item: OlympiadItem) => {
    setPdfTarget(item);
    setPdfError(null);
    setPdfOptions({
      includeDescription: false,
      includeTaskTitle: false,
      includeTaskAndAnswerType: false,
      includeCorrectAnswer: false
    });
  };

  const downloadPdf = async () => {
    if (!pdfTarget || pdfExporting) {
      return;
    }
    setPdfExporting(true);
    setPdfError(null);
    try {
      const query = new URLSearchParams({
        include_description: String(pdfOptions.includeDescription),
        include_task_title: String(pdfOptions.includeTaskTitle),
        include_task_and_answer_type: String(pdfOptions.includeTaskAndAnswerType),
        include_correct_answer: String(pdfOptions.includeCorrectAnswer)
      });
      await openPdfInNewTab(() => adminApiClient.request<Blob>({
        path: `/admin/olympiads/${pdfTarget.id}/pdf?${query.toString()}`,
        responseType: "blob",
        timeoutMs: 120000
      }));
      setPdfTarget(null);
    } catch (error) {
      setPdfError(error instanceof PdfPopupBlockedError
        ? "Разрешите открытие новых вкладок для этого сайта и повторите действие."
        : "Не удалось сформировать PDF.");
    } finally {
      setPdfExporting(false);
    }
  };

  const handlePoolSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPoolFormError(null);
    const olympiadIds = parsePoolIds(poolForm.olympiadIds);
    if (olympiadIds.length !== 4 || new Set(olympiadIds).size !== 4) {
      setPoolFormError("Укажите ровно четыре разных ID олимпиад в порядке вариантов 1–4.");
      return;
    }
    setPoolSaving(true);
    try {
      await adminApiClient.request<PoolItem>({
        path: "/admin/olympiad-pools",
        method: "POST",
        body: {
          subject: poolForm.subject,
          is_trial: poolForm.isTrial,
          grade_group: poolForm.gradeGroup,
          olympiad_ids: olympiadIds,
          activate: poolForm.activate
        }
      });
      setPoolForm((prev) => ({ ...prev, olympiadIds: "" }));
      await loadPools();
      await loadOlympiads();
    } catch {
      setPoolFormError("Не удалось создать пул.");
    } finally {
      setPoolSaving(false);
    }
  };

  const handleCopyPool = async (poolId: number) => {
    setPoolActionStatus(poolId);
    try {
      await adminApiClient.request({ path: `/admin/olympiad-pools/${poolId}/copy`, method: "POST" });
      await loadPools();
      await loadOlympiads();
    } catch { setPoolError("Не удалось создать копию работы."); }
    finally { setPoolActionStatus(null); }
  };

  const handleActivatePool = async (poolId: number) => {
    setPoolActionStatus(poolId);
    try {
      await adminApiClient.request<PoolItem>({
        path: `/admin/olympiad-pools/${poolId}/activate`,
        method: "POST"
      });
      await loadPools();
    } finally {
      setPoolActionStatus(null);
    }
  };

  const closePoolDelete = () => {
    if (poolActionStatus !== null) return;
    setPoolDeleteTarget(null);
    setPoolDeleteError(null);
  };

  const handleDeletePool = async () => {
    if (!poolDeleteTarget || poolActionStatus !== null) return;
    const poolId = poolDeleteTarget.id;
    setPoolActionStatus(poolId);
    setPoolDeleteError(null);
    try {
      await adminApiClient.request({ path: `/admin/olympiad-pools/${poolId}`, method: "DELETE" });
      setPools((current) => current.filter((pool) => pool.id !== poolId));
      setPoolDeleteTarget(null);
      await loadOlympiads();
    } catch (error) {
      const code = (error as ApiError)?.code;
      setPoolDeleteError(code === "olympiad_pool_has_attempts"
        ? "Пул нельзя удалить: в одной из его олимпиад есть начатая, завершённая или истёкшая попытка."
        : code === "olympiad_pool_not_found"
          ? "Пул уже удалён. Обновите страницу."
          : "Не удалось удалить пул. Попробуйте ещё раз.");
    } finally {
      setPoolActionStatus(null);
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
      <label><input type="checkbox" checked={showArchive} onChange={(event) => setShowArchive(event.target.checked)} /> Показать архив</label>
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
                <td>{item.title}{item.is_standalone ? <div className="admin-tag admin-tag-muted">Общая · без пула</div> : null}</td>
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
                    <Button type="button" size="sm" variant="outline" disabled={Boolean(item.rules_locked_at || item.archived_at)} onClick={() => openEdit(item)}>
                      Редактировать
                    </Button>
                    {item.can_return_to_draft ? <AdminIconButton icon="return-draft" label="Вернуть в черновик"
                      disabled={draftSaving || publishStatus === item.id || poolSaving || poolActionStatus !== null}
                      onClick={() => { setDraftTarget(item); setDraftError(null); }} /> : null}
                    <AdminIconButton icon="copy" label="Создать копию" onClick={async () => {
                      try { await adminApiClient.request({ path: `/admin/olympiads/${item.id}/copy`, method: "POST" }); await loadOlympiads(); }
                      catch { setError("Не удалось создать копию олимпиады."); setStatus("error"); }
                    }} />
                    <AdminIconButton icon="preview" label="Предпросмотр" onClick={() => openPreview(item)} />
                    <Button type="button" size="sm" variant="outline" onClick={() => openPdfExport(item)}>
                      PDF
                    </Button>
                    {item.is_standalone ? <Button type="button" size="sm" variant="outline" onClick={() => openParticipantPdf(item)}>
                      PDF для участника{item.has_participant_pdf ? " ✓" : ""}
                    </Button> : null}
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
                    <AdminIconButton icon="archive" label="В архив" disabled={Boolean(item.archived_at)} onClick={() => {
                      setDeleteStatus("idle"); setDeleteTarget(item);
                    }} />
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </Table>

      <div className="admin-section" style={{ marginTop: "24px" }}>
        <div className="admin-toolbar">
          <div>
            <h2>Пулы олимпиад</h2>
            <p className="admin-hint">
              Можно активировать несколько работ. В каждой ровно четыре варианта; ученику назначается ((user_id − 1) % 4) + 1.
            </p>
          </div>
        </div>

        <form className="admin-form" onSubmit={handlePoolSubmit}>
          <div className="admin-form-grid">
            <label className="field">
              <span className="field-label">Предмет</span>
              <select
                className="field-input"
                value={poolForm.subject}
                onChange={(event) =>
                  setPoolForm((prev) => ({ ...prev, subject: event.target.value }))
                }
              >
                {SUBJECT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-label">Класс</span>
              <select
                className="field-input"
                value={poolForm.gradeGroup}
                onChange={(event) =>
                  setPoolForm((prev) => ({ ...prev, gradeGroup: event.target.value }))
                }
              >
                {gradeGroupOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-label">Формат</span>
              <label><input type="checkbox" checked={poolForm.isTrial} onChange={(event) => setPoolForm((prev) => ({ ...prev, isTrial: event.target.checked }))} /> Пробная работа</label>
            </label>

            <TextInput
              label="ID олимпиад"
              value={poolForm.olympiadIds}
              onChange={(event) =>
                setPoolForm((prev) => ({ ...prev, olympiadIds: event.target.value }))
              }
              placeholder="например: 12, 15, 18"
            />

            <label className="field">
              <span className="field-label">Активировать сразу</span>
              <select
                className="field-input"
                value={poolForm.activate ? "true" : "false"}
                onChange={(event) =>
                  setPoolForm((prev) => ({ ...prev, activate: event.target.value === "true" }))
                }
              >
                <option value="true">Да</option>
                <option value="false">Нет</option>
              </select>
            </label>
          </div>
          <div className="admin-toolbar-actions">
            <Button type="submit" isLoading={poolSaving}>
              Создать пул
            </Button>
          </div>
          {poolFormError ? <div className="admin-alert">{poolFormError}</div> : null}
        </form>

        {poolError ? <div className="admin-alert">{poolError}</div> : null}

        <Table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Предмет</th>
              <th>Класс</th>
              <th>Олимпиады</th>
              <th>Статус</th>
              <th>Создан</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {poolStatus === "loading" ? (
              <tr>
                <td colSpan={7}>Загрузка...</td>
              </tr>
            ) : pools.length === 0 ? (
              <tr>
                <td colSpan={7}>Пулы пока не созданы.</td>
              </tr>
            ) : (
              pools.map((pool) => (
                <tr key={pool.id}>
                  <td>{pool.id}</td>
                  <td>{formatSubject(pool.subject)}{pool.is_trial ? " · пробная" : ""}</td>
                  <td>{pool.grade_group}</td>
                  <td>{pool.olympiad_ids.join(", ") || "—"}</td>
                  <td>
                    <span className={`admin-tag ${pool.is_active ? "admin-tag-success" : "admin-tag-muted"}`}>
                      {pool.is_active ? "Активен" : "Неактивен"}
                    </span>
                  </td>
                  <td>{formatDate(pool.created_at)}</td>
                  <td>
                    <div className="admin-table-actions">
                      {!pool.is_active ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleActivatePool(pool.id)}
                          disabled={poolActionStatus !== null}
                        >
                          Активировать
                        </Button>
                      ) : null}
                      <Button type="button" size="sm" variant="outline" onClick={() => handleCopyPool(pool.id)} disabled={poolActionStatus !== null}>Создать копию работы</Button>
                      <Button type="button" size="sm" variant="outline" disabled={poolActionStatus !== null} onClick={() => {
                        setPoolDeleteError(null);
                        setPoolDeleteTarget(pool);
                      }}>Удалить пул</Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </div>

      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        closeOnBackdrop={false}
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
            <div className="field" role="group" aria-label="Классы">
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
            </div>
          </div>
          <label className="admin-class-option">
            <input type="checkbox" checked={form.isStandalone} onChange={(event) => setForm((prev) => ({ ...prev, isStandalone: event.target.checked }))} />
            <span>Общая олимпиада без пула</span>
          </label>
          {form.isStandalone ? <p className="admin-hint">Одинаковая работа для всех выбранных классов. После сохранения загрузите проверенный файл через кнопку «PDF для участника» в списке олимпиад. При изменении состава заданий PDF нужно загрузить заново.</p> : null}
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
            <Button type="button" size="sm" variant="outline" onClick={() => setIsFormOpen(false)}>
              Отмена
            </Button>
            <Button type="button" size="sm" onClick={handleSave} isLoading={isSaving}>
              Сохранить
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={Boolean(participantPdfTarget)} onClose={() => { if (!participantPdfBusy) setParticipantPdfTarget(null); }}
        title={participantPdfTarget ? `PDF для участника: ${participantPdfTarget.title}` : "PDF для участника"} closeOnBackdrop={false}>
        <div className="admin-form">
          <p>Загрузите проверенный PDF без правильных ответов. Участник сможет скачать его до старта в период проведения и во время активной попытки. После завершения или истечения попытки PDF недоступен. Скачивание не запускает попытку.</p>
          <p>Файл: {participantPdfTarget?.has_participant_pdf ? "загружен" : "не загружен"}. Максимальный размер — 20 МБ.</p>
          {participantPdfTarget?.rules_locked_at || participantPdfTarget?.is_published || participantPdfTarget?.archived_at
            ? <p className="admin-hint">Замена и удаление возможны только в редактируемом черновике. Использованную олимпиаду менять нельзя.</p>
            : <label className="field"><span className="field-label">Проверенный PDF</span><input type="file" accept=".pdf,application/pdf"
                disabled={participantPdfBusy} onChange={(event) => setParticipantPdfFile(event.target.files?.[0] ?? null)} /></label>}
          {participantPdfError ? <p role="alert" className="admin-error">{participantPdfError}</p> : null}
          <div className="admin-modal-actions">
            {participantPdfTarget?.has_participant_pdf ? <Button type="button" size="sm" variant="outline" disabled={participantPdfBusy} onClick={downloadParticipantPdf}>Скачать для проверки</Button> : null}
            {!participantPdfTarget?.rules_locked_at && !participantPdfTarget?.is_published && !participantPdfTarget?.archived_at ? <>
              {participantPdfTarget?.has_participant_pdf ? <Button type="button" size="sm" variant="outline" disabled={participantPdfBusy} onClick={() => void changeParticipantPdf(true)}>Удалить PDF</Button> : null}
              <Button type="button" size="sm" disabled={!participantPdfFile || participantPdfBusy} onClick={() => void changeParticipantPdf()}>Загрузить PDF</Button>
            </> : null}
          </div>
        </div>
      </Modal>

      <Modal isOpen={Boolean(draftTarget)} onClose={closeDraftReturn} title="Вернуть олимпиаду в черновик" closeOnBackdrop={false}>
        <p>Вернуть олимпиаду №{draftTarget?.id} «{draftTarget?.title}» в черновик?</p>
        <p>Олимпиада будет снята с публикации, её параметры и задания станут доступны для редактирования. ID и состав заданий сохранятся.</p>
        <p>Действие возможно только вне пула и при отсутствии любых попыток и назначений.</p>
        {draftError ? <p className="admin-error" role="alert">{draftError}</p> : null}
        <div className="admin-modal-actions">
          <Button type="button" variant="outline" onClick={closeDraftReturn} disabled={draftSaving}>Отмена</Button>
          <Button type="button" onClick={() => void handleReturnToDraft()} isLoading={draftSaving}>Вернуть в черновик</Button>
        </div>
      </Modal>

      <Modal isOpen={Boolean(poolDeleteTarget)} onClose={closePoolDelete} title="Удалить пул олимпиад" closeOnBackdrop={false}>
        <p>Удалить пул №{poolDeleteTarget?.id} ({formatSubject(poolDeleteTarget?.subject ?? "")} · класс {poolDeleteTarget?.grade_group})?</p>
        <p>Олимпиады {poolDeleteTarget?.olympiad_ids.join(", ")} и их задания сохранятся. Удаление возможно, только если ни в одной из этих олимпиад нет начатых попыток.</p>
        {poolDeleteError ? <p className="admin-error" role="alert">{poolDeleteError}</p> : null}
        <div className="admin-modal-actions">
          <Button type="button" variant="outline" onClick={closePoolDelete} disabled={poolActionStatus !== null}>Отмена</Button>
          <Button type="button" onClick={() => void handleDeletePool()} isLoading={poolActionStatus !== null}>Удалить пул</Button>
        </div>
      </Modal>

      <Modal isOpen={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="Архивировать олимпиаду">
        <p>Архивировать олимпиаду “{deleteTarget?.title}”?</p>
        {deleteStatus === "error" ? <p className="admin-error">Не удалось архивировать олимпиаду.</p> : null}
        <div className="admin-modal-actions">
          <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
            Отмена
          </Button>
          <Button type="button" onClick={handleDelete} isLoading={deleteStatus === "deleting"}>
            В архив
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(previewTarget)}
        onClose={() => setPreviewTarget(null)}
        title={previewTarget ? `Предпросмотр: ${previewTarget.title}` : "Предпросмотр"}
        className="admin-result-modal"
      >
        {previewStatus === "loading" ? <p>Загрузка...</p> : null}
        {previewError ? <p className="admin-error">{previewError}</p> : null}
        {previewTasks.length === 0 && previewStatus === "idle" ? (
          <p className="admin-hint">В олимпиаде пока нет заданий.</p>
        ) : null}
        {previewTasks.length > 0 ? (
          <div className="admin-attempt">
            <p className="admin-hint">
              Заданий: {previewTasks.length} · Сумма баллов: {previewTotalScore}
            </p>
            <div className="admin-attempt-tasks">
              {previewTasks.map((item, index) => {
                const task = item.task;
                const payload = (task.payload ?? {}) as Record<string, unknown>;
                const imagePosition = payload.image_position === "before" ? "before" : "after";
                const imageUrl = task.image_key ? previewImageUrls[task.image_key] : null;
                const options = Array.isArray(payload.options) ? payload.options : [];
                return (
                  <div className="admin-attempt-task" key={`${item.task_id}-${index}`}>
                    <h4>
                      Задание {index + 1}. {task.title} (Баллы: {item.max_score})
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
                    {task.task_type === "single_choice" ? (
                      <div className="admin-preview-options">
                        {options.map((option) => (
                          <label className="admin-preview-option" key={String((option as any).id)}>
                            <input type="radio" disabled />
                            <span>{String((option as any).text ?? "")}</span>
                          </label>
                        ))}
                      </div>
                    ) : null}
                    {task.task_type === "multi_choice" ? (
                      <div className="admin-preview-options">
                        {options.map((option) => (
                          <label className="admin-preview-option" key={String((option as any).id)}>
                            <input type="checkbox" disabled />
                            <span>{String((option as any).text ?? "")}</span>
                          </label>
                        ))}
                      </div>
                    ) : null}
                    {task.task_type === "short_text" ? (
                      <div className="admin-preview-short">
                        <input className="admin-preview-input" placeholder="Ответ" disabled />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={Boolean(pdfTarget)}
        onClose={() => (pdfExporting ? undefined : setPdfTarget(null))}
        title={pdfTarget ? `PDF: ${pdfTarget.title}` : "PDF"}
      >
        <div className="admin-form">
          <p className="admin-hint">
            В PDF всегда включаются: название олимпиады, допущенные классы, количество заданий,
            максимальные баллы, номер каждого задания, баллы задания, условие и варианты ответа
            (для тестовых типов).
          </p>
          <label className="admin-class-option">
            <input
              type="checkbox"
              checked={pdfOptions.includeDescription}
              onChange={(event) =>
                setPdfOptions((prev) => ({ ...prev, includeDescription: event.target.checked }))
              }
              disabled={pdfExporting}
            />
            <span>Описание олимпиады</span>
          </label>
          <label className="admin-class-option">
            <input
              type="checkbox"
              checked={pdfOptions.includeTaskTitle}
              onChange={(event) =>
                setPdfOptions((prev) => ({ ...prev, includeTaskTitle: event.target.checked }))
              }
              disabled={pdfExporting}
            />
            <span>Название заданий</span>
          </label>
          <label className="admin-class-option">
            <input
              type="checkbox"
              checked={pdfOptions.includeTaskAndAnswerType}
              onChange={(event) =>
                setPdfOptions((prev) => ({ ...prev, includeTaskAndAnswerType: event.target.checked }))
              }
              disabled={pdfExporting}
            />
            <span>Тип задания и тип ответа</span>
          </label>
          <label className="admin-class-option">
            <input
              type="checkbox"
              checked={pdfOptions.includeCorrectAnswer}
              onChange={(event) =>
                setPdfOptions((prev) => ({ ...prev, includeCorrectAnswer: event.target.checked }))
              }
              disabled={pdfExporting}
            />
            <span>Правильный ответ</span>
          </label>
          {pdfError ? <p className="admin-error">{pdfError}</p> : null}
          <div className="admin-modal-actions">
            <Button type="button" variant="outline" onClick={() => setPdfTarget(null)} disabled={pdfExporting}>
              Отмена
            </Button>
            <Button type="button" onClick={downloadPdf} isLoading={pdfExporting}>
              Скачать PDF
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
