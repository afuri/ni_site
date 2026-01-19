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

    await userEvent.setup().click(screen.getByRole("button", { name: "Close modal" }));
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
});
