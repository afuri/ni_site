import React, { useState } from "react";
import type { AttemptResult, AttemptView, OlympiadPublic, UserAnnouncement, UserRead } from "@api";
import type { PlatformSection } from "./PlatformShell";
import type { ResourceState } from "./usePlatformOverview";
import { getOlympiadScheduleState, resolveOlympiadAction, type OlympiadAction } from "./olympiadAction";
import type { OlympiadSubject } from "./platformApi";
import type { SchoolNotification } from "./schoolNotifications";
import { PlatformIcon } from "./PlatformIcon";
import { SubjectVisual } from "./SubjectVisual";
import { availableSeasons, resultSeason, seasonLabel, seasonStart } from "./platformSeason";

type Props = {
  section: PlatformSection;
  user: UserRead;
  olympiads: ResourceState<OlympiadPublic[]>;
  results: ResourceState<AttemptResult[]>;
  announcements: ResourceState<UserAnnouncement[]>;
  schoolNotifications: SchoolNotification[];
  activeAttempt: ResourceState<AttemptView | null>;
  nearestOlympiad: OlympiadPublic | null;
  recentResults: AttemptResult[];
  startingOlympiadId: number | null;
  viewingAttemptId: number | null;
  downloadingAttemptId: number | null;
  assigningSubject: OlympiadSubject | null;
  onOlympiadAction: (action: OlympiadAction) => void;
  onContinueAttempt: (attemptId: number) => void;
  onViewAttempt: (result: AttemptResult) => void;
  onDownloadDiploma: (result: AttemptResult) => void;
  onAssignSubject: (subject: OlympiadSubject) => void;
  profileContent: React.ReactNode;
};

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow"
});
const formatDate = (value: string | null) => {
  if (!value) return "Дата не указана";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Дата не указана" : dateFormatter.format(date);
};
const formatDuration = (seconds: number) => {
  const minutes = Math.max(Math.round(seconds / 60), 1);
  return minutes >= 60 && minutes % 60 === 0 ? `${minutes / 60} ч` : `${minutes} мин`;
};

function StateMessage({ state, loading, empty, error }: {
  state: ResourceState<unknown[]>; loading: string; empty: string; error: string;
}) {
  if (state.status === "idle" || state.status === "loading") return <p className="student-resource-state" role="status">{loading}</p>;
  if (state.status === "error") return <p className="student-resource-state is-error" role="alert">{error}</p>;
  return state.data.length === 0 ? <p className="student-resource-state">{empty}</p> : null;
}

function Panel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return <section className={`student-panel ${className}`.trim()}><h2>{title}</h2>{children}</section>;
}

function SubjectStart({ assigning, onAssign }: { assigning: OlympiadSubject | null; onAssign: (subject: OlympiadSubject) => void }) {
  return (
    <div className="student-subject-start">
      <div>
        <h3>Начать новую олимпиаду</h3>
        <p>Выбери предмет и попробуй свои силы.</p>
      </div>
      <div className="student-row-actions">
        <button type="button" className="student-primary-action" disabled={assigning !== null} onClick={() => onAssign("math")}>{assigning === "math" ? "Подбираем…" : "Математика"}</button>
        <button type="button" className="student-secondary-action" disabled={assigning !== null} onClick={() => onAssign("cs")}>{assigning === "cs" ? "Подбираем…" : "Информатика"}</button>
      </div>
    </div>
  );
}

