import React, { useEffect, useRef, useState } from "react";
import type { AttemptResult, AttemptView, OlympiadPublic, UserRead } from "@api";
import type { ResourceState } from "./usePlatformOverview";
import { ageGroupAllows, getOlympiadScheduleState, resolveOlympiadAction, type OlympiadAction } from "./olympiadAction";
import { useServerTime } from "./useServerTime";
import { PlatformIcon } from "./PlatformIcon";
import { SubjectVisual } from "./SubjectVisual";
import { STUDENT_OLYMPIADS_SECTION_ID } from "../routes/accountHome";

type Props = {
  olympiads: ResourceState<OlympiadPublic[]>;
  results: ResourceState<AttemptResult[]>;
  activeAttempt: ResourceState<AttemptView | null>;
  user: UserRead;
  startingId: number | null;
  onAction: (action: OlympiadAction) => void;
  onRefresh?: () => void;
  downloadingPdfId?: number | null;
  onDownloadPdf?: (olympiadId: number) => void;
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

export function HeroOlympiads({ olympiads, results, activeAttempt, user, startingId, onAction, onRefresh, downloadingPdfId, onDownloadPdf }: Props) {
  const active = activeAttempt.data?.attempt;
  const clock = useServerTime((olympiads.status === "ready" && olympiads.data.length > 0) || active?.status === "active");
  const now = clock.now;
  const [expanded, setExpanded] = useState(false);
  const refreshedBoundaries = useRef(new Set<string>());
  const deadline = active?.status === "active" ? Date.parse(active.deadline_at) : null;

  useEffect(() => {
    if (!onRefresh || now === null) return;
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
    if (!item.is_published || !ageGroupAllows(item.age_group, user.class_grade)) return false;
    if (!Number.isFinite(Date.parse(item.available_from)) || !Number.isFinite(Date.parse(item.available_to))) return false;
    const continuingCommon = item.is_standalone && item.id === active?.olympiad_id && deadline !== null && (now === null || now <= deadline);
    if (now !== null && getOlympiadScheduleState(item, user.class_grade, now) === "finished" && !continuingCommon) return false;
    const attempt = results.data.find((result) => result.olympiad_id === item.id);
    if (attempt && attempt.status !== "active") return false;
    return !(attempt?.attempt_id === active?.id && deadline !== null && now !== null && now > deadline);
  }).sort((a, b) => Date.parse(a.available_from) - Date.parse(b.available_from) || a.id - b.id);
  // Keep the current work visible even when it would fall outside the first three.
  const activeIndex = candidates.findIndex((item) => item.id === active?.olympiad_id);
  if (activeIndex > 0) candidates.unshift(...candidates.splice(activeIndex, 1));
  const visible = expanded ? candidates : candidates.slice(0, 3);
  const loading = olympiads.status === "idle" || olympiads.status === "loading";
  const failed = olympiads.status === "error";
  const matchingPublished = olympiads.data.filter((item) => item.is_published && ageGroupAllows(item.age_group, user.class_grade));
  const completedIds = new Set(results.data.filter((item) => item.status !== "active").map((item) => item.olympiad_id));
  const emptyMessage = matchingPublished.length === 0
    ? "Для вашего класса пока нет опубликованных олимпиад."
    : results.status === "ready" && matchingPublished.every((item) => completedIds.has(item.id))
      ? "Вы прошли все доступные олимпиады."
      : "Сейчас нет открытых олимпиад для вашего класса.";

  return <section id={STUDENT_OLYMPIADS_SECTION_ID} className="student-now-card" aria-label="Доступные олимпиады" tabIndex={-1}>
    <div className="student-now-content">
      <span className="student-now-label">Невский интеграл</span>
      <h2>Время новых открытий</h2>
      <p className="student-now-subtitle">Математика и информатика — твой следующий шаг к открытиям.</p>
      <div className="student-hero-olympiads">
        {!loading && !failed && candidates.length > 0 && clock.status === "error" ? <div className="student-hero-empty">
          <p role="alert">Не удалось проверить время. Повторите проверку.</p>
          <button type="button" className="student-secondary-action" disabled={clock.retryAfterSeconds > 0}
            onClick={() => void clock.retry()}>{clock.retryAfterSeconds > 0 ? `Повторить через ${clock.retryAfterSeconds} с` : "Проверить время"}</button>
        </div> : null}
        {loading ? <p role="status" className="student-hero-empty">Загружаем олимпиады…</p> : failed ? <div className="student-hero-empty"><p role="alert">Не удалось загрузить олимпиады.</p>{onRefresh ? <button type="button" className="student-secondary-action" onClick={onRefresh}>Повторить загрузку</button> : null}</div> : !visible.length ? <div className="student-hero-empty"><p>{emptyMessage}</p>{results.status === "ready" && completedIds.size > 0 ? <a href="/platform/results">Посмотреть свои результаты</a> : null}</div> : visible.map((item) => {
          const action: OlympiadAction = now === null
            ? { kind: "disabled", label: "Проверяем время…", reason: "Дождитесь проверки времени." }
            : resolveOlympiadAction({ olympiad: item, results: results.data, resultsStatus: results.status, user, now });
          const soon = now !== null && getOlympiadScheduleState(item, user.class_grade, now) === "soon";
          const busy = startingId !== null;
          const checkingActive = action.kind === "continue" && activeAttempt.status !== "ready";
          const label = startingId === item.id ? "Запускаем…" : soon ? countdown(item.available_from, now) : action.label;
          const pdfAvailable = now !== null && item.is_standalone && item.has_participant_pdf && onDownloadPdf
            && (getOlympiadScheduleState(item, user.class_grade, now) === "available"
                || (item.id === active?.olympiad_id && deadline !== null && now <= deadline));
          return <article className="student-hero-olympiad" key={item.id}>
            <div className="student-hero-olympiad-info">
              <h3>{item.title}</h3>
              {item.is_standalone && item.description ? <p className="student-hero-olympiad-description">{item.description}</p> : null}
              <p><PlatformIcon name="calendar" size={15} /><span>{dates.format(new Date(item.available_from))} — {dates.format(new Date(item.available_to))} (МСК)</span></p>
              <p><PlatformIcon name="tasks" size={15} /><span>Время прохождения: {Math.ceil(item.duration_sec / 60)} мин</span></p>
            </div>
            <div className="student-hero-olympiad-actions">
              <button type="button" className="student-primary-action" disabled={soon || action.kind === "disabled" || busy || checkingActive}
                aria-label={soon ? `До начала олимпиады «${item.title}»: ${label}` : `${label}: ${item.title}`}
                title={soon ? "Олимпиада ещё не началась" : action.kind === "disabled" ? action.reason : undefined}
                onClick={() => onAction(action)}>{label}</button>
              {pdfAvailable ? <button type="button" className="student-secondary-action" disabled={downloadingPdfId != null || !user.is_email_verified}
                aria-label={`Скачать PDF: ${item.title}`} onClick={() => onDownloadPdf?.(item.id)}>
                {downloadingPdfId === item.id ? "Открываем…" : "Скачать PDF"}</button> : null}
            </div>
          </article>;
        })}
        {candidates.length > 3 ? <button type="button" className="student-secondary-action student-hero-more" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? "Скрыть" : "Показать еще"}</button> : null}
      </div>
    </div>
    <SubjectVisual hero />
  </section>;
}
