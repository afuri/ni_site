import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, LayoutShell, Modal, TextInput, useAuth } from "@ui";
import { createApiClient } from "@api";
import { createMainAuthStorage } from "../utils/authStorage";
import { renderMarkdown } from "../utils/markdown";
import { useNavigate, useSearchParams } from "react-router-dom";
import logoImage from "../assets/logo2.png";
import instructionImage from "../assets/help.png";
import "../styles/olympiad.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

type AttemptInfo = {
  id: number;
  deadline_at: string;
  started_at?: string | null;
  duration_sec: number;
  status: string;
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

type AnswerPayload =
  | { choice_id: string }
  | { choice_ids: string[] }
  | { text: string };

const MOCK_S3_STORAGE_KEY = "ni_admin_s3_mock";
const OPEN_LOGIN_STORAGE_KEY = "ni_open_login";
const LOGIN_REDIRECT_KEY = "ni_login_redirect";

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
  const { user, signOut, setSession } = useAuth();
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
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [shortTextErrors, setShortTextErrors] = useState<Record<number, string | null>>({});
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
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
  const refreshTimerRef = useRef<number | null>(null);
  const deadlineWarningShown = useRef(false);
  const hadPositiveRemainingRef = useRef(false);

  const sortedTasks = useMemo(
    () => (attemptView ? [...attemptView.tasks].sort((a, b) => a.sort_order - b.sort_order) : []),
    [attemptView]
  );
  const activeTask = sortedTasks[activeIndex];
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

  const initializeAnswers = (view: AttemptView) => {
    const initial: Record<number, AnswerPayload | null> = {};
    view.tasks.forEach((task) => {
      initial[task.task_id] = task.current_answer?.answer_payload ?? null;
    });
    setAnswers(initial);
  };

  useEffect(() => {
    if (!attemptIdNumber || Number.isNaN(attemptIdNumber)) {
      setViewError("Не найден идентификатор попытки.");
      setViewStatus("error");
      return;
    }
    let isMounted = true;
    const loadAttempt = async () => {
      setViewStatus("loading");
      setViewError(null);
      try {
        const data = await client.request<AttemptView>({
          path: `/attempts/${attemptIdNumber}`,
          method: "GET"
        });
        if (!isMounted) {
          return;
        }
        setAttemptView(data);
        initializeAnswers(data);
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
    };
  }, [attemptIdNumber, client]);

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
      const remaining = Math.max(Math.ceil((deadline - Date.now()) / 1000), 0);
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
    if (refreshTimerRef.current) {
      window.clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    if (!attemptView || attemptView.attempt.status !== "active" || isAuthInvalid) {
      return;
    }
    let isMounted = true;
    const refreshTokens = async () => {
      try {
        if (typeof document !== "undefined" && document.hidden) {
          return;
        }
        const refreshed = await client.auth.refresh({ clearOnFail: false });
        if (!isMounted || !refreshed) {
          return;
        }
        setSession(refreshed, user ?? null);
      } catch {
        // ignore refresh errors; 401 will be handled by request flow
      }
    };
    void refreshTokens();
    refreshTimerRef.current = window.setInterval(refreshTokens, 45 * 60 * 1000);
    return () => {
      isMounted = false;
      if (refreshTimerRef.current) {
        window.clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [attemptView, client, isAuthInvalid, setSession, user]);

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
    if (remainingSeconds === null || isAuthInvalid || !attemptView) {
      setIsTimeSyncWarningOpen(false);
      return;
    }
    if (remainingSeconds <= 300 && remainingSeconds > 0 && !hasWarned) {
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
    if (hadPositiveRemainingRef.current) {
      void submitAttempt();
      return;
    }
    setIsTimeSyncWarningOpen(true);
  }, [remainingSeconds, hasWarned, isSubmitting, result, attemptView, isAuthInvalid]);

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

  const updateAnswer = (taskId: number, payload: AnswerPayload | null) => {
    setAnswers((prev) => ({ ...prev, [taskId]: payload }));
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

  const saveAnswer = async (taskId: number, payload: AnswerPayload | null) => {
    if (!payload || isAuthInvalid) {
      return;
    }
    setAnswerError(null);
    try {
      await client.request({
        path: `/attempts/${attemptIdNumber}/answers`,
        method: "POST",
        body: { task_id: taskId, answer_payload: payload }
      });
    } catch {
      setAnswerError("Не удалось сохранить ответ.");
    }
  };

  const handleSingleChoice = (taskId: number, choiceId: string) => {
    const payload = { choice_id: choiceId };
    updateAnswer(taskId, payload);
    void saveAnswer(taskId, payload);
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
    void saveAnswer(taskId, payload);
  };

  const handleShortTextChange = (taskId: number, text: string) => {
    setShortTextError(taskId, getShortTextError(taskId, text));
    updateAnswer(taskId, { text });
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
      if (trimmed) {
        triggerSaveFeedback(taskId);
        void saveAnswer(taskId, { text: trimmed });
      }
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
      if (trimmed) {
        void saveAnswer(taskId, { text: trimmed });
      }
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
        if (trimmed) {
          await saveAnswer(activeTask.task_id, { text: trimmed });
        }
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
      const pending = Object.entries(answers)
        .map(([key, payload]) => ({ taskId: Number(key), payload }))
        .filter((item) => item.payload);
      for (const item of pending) {
        if (item.payload && "text" in item.payload) {
          const trimmed = item.payload.text.trim();
          const validationError = getShortTextError(item.taskId, trimmed);
          setShortTextError(item.taskId, validationError);
          if (validationError) {
            continue;
          }
          if (!trimmed) {
            continue;
          }
          await saveAnswer(item.taskId, { text: trimmed });
          continue;
        }
        await saveAnswer(item.taskId, item.payload);
      }
      await client.request({
        path: `/attempts/${attemptIdNumber}/submit`,
        method: "POST"
      });
      const resultData = await client.request<AttemptResult>({
        path: `/attempts/${attemptIdNumber}/result`,
        method: "GET"
      });
      setResult(resultData);
      setIsResultOpen(true);
    } catch (error) {
      const apiError =
        error && typeof error === "object" && "code" in error
          ? (error as { code?: string })
          : null;
      if (apiError?.code === "attempt_submit_too_early") {
        setIsTimeSyncWarningOpen(true);
        setAnswerError(
          "Попытка только что запущена. Проверьте время на устройстве и обновите страницу."
        );
      } else {
        setAnswerError("Не удалось завершить олимпиаду.");
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
          onClose={() => navigate("/cabinet")}
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
              <Button onClick={() => navigate("/cabinet")}>В личный кабинет</Button>
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
            imageUrls[activeTask.image_key] ? (
              <img
                src={imageUrls[activeTask.image_key]}
                alt="Иллюстрация"
                className="olympiad-task-image"
                onClick={() => setFullscreenImage(imageUrls[activeTask.image_key])}
              />
            ) : null}
            <div
              className="olympiad-task-content"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(activeTask.content) }}
            />
            {activeTask.image_key &&
            activeTask.payload.image_position !== "before" &&
            imageUrls[activeTask.image_key] ? (
              <img
                src={imageUrls[activeTask.image_key]}
                alt="Иллюстрация"
                className="olympiad-task-image"
                onClick={() => setFullscreenImage(imageUrls[activeTask.image_key])}
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
              {answerError ? <p className="olympiad-error">{answerError}</p> : null}
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
            disabled={isFinishLocked}
            className="olympiad-finish-danger"
          >
            Завершить
          </Button>
          <Button
            variant="outline"
            onClick={() => setIsFinishOpen(false)}
            disabled={isFinishLocked}
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

      <Modal isOpen={isWarningOpen} onClose={() => setIsWarningOpen(false)} title="Осталось 5 минут">
        <div className="olympiad-modal-body">
          <p>Осталось 5 минут до окончания олимпиады. Проверьте ответы перед отправкой.</p>
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
            <Button onClick={() => navigate("/cabinet")}>В личный кабинет</Button>
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