function OlympiadList({ state, results, user, startingId, onAction }: {
  state: ResourceState<OlympiadPublic[]>;
  results: ResourceState<AttemptResult[]>;
  user: UserRead;
  startingId: number | null;
  onAction: (action: OlympiadAction) => void;
}) {
  if (state.status !== "ready" || state.data.length === 0) {
    return <StateMessage state={state} loading="Загружаем олимпиады…" empty="Опубликованных олимпиад пока нет." error="Не удалось загрузить олимпиады. Остальные разделы кабинета доступны." />;
  }
  const labels = { soon: "Скоро", available: "Доступна", finished: "Завершена", "other-grade": "Другой класс" };
  return (
    <div className="student-data-list">
      {state.data.map((olympiad) => {
        const action = resolveOlympiadAction({ olympiad, results: results.data, resultsStatus: results.status, user });
        const schedule = getOlympiadScheduleState(olympiad, user.class_grade);
        const isStarting = startingId === olympiad.id;
        const actionLabel = action.kind === "start" ? "Выбрать предмет" : action.label;
        return (
          <article key={olympiad.id} className="student-data-row student-olympiad-card">
            <div className="student-data-row-main">
              <span className={`student-status-badge is-${schedule}`}>{labels[schedule]}</span>
              <h3>{olympiad.title}</h3>
              <p>{olympiad.description || `Для классов: ${olympiad.age_group}`}</p>
              <div className="student-card-meta"><span>{formatDuration(olympiad.duration_sec)}</span><span>Проходной результат: {olympiad.pass_percent}%</span></div>
            </div>
            <div className="student-card-side">
              <dl>
                <div><dt>Начало</dt><dd>{formatDate(olympiad.available_from)}</dd></div>
                <div><dt>Окончание</dt><dd>{formatDate(olympiad.available_to)}</dd></div>
              </dl>
              <button type="button" className="student-primary-action" disabled={action.kind === "disabled" || isStarting} title={action.kind === "disabled" ? action.reason : undefined} onClick={() => onAction(action)}>
                {isStarting ? "Запускаем…" : actionLabel}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ResultList({ state, items, user, viewingId, downloadingId, onContinue, onView, onDownload, illustrated = false }: {
  state: ResourceState<AttemptResult[]>; items?: AttemptResult[]; user: UserRead;
  viewingId: number | null; downloadingId: number | null;
  onContinue: (id: number) => void; onView: (result: AttemptResult) => void; onDownload: (result: AttemptResult) => void;
  illustrated?: boolean;
}) {
  const visible = items ?? state.data;
  if (state.status !== "ready" || visible.length === 0) {
    return <StateMessage state={{ ...state, data: visible }} loading="Загружаем результаты…" empty="Попыток пока нет." error="Не удалось загрузить результаты. Олимпиады и уведомления можно просматривать независимо." />;
  }
  const diplomaAllowed = user.school_status === "selected" || user.school_status === "not_required";
  return (
    <div className="student-data-list">
      {visible.map((result) => (
        <article key={result.attempt_id} className={`student-data-row student-result-card${illustrated ? " is-illustrated" : ""}`}>
          <div className="student-data-row-main">
            <span className={`student-status-badge is-${result.status}`}>{result.status === "active" ? "В процессе" : result.results_released ? "Результат опубликован" : "Результат готовится"}</span>
            <h3><PlatformIcon name="trophy" />{result.olympiad_title || `Олимпиада №${result.olympiad_id}`}</h3>
            <p>{result.status === "active" ? "Попытка не завершена" : result.results_released ? `${result.percent}% · ${result.score_total} из ${result.score_max}` : "Результат ещё не опубликован"}</p>
            {result.olympiad_available_from ? <time dateTime={result.olympiad_available_from}><PlatformIcon name="calendar" size={16} />{formatDate(result.olympiad_available_from)}</time> : null}
          </div>
          <div className="student-row-actions">
            {result.status === "active" ? (
              <button type="button" className="student-primary-action" onClick={() => onContinue(result.attempt_id)}>Продолжить</button>
            ) : result.results_released ? (
              <>
                <button type="button" className="student-secondary-action" disabled={viewingId === result.attempt_id} onClick={() => onView(result)}>{viewingId === result.attempt_id ? "Загружаем…" : "Посмотреть работу"}</button>
                <button type="button" className="student-primary-action" disabled={!diplomaAllowed || downloadingId === result.attempt_id} title={!diplomaAllowed ? "Школа ещё не подтверждена" : undefined} onClick={() => onDownload(result)}>
                  {downloadingId === result.attempt_id ? "Скачиваем…" : diplomaAllowed ? "Скачать диплом" : "Диплом недоступен"}
                </button>
              </>
            ) : <span className="student-action-hint">Работа и диплом появятся после публикации результата.</span>}
          </div>
          {illustrated ? <SubjectVisual /> : null}
        </article>
      ))}
    </div>
  );
}

function AnnouncementList({ state, limit }: { state: ResourceState<UserAnnouncement[]>; limit?: number }) {
  const visible = limit ? state.data.slice(0, limit) : state.data;
  if (state.status !== "ready" || visible.length === 0) {
    return <StateMessage state={{ ...state, data: visible }} loading="Загружаем уведомления…" empty="Новых уведомлений нет." error="Не удалось загрузить уведомления. Результаты и олимпиады остаются доступны." />;
  }
  return <div className="student-data-list">{visible.map((item) => <article key={`${item.campaign_code}-${item.subject ?? "common"}-${item.group_number ?? "all"}`} className="student-data-row"><div><h3>{item.title}</h3><p>{item.text}</p></div>{item.starts_at ? <time dateTime={item.starts_at}>{formatDate(item.starts_at)}</time> : null}</article>)}</div>;
}

function NotificationList({ state, system }: { state: ResourceState<UserAnnouncement[]>; system: SchoolNotification[] }) {
  const hasAnnouncements = state.status === "ready" && state.data.length > 0;
  const isEmpty = state.status === "ready" && state.data.length === 0 && system.length === 0;

  return (
    <div className="student-data-list">
      {system.map((item) => (
        <article key={item.id} className="student-data-row student-system-notification">
          <div>
            <span className="student-status-badge">Системное</span>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </div>
        </article>
      ))}
      {hasAnnouncements ? state.data.map((item) => (
        <article key={`${item.campaign_code}-${item.subject ?? "common"}-${item.group_number ?? "all"}`} className="student-data-row">
          <div><h3>{item.title}</h3><p>{item.text}</p></div>
          {item.starts_at ? <time dateTime={item.starts_at}>{formatDate(item.starts_at)}</time> : null}
        </article>
      )) : null}
      {state.status === "idle" || state.status === "loading" ? <p className="student-resource-state" role="status">Загружаем объявления…</p> : null}
      {state.status === "error" ? <p className="student-resource-state is-error" role="alert">Не удалось загрузить объявления. Системные уведомления остаются доступны.</p> : null}
      {isEmpty ? <p className="student-resource-state">Новых уведомлений нет.</p> : null}
    </div>
  );
}

function CurrentParticipation({ p }: { p: Props }) {
  const active = p.activeAttempt.data;
  const currentSeason = seasonStart(new Date());
  const latest = p.recentResults.find((result) => resultSeason(result) === currentSeason);
  const loading = p.activeAttempt.status === "loading" || p.activeAttempt.status === "idle";
  const failed = p.activeAttempt.status === "error";
  const title = active?.olympiad_title ?? latest?.olympiad_title ?? "Время новых открытий";
  return <section className="student-now-card" aria-label="Текущее участие">
    <div className="student-now-content">
      <span className="student-now-label">{active ? "Олимпиада началась" : latest ? latest.results_released ? "Результат опубликован" : "Работа отправлена ✓" : "Невский интеграл"}</span>
      <h2>{title}</h2>
      <p className="student-now-subtitle">{active ? "Продолжи с того места, где остановился." : latest ? latest.results_released ? "Твой результат уже в личном кабинете." : "Ответы приняты и сохранены." : "Математика и информатика — твой следующий шаг к открытиям."}</p>
      <div className="student-now-facts">
        {active ? <span><PlatformIcon name="calendar" size={16} />Завершить до {formatDate(active.attempt.deadline_at)} (МСК)</span> : latest ? <span><PlatformIcon name="tasks" size={16} />{latest.results_released ? `${latest.percent}% · ${latest.score_total} из ${latest.score_max}` : "Результаты будут опубликованы позже"}</span> : <span><PlatformIcon name="tasks" size={16} />Задания для твоего класса</span>}
      </div>
      {loading ? <p role="status">Загружаем активную попытку…</p> : failed ? <p role="alert">Не удалось загрузить активную попытку.</p> : active ? <button type="button" className="student-primary-action" onClick={() => p.onContinueAttempt(active.attempt.id)}>Продолжить<PlatformIcon name="arrow" size={18} /></button> : latest?.results_released ? <button type="button" className="student-primary-action" disabled={p.viewingAttemptId === latest.attempt_id} onClick={() => p.onViewAttempt(latest)}>{p.viewingAttemptId === latest.attempt_id ? "Загружаем…" : "Посмотреть работу"}<PlatformIcon name="arrow" size={18} /></button> : null}
      {!active ? <div className="student-hero-subjects"><SubjectStart assigning={p.assigningSubject} onAssign={p.onAssignSubject} /></div> : null}
    </div>
    <SubjectVisual hero />
  </section>;
}

function SeasonResults({ p }: { p: Props }) {
  const [season, setSeason] = useState("all");
  const seasons = availableSeasons(p.results.data);
  const items = p.results.data.filter((result) => season === "all" || (season === "unknown" ? resultSeason(result) === null : resultSeason(result) === Number(season)));
  return <div className="student-results-page">
    <div className="student-season-filter"><PlatformIcon name="calendar" /><label htmlFor="student-result-season">Сезон:</label><select id="student-result-season" value={season} onChange={(event) => setSeason(event.target.value)}><option value="all">Все сезоны</option>{seasons.map((year) => <option key={year} value={year}>{seasonLabel(year)}</option>)}{p.results.data.some((result) => resultSeason(result) === null) ? <option value="unknown">Без даты сезона</option> : null}</select></div>
    <ResultList state={p.results} items={items} user={p.user} viewingId={p.viewingAttemptId} downloadingId={p.downloadingAttemptId} onContinue={p.onContinueAttempt} onView={p.onViewAttempt} onDownload={p.onDownloadDiploma} />
  </div>;
}

export function PlatformContent(props: Props) {
  const p = props;
  const resultsProps = { state: p.results, user: p.user, viewingId: p.viewingAttemptId, downloadingId: p.downloadingAttemptId, onContinue: p.onContinueAttempt, onView: p.onViewAttempt, onDownload: p.onDownloadDiploma };
  if (p.section === "results") return <SeasonResults p={p} />;
  if (p.section === "notifications") return <Panel title="Уведомления"><NotificationList state={p.announcements} system={p.schoolNotifications} /></Panel>;
  if (p.section === "profile") return <>{p.profileContent}</>;
  const nearest: ResourceState<OlympiadPublic[]> = { ...p.olympiads, data: p.nearestOlympiad ? [p.nearestOlympiad] : [] };
  const currentSeason = seasonStart(new Date())!;
  const seasonResults = p.results.data.filter((result) => resultSeason(result) === currentSeason);
  return <div className="student-dashboard">
    {p.schoolNotifications.map((item) => <a className="student-school-alert" href="/platform/profile" key={item.id}><PlatformIcon name="info" /><span><strong>{item.title}</strong>{item.text}</span><PlatformIcon name="arrow" /></a>)}
    <CurrentParticipation p={p} />
    <section className="student-season-section"><header className="student-section-heading"><h2>Мой сезон {seasonLabel(currentSeason)}</h2><a href="/platform/results">Все результаты<PlatformIcon name="arrow" size={17} /></a></header>
      {p.results.status === "ready" && p.results.data.length > 0 && seasonResults.length === 0 ? <p className="student-resource-state">{p.results.data.some((result) => resultSeason(result) === null) ? "Даты сезона для части работ пока недоступны. Все работы можно посмотреть в разделе «Результаты и дипломы»." : "В этом сезоне участий пока нет. Предыдущие работы доступны в разделе «Результаты и дипломы»."}</p> : <ResultList {...resultsProps} items={seasonResults} illustrated />}
    </section>
    {p.nearestOlympiad || p.olympiads.status !== "ready" ? <Panel title="Ближайшая олимпиада"><OlympiadList state={nearest} results={p.results} user={p.user} startingId={p.startingOlympiadId} onAction={p.onOlympiadAction} /></Panel> : null}
    {p.announcements.status !== "ready" || p.announcements.data.length > 0 ? <Panel title="Объявления"><AnnouncementList state={p.announcements} limit={1} /></Panel> : null}
  </div>;
}
