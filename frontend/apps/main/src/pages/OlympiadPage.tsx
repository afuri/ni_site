import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, LayoutShell, Modal, TextInput, useAuth } from "@ui";
import { createApiClient } from "@api";
import { createMainAuthStorage } from "../utils/authStorage";
import { renderMarkdown } from "../utils/markdown";
import { useNavigate, useSearchParams } from "react-router-dom";
import logoImage from "../assets/logo2.png";
import instructionImage from "../assets/help.png";
import { getAccountHomePath, LOGIN_REDIRECT_KEY } from "../routes/accountHome";
import "../styles/olympiad.css";
import { AttemptAnswers, type AnswerPayload, type AnswerState } from "../platform/attemptAnswers";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

type AttemptInfo = {
  id: number;
  deadline_at: string;
  started_at?: string | null;
  duration_sec: number;
  status: string;
  answers_revision?: number | null;
};

type AttemptTask = {
  task_id: number;
  title: string;
  content: string;
  task_type: "single_choice" | "multi_choice" | "short_text";
  payload: {
    options?: { id: string; text: string }[];
    image_position?: "before" | "after";
    subtype?: "int" | "float" | "text";
  };
  sort_order: number;
  max_score: number;
  current_answer?: { answer_payload: AnswerPayload };
  image_key?: string | null;
};

type AttemptView = {
  attempt: AttemptInfo;
  server_now?: string;
  olympiad_title: string;
  tasks: AttemptTask[];
};

type AttemptResult = {
  percent: number;
  score_total: number;
  score_max: number;
  results_released?: boolean;
  olympiad_title?: string;
};

const MOCK_S3_STORAGE_KEY = "ni_admin_s3_mock";
const OPEN_LOGIN_STORAGE_KEY = "ni_open_login";

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

const parseServerDateToMs = (value?: string | null): number | null => {
  if (!value) {
    return null;
  }
  let normalized = value.trim().replace(" ", "T");
  // Postgres can return offsets like +00 or +0000; normalize to +00:00.
  normalized = normalized.replace(
    /(T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?)([+-]\d{2})(\d{2})$/,
    "$1$2:$3"
  );
  normalized = normalized.replace(
    /(T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?)([+-]\d{2})$/,
    "$1$2:00"
  );
  const hasTimezone = /(Z|[+-]\d{2}:\d{2})$/i.test(normalized);
  if (hasTimezone) {
    const timestamp = Date.parse(normalized);
    return Number.isNaN(timestamp) ? null : timestamp;
  }
  // Backend stores timestamps in UTC; treat naive strings as UTC too.
  const utcTimestamp = Date.parse(`${normalized}Z`);
  return Number.isNaN(utcTimestamp) ? null : utcTimestamp;
};

