import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ApiClient, AttemptResult, AttemptView } from "@api";
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
    render(<AttemptReviewModal client={{ request: vi.fn() } as unknown as ApiClient} view={view} result={result} onClose={vi.fn()} />);

    expect(screen.getByText(/Ответ ученика/)).toBeInTheDocument();
    expect(screen.queryByText("Верно")).not.toBeInTheDocument();
    expect(screen.queryByText("Неверно")).not.toBeInTheDocument();
  });

  it("resolves duplicate image keys once, respects position and caches links on reopen", async () => {
    const request = vi.fn().mockResolvedValue({ url: "https://storage.test/task.png", expires_in: 300 });
    const client = { request } as unknown as ApiClient;
    const withImages = { ...view, tasks: [
      { ...view.tasks[0], image_key: "tasks/image 1.png", payload: { image_position: "before" } },
      { ...view.tasks[0], task_id: 12, title: "Вторая", image_key: "tasks/image 1.png", sort_order: 2 }
    ] };
    const props = { client, result, onClose: vi.fn() };
    const { rerender } = render(<AttemptReviewModal {...props} view={withImages} />);
    const images = await screen.findAllByRole("img");
    expect(images).toHaveLength(2);
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ path: "/uploads/tasks/image%201.png", method: "GET" }));
    expect(images[0].nextElementSibling).toHaveTextContent("Условие");
    expect(images[1].previousElementSibling).toHaveTextContent("Условие");
    expect(images[0]).toHaveAttribute("loading", "lazy");
    rerender(<AttemptReviewModal {...props} view={null} />);
    rerender(<AttemptReviewModal {...props} view={withImages} />);
    expect(await screen.findAllByRole("img")).toHaveLength(2);
    expect(request).toHaveBeenCalledOnce();
  });

  it("handles unavailable links and broken files without hiding the task", async () => {
    const client = { request: vi.fn().mockRejectedValue(new Error("404")) } as unknown as ApiClient;
    const withImage = { ...view, tasks: [{ ...view.tasks[0], image_key: "tasks/missing.png" }] };
    const { rerender } = render(<AttemptReviewModal client={client} view={withImage} result={result} onClose={vi.fn()} />);
    expect(await screen.findByText("Не удалось загрузить изображение задания.")).toBeInTheDocument();
    expect(screen.getByText("Условие")).toBeInTheDocument();
    rerender(<AttemptReviewModal client={client} view={{ ...withImage, tasks: [{ ...view.tasks[0], image_key: "https://storage.test/missing.png" }] }} result={result} onClose={vi.fn()} />);
    fireEvent.error(await screen.findByRole("img"));
    expect(screen.getByText("Не удалось загрузить изображение задания.")).toBeInTheDocument();
  });
});
