import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, LayoutShell, Modal, TextInput, useAuth } from "@ui";
import { createApiClient } from "@api";
import { createAuthStorage } from "@utils";
import { useNavigate, useSearchParams } from "react-router-dom";
import logoImage from "../assets/logo2.png";
import instructionImage from "../assets/help.png";
import "../styles/olympiad.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

type AttemptInfo = {
  id: number;
  deadline_at: string;
  duration_sec: number;
  status: string;
};

type AttemptTask = {
  task_id: number;
  title: string;
  content: string;
  task_type: "single_choice" | "multi_choice" | "short_text";
  payload: { options?: { id: string; text: string }[]; image_position?: "before" | "after" };
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

export function OlympiadPage() {
  const { status, user, signOut } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const storage = useMemo(
    () =>
      createAuthStorage({
        tokensKey: "ni_main_tokens",
        userKey: "ni_main_user"
      }),
    []
  );
  const client = useMemo(
    () =>
      createApiClient({
        baseUrl: API_BASE_URL,
        storage,
        onAuthError: signOut
      }),
    [storage, signOut]
  );

  const attemptId = searchParams.get("attemptId");
  const attemptIdNumber = attemptId ? Number(attemptId) : null;
  const [attemptView, setAttemptView] = useState<AttemptView | null>(null);
  const [viewStatus, setViewStatus] = useState<"idle" | "loading" | "error">("idle");
  const [viewError, setViewError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, AnswerPayload | null>>({});
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [isWarningOpen, setIsWarningOpen] = useState(false);
  const [hasWarned, setHasWarned] = useState(false);
  const [isFinishOpen, setIsFinishOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [isResultOpen, setIsResultOpen] = useState(false);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [savedTaskId, setSavedTaskId] = useState<number | null>(null);
  const saveFeedbackTimer = useRef<number | null>(null);

  const sortedTasks = useMemo(
    () => (attemptView ? [...attemptView.tasks].sort((a, b) => a.sort_order - b.sort_order) : []),
    [attemptView]
  );
  const activeTask = sortedTasks[activeIndex];

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
    if (!attemptView?.attempt.deadline_at) {
      return;
    }
    const deadline = new Date(attemptView.attempt.deadline_at).getTime();
    if (Number.isNaN(deadline)) {
      return;
    }
    const tick = () => {
      const remaining = Math.max(Math.ceil((deadline - Date.now()) / 1000), 0);
      setRemainingSeconds(remaining);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [attemptView]);

  useEffect(() => {
    return () => {
      if (saveFeedbackTimer.current) {
        window.clearTimeout(saveFeedbackTimer.current);
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
    if (remainingSeconds === null) {
      return;
    }
    if (remainingSeconds <= 300 && remainingSeconds > 0 && !hasWarned) {
      setIsWarningOpen(true);
      setHasWarned(true);
    }
    if (remainingSeconds === 0 && !isSubmitting && !result) {
      void submitAttempt();
    }
  }, [remainingSeconds, hasWarned, isSubmitting, result]);

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

  const saveAnswer = async (taskId: number, payload: AnswerPayload | null) => {
    if (!payload) {
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
    updateAnswer(taskId, { text });
  };

  const handleShortTextSave = (taskId: number) => {
    const payload = answers[taskId];
    if (payload && "text" in payload) {
      const trimmed = payload.text.trim();
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
        if (trimmed) {
          await saveAnswer(activeTask.task_id, { text: trimmed });
        }
      }
    }
    setActiveIndex(Math.max(0, Math.min(index, sortedTasks.length - 1)));
  };

  const submitAttempt = async () => {
    if (!attemptIdNumber) {
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
    } catch {
      setAnswerError("Не удалось завершить олимпиаду.");
    } finally {
      setIsSubmitting(false);
      setIsFinishOpen(false);
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
            <div className="olympiad-task-content">{activeTask.content}</div>
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
                    value={
                      answers[activeTask.task_id] && "text" in (answers[activeTask.task_id] ?? {})
                        ? (answers[activeTask.task_id] as { text: string }).text
                        : ""
                    }
                    onChange={(event) => handleShortTextChange(activeTask.task_id, event.target.value)}
                    onBlur={() => handleShortTextBlur(activeTask.task_id)}
                  />
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
        onClose={() => setIsFinishOpen(false)}
        title="Завершить олимпиаду"
        className="olympiad-finish-modal"
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
            onClick={() => void submitAttempt()}
            isLoading={isSubmitting}
            className="olympiad-finish-danger"
          >
            Завершить
          </Button>
          <Button
            variant="outline"
            onClick={() => setIsFinishOpen(false)}
            className="olympiad-finish-back"
          >
            Вернуться
          </Button>
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
