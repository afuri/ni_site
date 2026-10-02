import React, { useState } from "react";
import type { AttemptResult, AttemptView, OlympiadPublic, UserAnnouncement, UserRead } from "@api";
import type { PlatformSection } from "./PlatformShell";
import type { ResourceState } from "./usePlatformOverview";
import type { OlympiadAction } from "./olympiadAction";
import type { SchoolNotification } from "./schoolNotifications";
import { PlatformIcon } from "./PlatformIcon";
import { SubjectVisual } from "./SubjectVisual";
import { availableSeasons, resultSeason, seasonLabel, seasonStart } from "./platformSeason";
import { HeroOlympiads } from "./HeroOlympiads";
import { formatAttemptElapsed } from "./attemptReview";

type Props = {
  section: PlatformSection;
  user: UserRead;
  olympiads: ResourceState<OlympiadPublic[]>;
  results: ResourceState<AttemptResult[]>;
  announcements: ResourceState<UserAnnouncement[]>;
  schoolNotifications: SchoolNotification[];
  activeAttempt: ResourceState<AttemptView | null>;
  startingOlympiadId: number | null;
  viewingAttemptId: number | null;
  downloadingAttemptId: number | null;
  onOlympiadAction: (action: OlympiadAction) => void;
  onContinueAttempt: (attemptId: number) => void;
  onViewAttempt: (result: AttemptResult) => void;
  onDownloadDiploma: (result: AttemptResult) => void;
  profileContent: React.ReactNode;
  onRefresh?: () => void;
};

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow"
});
const formatDate = (value: string | null) => {
  if (!value) return "Дата не указана";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Дата не указана" : dateFormatter.format(date);
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
            {result.started_at ? <time dateTime={result.started_at}><PlatformIcon name="calendar" size={16} />Дата участия: {formatDate(result.started_at)}</time>
              : result.olympiad_available_from ? <time dateTime={result.olympiad_available_from}><PlatformIcon name="calendar" size={16} />Дата олимпиады: {formatDate(result.olympiad_available_from)}</time> : null}
            {result.status !== "active" ? <p>Время прохождения: {formatAttemptElapsed(result)}</p> : null}
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
  const currentSeason = seasonStart(new Date())!;
  const completedResults = p.results.data.filter((result) => result.status !== "active");
  const seasonResults = completedResults.filter((result) => resultSeason(result) === currentSeason);
  return <div className="student-dashboard">
    {p.schoolNotifications.map((item) => <a className="student-school-alert" href="/platform/profile" key={item.id}><PlatformIcon name="info" /><span><strong>{item.title}</strong>{item.text}</span><PlatformIcon name="arrow" /></a>)}
    <HeroOlympiads olympiads={p.olympiads} results={p.results} activeAttempt={p.activeAttempt} user={p.user} startingId={p.startingOlympiadId} onAction={p.onOlympiadAction} onRefresh={p.onRefresh} />
    <section className="student-season-section"><header className="student-section-heading"><h2>Мой сезон {seasonLabel(currentSeason)}</h2><a href="/platform/results">Все результаты<PlatformIcon name="arrow" size={17} /></a></header>
      {p.results.status === "ready" && completedResults.length > 0 && seasonResults.length === 0 ? <p className="student-resource-state">{completedResults.some((result) => resultSeason(result) === null) ? "Даты сезона для части работ пока недоступны. Все работы можно посмотреть в разделе «Результаты и дипломы»." : "В этом сезоне завершённых работ пока нет. Предыдущие работы доступны в разделе «Результаты и дипломы»."}</p> : <ResultList {...resultsProps} items={seasonResults} illustrated />}
    </section>
    {p.announcements.status !== "ready" || p.announcements.data.length > 0 ? <Panel title="Объявления"><AnnouncementList state={p.announcements} limit={1} /></Panel> : null}
  </div>;
}
