import React from "react";
import type { AttemptResult, AttemptTask, AttemptView } from "@api";
import { Button, Modal } from "@ui";

const answerText = (task: AttemptTask) => {
  const answer = task.current_answer?.answer_payload;
  if (!answer) return "Ответ не дан";
  if (typeof answer.text === "string") return answer.text || "Ответ не дан";
  const options = Array.isArray(task.payload.options)
    ? task.payload.options.filter((item): item is { id: string; text: string } => (
        Boolean(item) && typeof item === "object" && typeof item.id === "string" && typeof item.text === "string"
      ))
    : [];
  const selectedIds = typeof answer.choice_id === "string"
    ? [answer.choice_id]
    : Array.isArray(answer.choice_ids)
      ? answer.choice_ids.filter((item): item is string => typeof item === "string")
      : [];
  if (selectedIds.length === 0) return "Ответ не дан";
  return selectedIds.map((id) => options.find((option) => option.id === id)?.text ?? id).join(", ");
};

export function AttemptReviewModal({ view, result, onClose }: {
  view: AttemptView | null;
  result: AttemptResult | null;
  onClose: () => void;
}) {
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
          <div className="student-review-tasks">
            {[...view.tasks].sort((a, b) => a.sort_order - b.sort_order).map((task, index) => (
              <article key={task.task_id} className="student-review-task">
                <div className="student-review-task-heading"><h3>{index + 1}. {task.title}</h3></div>
                <p className="student-review-content">{task.content}</p>
                <p className="student-review-answer"><span>Ваш ответ:</span> {answerText(task)}</p>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
