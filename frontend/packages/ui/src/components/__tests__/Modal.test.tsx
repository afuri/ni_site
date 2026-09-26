import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Modal } from "@ui";
import { describe, expect, it, vi } from "vitest";

describe("Modal", () => {
  it("does not render when closed", () => {
    render(<Modal isOpen={false} onClose={() => {}} title="Modal" />);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders when open and closes via close button", async () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Modal" description="Details">
        <p>Body</p>
      </Modal>
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Details")).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "Закрыть модальное окно" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when backdrop is clicked", async () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Modal">
        <p>Body</p>
      </Modal>
    );

    await userEvent.setup().click(screen.getByRole("presentation"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when backdrop is disabled", async () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Modal" closeOnBackdrop={false}>
        <p>Body</p>
      </Modal>
    );

    await userEvent.setup().click(screen.getByRole("presentation"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("traps keyboard focus and restores it after closing", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <>
        <button type="button">Открыть</button>
        <Modal isOpen={false} onClose={() => {}} title="Modal"><button type="button">Действие</button></Modal>
      </>
    );
    const trigger = screen.getByRole("button", { name: "Открыть" });
    trigger.focus();
    rerender(
      <>
        <button type="button">Открыть</button>
        <Modal isOpen onClose={() => {}} title="Modal"><button type="button">Действие</button></Modal>
      </>
    );

    expect(screen.getByRole("button", { name: "Закрыть модальное окно" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Действие" })).toHaveFocus();

    rerender(<button type="button">Открыть</button>);
    expect(screen.getByRole("button", { name: "Открыть" })).toHaveFocus();
  });

  it("closes with Escape only when backdrop closing is allowed", async () => {
    const onClose = vi.fn();
    const { rerender } = render(<Modal isOpen onClose={onClose} title="Modal" />);
    await userEvent.setup().keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);

    onClose.mockClear();
    rerender(<Modal isOpen onClose={onClose} title="Modal" closeOnBackdrop={false} />);
    await userEvent.setup().keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });
});
