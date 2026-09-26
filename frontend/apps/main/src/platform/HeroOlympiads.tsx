import React, { useEffect, useRef, useState } from "react";
import type { AttemptResult, AttemptView, OlympiadPublic, UserRead } from "@api";
import type { ResourceState } from "./usePlatformOverview";
import { getOlympiadScheduleState, resolveOlympiadAction, type OlympiadAction } from "./olympiadAction";
import { PlatformIcon } from "./PlatformIcon";
import { SubjectVisual } from "./SubjectVisual";

type Props = {
  olympiads: ResourceState<OlympiadPublic[]>;
  results: ResourceState<AttemptResult[]>;
  activeAttempt: ResourceState<AttemptView | null>;
  user: UserRead;
  startingId: number | null;
  onAction: (action: OlympiadAction) => void;
  onRefresh?: () => void;
};

const dates = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow"
});

export function countdown(until: string, now: number): string {
  const seconds = Math.max(0, Math.ceil((Date.parse(until) - now) / 1000));
  const days = Math.floor(seconds / 86400);
  const hh = String(Math.floor(seconds % 86400 / 3600)).padStart(2, "0");
  const mm = String(Math.floor(seconds % 3600 / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return `${days ? `${days} д ` : ""}${hh}:${mm}:${ss}`;
}

export function HeroOlympiads({ olympiads, results, activeAttempt, user, startingId, onAction, onRefresh }: Props) {
  const [now, setNow] = useState(Date.now);
  const [expanded, setExpanded] = useState(false);
  const refreshedBoundaries = useRef(new Set<string>());
  const active = activeAttempt.data?.attempt;
  const deadline = active?.status === "active" ? Date.parse(active.deadline_at) : null;

  useEffect(() => {
    setNow(Date.now());
    if (!olympiads.data.length && deadline === null) return;
    // One shared browser ticker; only this card rerenders. No network polling.
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    const update = () => setNow(Date.now());
    document.addEventListener("visibilitychange", update);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", update); };
  }, [olympiads.data, deadline]);

  useEffect(() => {
    if (!onRefresh) return;
    const boundaries = [
      ...olympiads.data.map((item) => ({ key: `window:${item.id}:${item.available_to}`, at: Date.parse(item.available_to) })),
      ...(deadline !== null ? [{ key: `attempt:${active?.id}:${deadline}`, at: deadline }] : [])
    ];
    let refresh = false;
    for (const boundary of boundaries) {
      if (now > boundary.at && !refreshedBoundaries.current.has(boundary.key)) {
        refreshedBoundaries.current.add(boundary.key);
        refresh = true;
      }
    }
    if (refresh) onRefresh();
  }, [now, olympiads.data, active?.id, deadline, onRefresh]);

  const candidates = olympiads.data.filter((item) => {
    if (!item.is_published) return false;
    const schedule = getOlympiadScheduleState(item, user.class_grade, now);
    if (schedule === "finished" || schedule === "other-grade") return false;
    const attempt = results.data.find((result) => result.olympiad_id === item.id);
    if (attempt && attempt.status !== "active") return false;
    return !(attempt?.attempt_id === active?.id && deadline !== null && now > deadline);
  }).sort((a, b) => Date.parse(a.available_from) - Date.parse(b.available_from) || a.id - b.id);
  // Keep the current work visible even when it would fall outside the first three.
  const activeIndex = candidates.findIndex((item) => item.id === active?.olympiad_id);
  if (activeIndex > 0) candidates.unshift(...candidates.splice(activeIndex, 1));
  const visible = expanded ? candidates : candidates.slice(0, 3);
  const loading = olympiads.status === "idle" || olympiads.status === "loading";
  const failed = olympiads.status === "error";

  return <section className="student-now-card" aria-label="Доступные олимпиады">
    <div className="student-now-content">
      <span className="student-now-label">Невский интеграл</span>
      <h2>Время новых открытий</h2>
      <p className="student-now-subtitle">Математика и информатика — твой следующий шаг к открытиям.</p>
      <div className="student-hero-olympiads">
        {loading ? <p role="status" className="student-hero-empty">Загружаем олимпиады…</p> : failed ? <div className="student-hero-empty"><p role="alert">Не удалось загрузить олимпиады.</p>{onRefresh ? <button type="button" className="student-secondary-action" onClick={onRefresh}>Повторить загрузку</button> : null}</div> : !visible.length ? <p className="student-hero-empty">Олимпиада для вашего класса еще не опубликована</p> : visible.map((item) => {
          const action = resolveOlympiadAction({ olympiad: item, results: results.data, resultsStatus: results.status, user, now });
          const soon = getOlympiadScheduleState(item, user.class_grade, now) === "soon";
          const busy = startingId !== null;
          const checkingActive = action.kind === "continue" && activeAttempt.status !== "ready";
          const label = startingId === item.id ? "Запускаем…" : soon ? countdown(item.available_from, now) : action.label;
          return <article className="student-hero-olympiad" key={item.id}>
            <div className="student-hero-olympiad-info">
              <h3>{item.title}</h3>
              <p><PlatformIcon name="calendar" size={15} /><span>{dates.format(new Date(item.available_from))} — {dates.format(new Date(item.available_to))} (МСК)</span></p>
              <p><PlatformIcon name="tasks" size={15} /><span>Время прохождения: {Math.ceil(item.duration_sec / 60)} мин</span></p>
            </div>
            <button type="button" className="student-primary-action" disabled={soon || action.kind === "disabled" || busy || checkingActive}
              aria-label={soon ? `До начала олимпиады «${item.title}»: ${label}` : `${label}: ${item.title}`}
              title={soon ? "Олимпиада ещё не началась" : action.kind === "disabled" ? action.reason : undefined}
              onClick={() => onAction(action)}>{label}</button>
          </article>;
        })}
        {candidates.length > 3 ? <button type="button" className="student-secondary-action student-hero-more" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? "Скрыть" : "Показать еще"}</button> : null}
      </div>
    </div>
    <SubjectVisual hero />
  </section>;
}