export function OlympiadPage() {
  const { user, signOut } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const storage = useMemo(() => createMainAuthStorage(), []);
  const attemptId = searchParams.get("attemptId");
  const attemptIdNumber = attemptId ? Number(attemptId) : null;
  const [attemptView, setAttemptView] = useState<AttemptView | null>(null);
  const [isAuthInvalid, setIsAuthInvalid] = useState(false);
  const authInvalidRef = useRef(false);
  const attemptStatusRef = useRef<AttemptInfo | null>(null);
  const handleAuthError = useCallback(() => {
    if (!authInvalidRef.current) {
      authInvalidRef.current = true;
      setIsAuthInvalid(true);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(OPEN_LOGIN_STORAGE_KEY, "1");
        if (attemptStatusRef.current?.status === "active" && attemptIdNumber) {
          window.localStorage.setItem(
            LOGIN_REDIRECT_KEY,
            `/olympiad?attemptId=${attemptIdNumber}`
          );
        }
      }
      void signOut();
      navigate("/", { replace: true });
    } else {
      setIsAuthInvalid(true);
    }
  }, [attemptIdNumber, navigate, signOut]);
  const client = useMemo(
    () =>
      createApiClient({
        baseUrl: API_BASE_URL,
        storage,
        onAuthError: handleAuthError
      }),
    [storage, handleAuthError]
  );
  const [viewStatus, setViewStatus] = useState<"idle" | "loading" | "error">("idle");
  const [viewError, setViewError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, AnswerPayload | null>>({});
  const [answerState, setAnswerState] = useState<AnswerState>("saved");
  const answerSessionRef = useRef<AttemptAnswers | null>(null);
  const resultLoadRef = useRef<Promise<void> | null>(null);
  const resultLoadedRef = useRef(false);
  const deadlineCheckRef = useRef(false);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [shortTextErrors, setShortTextErrors] = useState<Record<number, string | null>>({});
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [isResyncing, setIsResyncing] = useState(false);
  const [isWarningOpen, setIsWarningOpen] = useState(false);
  const [hasWarned, setHasWarned] = useState(false);
  const [isFinishOpen, setIsFinishOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFinishLocked, setIsFinishLocked] = useState(false);
  const [isDeadlineWarningOpen, setIsDeadlineWarningOpen] = useState(false);
  const [isTimeSyncWarningOpen, setIsTimeSyncWarningOpen] = useState(false);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [isResultOpen, setIsResultOpen] = useState(false);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [savedTaskId, setSavedTaskId] = useState<number | null>(null);
  const saveFeedbackTimer = useRef<number | null>(null);
  const finishLockTimerRef = useRef<number | null>(null);
  const deadlineWarningShown = useRef(false);
  const hadPositiveRemainingRef = useRef(false);
  const serverClockRef = useRef<{ serverMs: number; sampledAt: number } | null>(null);

  const sortedTasks = useMemo(
    () => (attemptView ? [...attemptView.tasks].sort((a, b) => a.sort_order - b.sort_order) : []),
    [attemptView]
  );
  const activeTask = sortedTasks[activeIndex];
  const activeImageUrl = activeTask?.image_key ? imageUrls[activeTask.image_key] : undefined;
  const deadlineWarningLabel = useMemo(() => {
    const deadlineRaw = attemptView?.attempt.deadline_at;
    if (!deadlineRaw) {
      return "";
    }
    const deadlineMs = parseServerDateToMs(deadlineRaw);
    if (deadlineMs === null) {
      return deadlineRaw;
    }
    const deadline = new Date(deadlineMs);
    return deadline.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }, [attemptView]);

  const timeLabel = useMemo(() => {
    if (remainingSeconds === null) {
      return "--:--";
    }
    const minutes = Math.max(Math.floor(remainingSeconds / 60), 0);
    const seconds = Math.max(remainingSeconds % 60, 0);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }, [remainingSeconds]);

  const showResult = useCallback((): Promise<void> => {
    if (resultLoadedRef.current) return Promise.resolve();
    if (resultLoadRef.current) return resultLoadRef.current;
    const pending = client.request<AttemptResult>({ path: `/attempts/${attemptIdNumber}/result`, method: "GET" })
      .then(data => { resultLoadedRef.current = true; setResult(data); setIsResultOpen(true); })
      .finally(() => { resultLoadRef.current = null; });
    resultLoadRef.current = pending;
    return pending;
  }, [attemptIdNumber, client]);

  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      answerSessionRef.current?.persist();
      if (answerState !== "saved" && !result) { event.preventDefault(); event.returnValue = ""; }
    };
    const online = () => answerSessionRef.current?.retry();
    window.addEventListener("beforeunload", leave);
    window.addEventListener("online", online);
    return () => { window.removeEventListener("beforeunload", leave); window.removeEventListener("online", online); };
  }, [answerState, result]);

  useEffect(() => {
    if (!attemptIdNumber || Number.isNaN(attemptIdNumber)) {
      setViewError("Не найден идентификатор попытки.");
      setViewStatus("error");
      return;
    }
    let isMounted = true;
    const loadAttempt = async () => {
      answerSessionRef.current?.dispose();
      answerSessionRef.current = null;
      deadlineCheckRef.current = false;
      resultLoadedRef.current = false;
      setResult(null);
      setViewStatus("loading");
      setViewError(null);
      try {
        const requestedAt = performance.now();
        const data = await client.request<AttemptView>({
          path: `/attempts/${attemptIdNumber}`,
          method: "GET"
        });
        if (!isMounted) {
          return;
        }
        const receivedAt = performance.now();
        const serverMs = parseServerDateToMs(data.server_now);
        serverClockRef.current = serverMs === null ? null : { serverMs: serverMs + (receivedAt - requestedAt) / 2, sampledAt: receivedAt };
        setAttemptView(data);
        const session = new AttemptAnswers({ client, userId: user?.id ?? 0, view: data,
          onAnswers: setAnswers,
          onState: (state, message) => {
            setAnswerState(state);
            setAnswerError(message ?? (state === "conflict" ? "Работа изменена в другой вкладке. Сохранённые ответы загружены; ваш черновик остался на устройстве."
              : state === "offline" ? "Ответы ещё не сохранены на сервере. Черновик остался на устройстве." : null));
          },
          onSaved: taskId => triggerSaveFeedback(taskId),
          onClosed: () => { if (isMounted) void showResult().catch(() => setAnswerError("Не удалось загрузить результат. Обновите страницу.")); }
        });
        answerSessionRef.current = session;
        session.start();
        setActiveIndex(0);
        setViewStatus("idle");
        if (data.attempt.status !== "active") {
          try {
            const resultData = await client.request<AttemptResult>({
              path: `/attempts/${attemptIdNumber}/result`,
              method: "GET"
            });
            if (isMounted) {
              setResult(resultData);
              setIsResultOpen(true);
            }
          } catch {
            if (isMounted) {
              setIsResultOpen(true);
            }
          }
        }
      } catch {
        if (!isMounted) {
          return;
        }
        setViewStatus("error");
        setViewError("Не удалось загрузить олимпиаду.");
      }
    };
    void loadAttempt();
    return () => {
      isMounted = false;
      answerSessionRef.current?.dispose();
    };
  }, [attemptIdNumber, client, user?.id, showResult]);

  useEffect(() => {
    if (!attemptIdNumber || attemptView?.attempt.status !== "active" || isAuthInvalid) return;
    let current = true;
    const syncOnReturn = async () => {
      if (document.hidden) return;
      setIsResyncing(true);
      try {
        const requestedAt = performance.now();
        const data = await client.request<AttemptView>({ path: `/attempts/${attemptIdNumber}`, method: "GET" });
        if (!current) return;
        const receivedAt = performance.now();
        const serverMs = parseServerDateToMs(data.server_now);
        if (serverMs !== null) serverClockRef.current = { serverMs: serverMs + (receivedAt - requestedAt) / 2, sampledAt: receivedAt };
        answerSessionRef.current?.observe(data);
        setAttemptView((previous) => previous?.attempt.id === data.attempt.id ? { ...previous, attempt: data.attempt, server_now: data.server_now } : previous);
        if (data.attempt.status !== "active") {
          if (current) await showResult();
        }
      } catch {
        // The monotonic clock remains usable if this request fails.
      } finally {
        if (current) setIsResyncing(false);
      }
    };
    document.addEventListener("visibilitychange", syncOnReturn);
    return () => { current = false; document.removeEventListener("visibilitychange", syncOnReturn); };
  }, [attemptIdNumber, attemptView?.attempt.status, client, isAuthInvalid]);

  useEffect(() => {
    attemptStatusRef.current = attemptView?.attempt ?? null;
  }, [attemptView]);

  useEffect(() => {
    hadPositiveRemainingRef.current = false;
    setHasWarned(false);
    setRemainingSeconds(null);
    setIsTimeSyncWarningOpen(false);
  }, [attemptView?.attempt.id]);

  useEffect(() => {
    if (!attemptView?.attempt.deadline_at) {
      setRemainingSeconds(null);
      return;
    }
    const deadline = parseServerDateToMs(attemptView.attempt.deadline_at);
    if (deadline === null) {
      setRemainingSeconds(null);
      return;
    }
    const tick = () => {
      const anchor = serverClockRef.current;
      const serverNow = anchor ? anchor.serverMs + performance.now() - anchor.sampledAt : Date.now();
      const remaining = Math.max(Math.ceil((deadline - serverNow) / 1000), 0);
      if (remaining > 0) {
        hadPositiveRemainingRef.current = true;
      }
      setRemainingSeconds(remaining);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [attemptView]);

  useEffect(() => {
    if (!attemptView || deadlineWarningShown.current) {
      return;
    }
    if (attemptView.attempt.status !== "active") {
      return;
    }
    const startedAt = attemptView.attempt.started_at;
    const deadlineAt = attemptView.attempt.deadline_at;
    if (!startedAt || !deadlineAt) {
      return;
    }
    const startedMs = parseServerDateToMs(startedAt);
    const deadlineMs = parseServerDateToMs(deadlineAt);
    if (startedMs === null || deadlineMs === null) {
      return;
    }
    const plannedEndMs = startedMs + attemptView.attempt.duration_sec * 1000;
    if (plannedEndMs > deadlineMs) {
      deadlineWarningShown.current = true;
      setIsDeadlineWarningOpen(true);
    }
  }, [attemptView]);

  useEffect(() => {
    return () => {
      if (saveFeedbackTimer.current) {
        window.clearTimeout(saveFeedbackTimer.current);
      }
      if (finishLockTimerRef.current) {
        window.clearTimeout(finishLockTimerRef.current);
      }
    };
  }, []);

  const triggerSaveFeedback = (taskId: number) => {
    setSavedTaskId(taskId);
    if (saveFeedbackTimer.current) {
      window.clearTimeout(saveFeedbackTimer.current);
    }
    saveFeedbackTimer.current = window.setTimeout(() => {
      setSavedTaskId((prev) => (prev === taskId ? null : prev));
    }, 1200);
  };

  useEffect(() => {
    if (!attemptView) {
      return;
    }
    const missingKeys = attemptView.tasks
      .map((task) => task.image_key)
      .filter((key): key is string => Boolean(key))
      .filter((key) => !imageUrls[key]);
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
            const payload = await client.request<{ url: string; public_url?: string | null }>({
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
      setImageUrls((prev) => {
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
  }, [attemptView, client, imageUrls]);

  useEffect(() => {
    if (remainingSeconds === null || isAuthInvalid || !attemptView || isResyncing) {
      setIsTimeSyncWarningOpen(false);
      return;
    }
    const warningThreshold = Math.min(300, Math.floor(attemptView.attempt.duration_sec / 2));
    if (remainingSeconds <= warningThreshold && remainingSeconds > 0 && !hasWarned) {
      setIsWarningOpen(true);
      setHasWarned(true);
    }
    if (attemptView.attempt.status !== "active") {
      setIsTimeSyncWarningOpen(false);
      return;
    }
    if (remainingSeconds !== 0 || isSubmitting || result) {
      setIsTimeSyncWarningOpen(false);
      return;
    }
    if (document.hidden) return;
    if (hadPositiveRemainingRef.current) {
      if (!deadlineCheckRef.current) {
        deadlineCheckRef.current = true;
        answerSessionRef.current?.persist();
        void client.request<AttemptView>({ path: `/attempts/${attemptIdNumber}`, method: "GET" }).then(data => {
          answerSessionRef.current?.observe(data);
          if (data.attempt.status !== "active") return showResult();
          setAnswerError("Ожидаем подтверждения завершения. Обновите страницу через несколько секунд.");
        }).catch(() => setAnswerError("Время вышло. Нет связи с сервером; результат появится после восстановления связи."));
      }
      return;
    }
    setIsTimeSyncWarningOpen(true);
  }, [remainingSeconds, hasWarned, isSubmitting, result, attemptView, isAuthInvalid, isResyncing]);

  const isAnswered = (taskId: number) => {
    const payload = answers[taskId];
    if (!payload) {
      return false;
    }
    if ("choice_id" in payload) {
      return Boolean(payload.choice_id);
    }
    if ("choice_ids" in payload) {
      return payload.choice_ids.length > 0;
    }
    return payload.text.trim().length > 0;
  };

  const unansweredCount = useMemo(
    () => sortedTasks.filter((task) => !isAnswered(task.task_id)).length,
    [sortedTasks, answers]
  );
  const hasUnanswered = unansweredCount > 0;

  const editingDisabled = isSubmitting || answerState === "conflict" || Boolean(result) || isAuthInvalid || attemptView?.attempt.status !== "active";
  const updateAnswer = (taskId: number, payload: AnswerPayload | null, send = true) => {
    if (editingDisabled) return;
    setAnswers((prev) => ({ ...prev, [taskId]: payload }));
    answerSessionRef.current?.edit(taskId, payload, send);
  };

  const getShortTextError = useCallback(
    (taskId: number, value: string) => {
      const task = sortedTasks.find((item) => item.task_id === taskId);
      if (!task || task.task_type !== "short_text") {
        return null;
      }
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      if (task.payload?.subtype === "int") {
        if (!/^-?\d+$/.test(trimmed)) {
          return "В ответ можно указать только целое число.";
        }
        return null;
      }
      if (task.payload?.subtype === "float") {
        if (!/^-?\d+(?:[.,]\d+)?$/.test(trimmed)) {
          return "В ответ можно указать только целое число или десятичную дробь.";
        }
        return null;
      }
      return null;
    },
    [sortedTasks]
  );

  const setShortTextError = (taskId: number, message: string | null) => {
    setShortTextErrors((prev) => ({ ...prev, [taskId]: message }));
  };

  const saveAnswer = (taskId: number, payload: AnswerPayload | null) => {
    if (!editingDisabled) answerSessionRef.current?.edit(taskId, payload);
  };

  const handleSingleChoice = (taskId: number, choiceId: string) => {
    const payload = { choice_id: choiceId };
    updateAnswer(taskId, payload);
  };

  const handleMultiChoice = (taskId: number, choiceId: string) => {
    const current = answers[taskId];
    const selected = current && "choice_ids" in current ? current.choice_ids : [];
    const next = selected.includes(choiceId)
      ? selected.filter((id) => id !== choiceId)
      : [...selected, choiceId];
    if (next.length === 0) {
      updateAnswer(taskId, null);
      return;
    }
    const payload = { choice_ids: next };
    updateAnswer(taskId, payload);
  };

  const handleShortTextChange = (taskId: number, text: string) => {
    setShortTextError(taskId, getShortTextError(taskId, text));
    updateAnswer(taskId, { text }, false);
  };

  const handleShortTextSave = (taskId: number) => {
    const payload = answers[taskId];
    if (payload && "text" in payload) {
      const trimmed = payload.text.trim();
      const validationError = getShortTextError(taskId, trimmed);
      setShortTextError(taskId, validationError);
      if (validationError) {
        return;
      }
      saveAnswer(taskId, trimmed ? { text: trimmed } : null);
    }
  };

  const handleShortTextBlur = (taskId: number) => {
    const payload = answers[taskId];
    if (payload && "text" in payload) {
      const trimmed = payload.text.trim();
      const validationError = getShortTextError(taskId, trimmed);
      setShortTextError(taskId, validationError);
      if (validationError) {
        return;
      }
      saveAnswer(taskId, trimmed ? { text: trimmed } : null);
    }
  };

  const navigateTo = async (index: number) => {
    if (activeTask?.task_type === "short_text") {
      const payload = answers[activeTask.task_id];
      if (payload && "text" in payload) {
        const trimmed = payload.text.trim();
        const validationError = getShortTextError(activeTask.task_id, trimmed);
        setShortTextError(activeTask.task_id, validationError);
        if (validationError) {
          return;
        }
        saveAnswer(activeTask.task_id, trimmed ? { text: trimmed } : null);
      }
    }
    setActiveIndex(Math.max(0, Math.min(index, sortedTasks.length - 1)));
  };

  const submitAttempt = async () => {
    if (!attemptIdNumber || isAuthInvalid || !attemptView || attemptView.attempt.status !== "active") {
      return;
    }
    setIsSubmitting(true);
    setAnswerError(null);
    try {
      for (const [id, payload] of Object.entries(answers)) {
        if (payload && "text" in payload) {
          const validationError = getShortTextError(Number(id), payload.text);
          if (validationError) {
            setShortTextError(Number(id), validationError);
            setActiveIndex(sortedTasks.findIndex(task => task.task_id === Number(id)));
            setAnswerError("Исправьте ответ на выделенное задание перед завершением.");
            return;
          }
        }
      }
      if (!answerSessionRef.current) throw new Error("answers_not_loaded");
      await answerSessionRef.current.submit();
      await showResult();
    } catch (error) {
      const apiError =
        error && typeof error === "object" && "code" in error
          ? (error as { code?: string })
          : null;
      if (apiError?.code === "attempt_submit_too_early") {
        const seconds = error && typeof error === "object" && "details" in error
          ? Number((error as { details?: { retry_after_seconds?: unknown } }).details?.retry_after_seconds)
          : NaN;
        setAnswerError(
          Number.isFinite(seconds) && seconds > 0
            ? `Попытка только что запущена. Завершение станет доступно через ${Math.ceil(seconds)} сек. Попробуйте позже.`
            : "Попытка только что запущена. Завершение станет доступно через несколько секунд. Попробуйте позже."
        );
      } else if (answerState !== "conflict" && !(error instanceof Error && error.message === "answers_conflict")) {
        setAnswerError("Не удалось завершить олимпиаду. Ответы остаются в черновике; попробуйте снова.");
      }
    } finally {
      setIsSubmitting(false);
      setIsFinishOpen(false);
    }
  };

  const handleFinishConfirm = async () => {
    if (isFinishLocked || isSubmitting) {
      return;
    }
    setIsFinishLocked(true);
    if (finishLockTimerRef.current) {
      window.clearTimeout(finishLockTimerRef.current);
    }
    finishLockTimerRef.current = window.setTimeout(() => {
      setIsFinishLocked(false);
      finishLockTimerRef.current = null;
    }, 3000);
    try {
      await submitAttempt();
    } finally {
      if (finishLockTimerRef.current) {
        window.clearTimeout(finishLockTimerRef.current);
        finishLockTimerRef.current = null;
      }
      setIsFinishLocked(false);
    }
  };


  if (viewStatus === "error") {
    return (
      <LayoutShell
        logo={
          <div className="olympiad-logo">
            <img src={logoImage} alt="Невский интеграл" />
            <span>Олимпиада</span>
          </div>
        }
      >
        <div className="olympiad-empty">
          <p>{viewError ?? "Не удалось открыть олимпиаду."}</p>
          <Button onClick={() => navigate("/")}>На главную</Button>
        </div>
      </LayoutShell>
    );
  }

  if (viewStatus === "loading" || !attemptView) {
    return (
      <LayoutShell
        logo={
          <div className="olympiad-logo">
            <img src={logoImage} alt="Невский интеграл" />
            <span>Олимпиада</span>
          </div>
        }
      >
        <div className="olympiad-empty">Загрузка олимпиады...</div>
      </LayoutShell>
    );
  }

  const isAttemptClosed = attemptView.attempt.status !== "active";

  if (isAttemptClosed) {
    return (
      <LayoutShell
        logo={
          <div className="olympiad-logo">
            <span className="olympiad-title">{attemptView.olympiad_title}</span>
          </div>
        }
        nav={null}
        actions={null}
      >
        <Modal
          isOpen
          onClose={() => navigate(getAccountHomePath(user))}
          title="Олимпиада завершена"
          className="olympiad-result-modal"
        >
          <div className="olympiad-result">
            <div className="olympiad-modal-body">
              {result?.results_released ? (
                <p>
                  Олимпиада завершена. Ваш результат:{" "}
                  <strong>{result ? `${result.percent}%` : "--"}</strong>.
                </p>
              ) : (
                <p>
                  Прохождение «{attemptView.olympiad_title}» завершено. Результаты будут позже в личном
                  кабинете.
                </p>
              )}
            </div>
            {result?.results_released ? (
              <div className="olympiad-modal-body">
                <p>
                  Баллы: {result.score_total} / {result.score_max}
                </p>
              </div>
            ) : null}
            <div className="olympiad-modal-actions olympiad-result-actions">
              <Button onClick={() => navigate(getAccountHomePath(user))}>В личный кабинет</Button>
            </div>
          </div>
        </Modal>
      </LayoutShell>
    );
  }

  return (
    <div className="olympiad-page">
      <LayoutShell
        logo={
          <div className="olympiad-logo">
            <span className="olympiad-title">{attemptView.olympiad_title}</span>
          </div>
        }
        nav={null}
        actions={
            <div className="olympiad-header-actions">
              <Button
                variant="outline"
                onClick={() => {
                  setFullscreenImage(null);
                  setIsHelpOpen((prev) => !prev);
                }}
                className="olympiad-finish-button olympiad-help-button"
              >
                ?
              </Button>
              <div className="olympiad-timer">{timeLabel}</div>
              <div className="olympiad-user">{user?.login ?? "Гость"}</div>
              <Button
                variant="outline"
                onClick={() => setIsFinishOpen(true)}
                className="olympiad-finish-button"
              >
                Завершить
              </Button>
            </div>
        }
      >
        <div className="container olympiad-content">
          <div className="olympiad-task-grid">
            {sortedTasks.map((task, index) => (
              <button
                key={task.task_id}
                type="button"
                className={[
                  "olympiad-task-number",
                  index === activeIndex ? "is-active" : "",
                  isAnswered(task.task_id) ? "is-answered" : ""
                ].join(" ")}
                onClick={() => navigateTo(index)}
              >
                {index + 1}
              </button>
            ))}
          </div>

          <div className="olympiad-task-card">
            <div className="olympiad-task-header">
              <h2>Задание {activeIndex + 1}</h2>
              <span className="olympiad-task-points">Баллы: {activeTask.max_score}</span>
            </div>
            {activeTask.image_key &&
            activeTask.payload.image_position === "before" &&
            activeImageUrl ? (
              <img
                src={activeImageUrl}
                alt="Иллюстрация"
                className="olympiad-task-image"
                onClick={() => setFullscreenImage(activeImageUrl)}
              />
            ) : null}
            <div
              className="olympiad-task-content"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(activeTask.content) }}
            />
            {activeTask.image_key &&
            activeTask.payload.image_position !== "before" &&
            activeImageUrl ? (
              <img
                src={activeImageUrl}
                alt="Иллюстрация"
                className="olympiad-task-image"
                onClick={() => setFullscreenImage(activeImageUrl)}
              />
            ) : null}
          </div>

        <div className="olympiad-answer-bar">
          <div className="olympiad-nav olympiad-nav-left">
            <Button variant="ghost" onClick={() => navigateTo(0)}>
              Начало
            </Button>
            <Button variant="outline" onClick={() => navigateTo(activeIndex - 1)} disabled={activeIndex === 0}>
              &lt;
            </Button>
          </div>
            <div className="olympiad-answer-input">
              {activeTask.task_type === "single_choice" ? (
                <div className="olympiad-options">
                  {activeTask.payload.options?.map((option) => (
                    <label key={option.id} className="olympiad-option">
                      <input
                        type="radio"
                        disabled={editingDisabled}
                        name={`task-${activeTask.task_id}`}
                        checked={
                          answers[activeTask.task_id] !== null &&
                          "choice_id" in (answers[activeTask.task_id] ?? {}) &&
                          (answers[activeTask.task_id] as { choice_id: string }).choice_id === option.id
                        }
                        onChange={() => handleSingleChoice(activeTask.task_id, option.id)}
                      />
                      <span>{option.text}</span>
                    </label>
                  ))}
                </div>
              ) : null}
              {activeTask.task_type === "multi_choice" ? (
                <div className="olympiad-options">
                  {activeTask.payload.options?.map((option) => {
                    const selected =
                      answers[activeTask.task_id] &&
                      "choice_ids" in (answers[activeTask.task_id] ?? {}) &&
                      (answers[activeTask.task_id] as { choice_ids: string[] }).choice_ids.includes(option.id);
                    return (
                      <label key={option.id} className="olympiad-option">
                        <input
                          type="checkbox"
                          disabled={editingDisabled}
                          checked={Boolean(selected)}
                          onChange={() => handleMultiChoice(activeTask.task_id, option.id)}
                        />
                        <span>{option.text}</span>
                      </label>
                    );
                  })}
                </div>
              ) : null}
              {activeTask.task_type === "short_text" ? (
                <div className="olympiad-short-answer">
                  <TextInput
                    label="Ответ"
                    disabled={editingDisabled}
                    name={`answer-${activeTask.task_id}`}
                    placeholder={
                      activeTask.payload?.subtype === "int"
                        ? "только целое число"
                        : activeTask.payload?.subtype === "float"
                          ? "только число"
                          : "ответ"
                    }
                    value={
                      answers[activeTask.task_id] && "text" in (answers[activeTask.task_id] ?? {})
                        ? (answers[activeTask.task_id] as { text: string }).text
                        : ""
                    }
                    onChange={(event) => handleShortTextChange(activeTask.task_id, event.target.value)}
                    onBlur={() => handleShortTextBlur(activeTask.task_id)}
                  />
                  {shortTextErrors[activeTask.task_id] ? (
                    <p className="olympiad-error">{shortTextErrors[activeTask.task_id]}</p>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={editingDisabled}
                    onClick={() => handleShortTextSave(activeTask.task_id)}
                    className={[
                      "olympiad-save-button",
                      savedTaskId === activeTask.task_id ? "is-saved" : ""
                    ].join(" ")}
                  >
                    Сохранить ответ
                  </Button>
                </div>
              ) : null}
              {activeIndex === sortedTasks.length - 1 ? (
                <div className="olympiad-finish-inline">
                  <Button type="button" onClick={() => setIsFinishOpen(true)}>
                    Завершить
                  </Button>
                </div>
              ) : null}
              <p role="status">{answerState === "saved" ? "Ответы сохранены" : answerState === "pending" ? "Ответы ожидают сохранения" : "Есть несохранённые изменения"}</p>
              {answerError ? <p className="olympiad-error">{answerError}</p> : null}
              {answerState === "offline" ? <Button variant="outline" onClick={() => answerSessionRef.current?.retry()}>Повторить сохранение</Button> : null}
              {answerState === "conflict" ? <div>
                <Button variant="outline" onClick={() => answerSessionRef.current?.restoreDraft()}>Восстановить мой черновик</Button>
                <Button variant="outline" onClick={() => answerSessionRef.current?.discardDraft()}>Использовать сохранённые ответы</Button>
              </div> : null}
            </div>

            <div className="olympiad-nav olympiad-nav-right">
              <Button
                variant="outline"
                onClick={() => navigateTo(activeIndex + 1)}
                disabled={activeIndex === sortedTasks.length - 1}
              >
                &gt;
              </Button>
              <Button variant="ghost" onClick={() => navigateTo(sortedTasks.length - 1)}>
                Последняя
              </Button>
            </div>
            <div className="olympiad-nav olympiad-nav-mobile" aria-label="Навигация по заданиям">
              <div className="olympiad-nav-row">
                <Button variant="outline" onClick={() => navigateTo(activeIndex - 1)} disabled={activeIndex === 0}>
                  &lt;
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigateTo(activeIndex + 1)}
                  disabled={activeIndex === sortedTasks.length - 1}
                >
                  &gt;
                </Button>
              </div>
              <div className="olympiad-nav-row">
                <Button variant="ghost" onClick={() => navigateTo(0)}>
                  Начало
                </Button>
                <Button variant="ghost" onClick={() => navigateTo(sortedTasks.length - 1)}>
                  Последняя
                </Button>
              </div>
            </div>
          </div>
        </div>
      </LayoutShell>

      <Modal
        isOpen={isFinishOpen}
        onClose={() => {
          if (isFinishLocked) {
            return;
          }
          setIsFinishOpen(false);
        }}
        title="Завершить олимпиаду"
        className="olympiad-finish-modal"
        closeOnBackdrop={!isFinishLocked}
      >
        <div className="olympiad-modal-body">
          {hasUnanswered ? (
            <p>Вы дали ответы не на все задания. Завершить прохождение олимпиады?</p>
          ) : (
            <p>Вы действительно хотите завершить олимпиаду? Ответы будут отправлены.</p>
          )}
        </div>
        <div className="olympiad-modal-actions olympiad-finish-actions">
          <Button
            onClick={() => void handleFinishConfirm()}
            isLoading={isSubmitting}
            disabled={isFinishLocked || isSubmitting || answerState === "conflict"}
            className="olympiad-finish-danger"
          >
            Завершить
          </Button>
          <Button
            variant="outline"
            onClick={() => setIsFinishOpen(false)}
            disabled={isFinishLocked || isSubmitting || answerState === "conflict"}
            className="olympiad-finish-back"
          >
            Вернуться
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={isDeadlineWarningOpen}
        onClose={() => setIsDeadlineWarningOpen(false)}
        title="Предупреждение"
        className="olympiad-warning-modal"
      >
        <div className="olympiad-modal-body olympiad-warning-body">
          <p>
            Уважаемый участник, окончание олимпиады в {deadlineWarningLabel || "—"}. Ответы, которые
            внесены после {deadlineWarningLabel || "—"} не сохраняются.
          </p>
        </div>
        <div className="olympiad-modal-actions olympiad-warning-actions">
          <Button onClick={() => setIsDeadlineWarningOpen(false)}>Ок</Button>
        </div>
      </Modal>

      <Modal isOpen={isWarningOpen} onClose={() => setIsWarningOpen(false)} title="Проверьте ответы">
        <div className="olympiad-modal-body">
          <p>До окончания олимпиады осталось {timeLabel}. Проверьте ответы перед отправкой.</p>
        </div>
        <div className="olympiad-modal-actions">
          <Button onClick={() => setIsWarningOpen(false)}>Понятно</Button>
        </div>
      </Modal>

      <Modal
        isOpen={isTimeSyncWarningOpen}
        onClose={() => setIsTimeSyncWarningOpen(false)}
        title="Проверьте время на устройстве"
        className="olympiad-warning-modal"
      >
        <div className="olympiad-modal-body olympiad-warning-body">
          <p>
            Таймер не удалось синхронизировать корректно. Проверьте дату и время на устройстве и
            обновите страницу.
          </p>
        </div>
        <div className="olympiad-modal-actions olympiad-warning-actions">
          <Button onClick={() => window.location.reload()}>Обновить страницу</Button>
        </div>
      </Modal>

      <Modal
        isOpen={isResultOpen}
        onClose={() => setIsResultOpen(false)}
        title="Результат"
        className="olympiad-result-modal"
      >
        <div className="olympiad-result">
          <div className="olympiad-modal-body">
            {result?.results_released ? (
              <p>
                Олимпиада завершена. Ваш результат:{" "}
                <strong>{result ? `${result.percent}%` : "--"}</strong>.
              </p>
            ) : (
              <p>
                Прохождение «{attemptView?.olympiad_title ?? "олимпиады"}» завершено. Результаты будут
                позже в личном кабинете.
              </p>
            )}
          </div>
          {result?.results_released ? (
            <div className="olympiad-modal-body">
              <p>
                Баллы: {result.score_total} / {result.score_max}
              </p>
            </div>
          ) : null}
          <div className="olympiad-modal-actions olympiad-result-actions">
            <Button onClick={() => navigate(getAccountHomePath(user))}>В личный кабинет</Button>
          </div>
        </div>
      </Modal>

      {fullscreenImage ? (
        <div className="olympiad-image-overlay" onClick={() => setFullscreenImage(null)}>
          <img src={fullscreenImage} alt="Иллюстрация" />
        </div>
      ) : null}
      {isHelpOpen ? (
        <div className="olympiad-image-overlay" onClick={() => setIsHelpOpen(false)}>
          <img src={instructionImage} alt="Инструкция" />
        </div>
      ) : null}
    </div>
  );
}
