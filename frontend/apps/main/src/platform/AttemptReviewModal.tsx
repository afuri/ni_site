import React, { useState } from "react";
import type { ApiClient, AttemptResult, AttemptTask, AttemptView } from "@api";
import { Button, Modal } from "@ui";
import { useTaskImages } from "./useTaskImages";
import { attemptAnswerLabels, formatAttemptElapsed } from "./attemptReview";

const answerText = (task: AttemptTask) => {
  return attemptAnswerLabels(task.current_answer?.answer_payload, task.payload.options).join(", ") || "Ответ не дан";
};

function TaskImage({ url, title }: { url: string; title: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? <p className="student-review-image-state">Не удалось загрузить изображение задания.</p>
    : <img className="student-review-image" src={url} alt={`Иллюстрация к заданию «${title}»`} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

export function AttemptReviewModal({ client, view, result, onClose }: {
  client: ApiClient;
  view: AttemptView | null;
  result: AttemptResult | null;
  onClose: () => void;
}) {
  const images = useTaskImages(client, view && result ? view : null);
  const imageFor = (task: AttemptTask) => {
    if (!task.image_key) return null;
    const state = images[task.image_key];
    return state?.status === "ready" && state.url ? <TaskImage key={`${task.image_key}:${state.url}`} url={state.url} title={task.title} />
      : <p className="student-review-image-state">{state?.status === "error" ? "Не удалось загрузить изображение задания." : "Загружаем изображение…"}</p>;
  };
  return (
    <Modal
      isOpen={Boolean(view && result)}
      onClose={onClose}
      title={view?.olympiad_title ?? "Просмотр работы"}
      className="student-review-modal"
      footer={<Button onClick={onClose}>Закрыть</Button>}
    >
      {view && result ? (
        <div className="student-review">
          <p className="student-review-total">Результат: <strong>{result.percent}% · {result.score_total} из {result.score_max}</strong></p>
          <p className="student-review-total">Время прохождения: {formatAttemptElapsed(view.attempt)}</p>
          <div className="student-review-tasks">
            {[...view.tasks].sort((a, b) => a.sort_order - b.sort_order).map((task, index) => (
              <article key={task.task_id} className="student-review-task">
                <div className="student-review-task-heading"><h3>{index + 1}. {task.title}</h3></div>
                {task.payload.image_position === "before" ? imageFor(task) : null}
                <p className="student-review-content">{task.content}</p>
                {task.payload.image_position !== "before" ? imageFor(task) : null}
                <p className="student-review-answer"><span>Ваш ответ:</span> {answerText(task)}</p>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
