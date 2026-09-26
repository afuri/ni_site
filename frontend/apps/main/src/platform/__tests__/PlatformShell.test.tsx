import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { PlatformShell } from "../PlatformShell";

describe("PlatformShell", () => {
  it("contains only implemented navigation destinations", () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <PlatformShell
          activeSection="home"
          userName="Иван"
          login="student01"
          classGrade={5}
          notificationCount={0}
          onSignOut={vi.fn()}
        >
          <p>Содержимое</p>
        </PlatformShell>
      </MemoryRouter>
    );

    const desktopNavigation = screen.getByRole("navigation", { name: "Разделы кабинета ученика" });
    expect(desktopNavigation).toHaveTextContent("Главная");
    expect(desktopNavigation).not.toHaveTextContent("Олимпиады");
    expect(desktopNavigation).toHaveTextContent("Результаты и дипломы");
    expect(desktopNavigation).toHaveTextContent("Профиль");
    expect(screen.getByRole("navigation", { name: "Основные разделы" })).not.toHaveTextContent("Олимпиады");
    expect(screen.queryByRole("link", { name: "Олимпиады" })).not.toBeInTheDocument();
    expect(desktopNavigation).not.toHaveTextContent(/марафон|трениров|диагност|Integral\+|награ/i);
    expect(screen.queryByText(/demo/i)).not.toBeInTheDocument();
  });
});
