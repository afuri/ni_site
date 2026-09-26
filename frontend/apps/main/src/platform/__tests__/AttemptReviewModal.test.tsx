import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AttemptResult, AttemptView } from "@api";
import { AttemptReviewModal } from "../AttemptReviewModal";

const result: AttemptResult = {
  attempt_id: 7,
  olympiad_id: 3,
  olympiad_title: "Проверенная олимпиада",
  status: "submitted",
  score_total: 1,
  score_max: 2,
  percent: 50,
  passed: false,
  graded_at: "2026-09-18T10:00:00Z",
  results_released: true
};

const view: AttemptView = {
  attempt: {
    id: 7,
    olympiad_id: 3,
    user_id: 9,
    started_at: "2026-09-18T09:00:00Z",
    deadline_at: "2026-09-18T10:00:00Z",
    duration_sec: 3600,
    status: "submitted",
    score_total: 1,
    score_max: 2,
    passed: false,
    graded_at: "2026-09-18T10:00:00Z"
  },
  olympiad_title: "Проверенная олимпиада",
  tasks: [{
    task_id: 11,
    title: "Задача",
    content: "Условие",
    task_type: "short_text",
    image_key: null,
    payload: {},
    sort_order: 1,
    max_score: 2,
    current_answer: {
      task_id: 11,
      answer_payload: { text: "Ответ ученика" },
      updated_at: "2026-09-18T09:30:00Z"
    },
    is_correct: true
  }]
};

describe("AttemptReviewModal", () => {
  it("shows the student's answer without per-task correctness", () => {
    render(<AttemptReviewModal view={view} result={result} onClose={vi.fn()} />);

    expect(screen.getByText(/Ответ ученика/)).toBeInTheDocument();
    expect(screen.queryByText("Верно")).not.toBeInTheDocument();
    expect(screen.queryByText("Неверно")).not.toBeInTheDocument();
  });
});
