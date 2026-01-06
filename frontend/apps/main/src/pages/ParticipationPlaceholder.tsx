import React from "react";
import { Button, LayoutShell } from "@ui";
import { useNavigate } from "react-router-dom";
import { Countdown } from "../components/Countdown";
import "../styles/placeholder.css";

const TARGET_DATE = "2026-02-02T00:00:00+03:00";

export function ParticipationPlaceholder() {
  const navigate = useNavigate();

  return (
    <div className="placeholder-page">
      <LayoutShell
        logo={<a href="/">НЕВСКИЙ ИНТЕГРАЛ</a>}
        nav={null}
        actions={<Button variant="outline" onClick={() => navigate("/")}>На главную</Button>}
        footer={<div>© 2025 Олимпиада «Невский интеграл»</div>}
      >
        <div className="placeholder-card">
          <h1>Прохождение олимпиады скоро</h1>
          <p>Мы готовим платформу для участия. Старт ближайшей олимпиады:</p>
          <Countdown targetIso={TARGET_DATE} label="До начала" />
        </div>
      </LayoutShell>
    </div>
  );
}
