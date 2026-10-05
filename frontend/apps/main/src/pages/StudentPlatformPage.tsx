import React, { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@ui";
import { createApiClient, type AttemptResult, type AttemptView } from "@api";
import { openPdfInNewTab, PdfPopupBlockedError } from "@api";
import { PlatformShell, type PlatformSection } from "../platform/PlatformShell";
import { PlatformContent } from "../platform/PlatformContent";
import { createPlatformApi } from "../platform/platformApi";
import { usePlatformOverview } from "../platform/usePlatformOverview";
import { AttemptReviewModal } from "../platform/AttemptReviewModal";
import type { OlympiadAction } from "../platform/olympiadAction";
import { downloadAttemptDiploma } from "../platform/diploma";
import { StudentProfile } from "../platform/StudentProfile";
import { CoinsBalance } from "../platform/CoinsBalance";
import { getSchoolNotifications } from "../platform/schoolNotifications";
import { resolvePlatformSection } from "../platform/platformSection";
import { createMainAuthStorage } from "../utils/authStorage";
import { STUDENT_OLYMPIADS_SECTION_ID } from "../routes/accountHome";
import "../styles/platform.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";
const COINS_ENABLED = import.meta.env.VITE_ENABLE_PLATFORM_COINS === "true";

const sectionTitle: Record<PlatformSection, string> = {
  home: "Главная",
  results: "Результаты и дипломы",
  profile: "Профиль",
  notifications: "Уведомления"
};

export function StudentPlatformPage() {
  const { user, tokens, setSession, signOut, refreshUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const activeSection = resolvePlatformSection(location.pathname);
  const storage = useMemo(() => createMainAuthStorage(), []);
  const client = useMemo(
    () => createApiClient({ baseUrl: API_BASE_URL, storage, onAuthError: signOut }),
    [signOut, storage]
  );
  const platformApi = useMemo(() => createPlatformApi(client), [client]);
  const overview = usePlatformOverview(platformApi, user?.role === "student", user?.class_grade ?? null);
  const [viewingAttemptId, setViewingAttemptId] = useState<number | null>(null);
  const [viewingResult, setViewingResult] = useState<AttemptResult | null>(null);
  const [attemptView, setAttemptView] = useState<AttemptView | null>(null);
  const [downloadingAttemptId, setDownloadingAttemptId] = useState<number | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [downloadingPdfId, setDownloadingPdfId] = useState<number | null>(null);

  useEffect(() => {
    if (activeSection === "profile" && tokens) void refreshUser();
  }, [activeSection, tokens, refreshUser]);

  useEffect(() => {
    if (!user || activeSection !== "home" || location.hash !== `#${STUDENT_OLYMPIADS_SECTION_ID}`) return;
    const hero = document.getElementById(STUDENT_OLYMPIADS_SECTION_ID);
    hero?.focus({ preventScroll: true });
    hero?.scrollIntoView({ block: "start", behavior: "auto" });
  }, [activeSection, location.hash, user?.id]);

  if (!user) {
    return null;
  }

  if (!activeSection) {
    return <Navigate to="/platform" replace />;
  }

  const schoolNotifications = getSchoolNotifications(user.school_status);
  const announcementCount = overview.announcements.status === "ready" ? overview.announcements.data.length : 0;

  const handleSignOut = async () => {
    await signOut();
    navigate("/", { replace: true });
  };

  const continueAttempt = (attemptId: number) => navigate(`/olympiad?attemptId=${attemptId}`);

  const handleDownloadPdf = async (olympiadId: number) => {
    if (downloadingPdfId !== null) return;
    setDownloadingPdfId(olympiadId);
    setActionMessage(null);
    try {
      await openPdfInNewTab(() => platformApi.getParticipantPdf(olympiadId));
    } catch (error) {
      setActionMessage(error instanceof PdfPopupBlockedError
        ? "Разрешите открытие новых вкладок для этого сайта и нажмите «Скачать PDF» ещё раз."
        : "Не удалось открыть PDF. Проверьте, что олимпиада или ваша попытка ещё активна, и попробуйте снова.");
    } finally {
      setDownloadingPdfId(null);
    }
  };

  const handleOlympiadAction = (action: OlympiadAction) => {
    setActionMessage(null);
    if (action.kind === "continue") return continueAttempt(action.attemptId);
    if (action.kind === "view") return void handleViewAttempt(action.result);
    if (action.kind === "disabled") {
      setActionMessage(action.reason);
      return;
    }
    navigate("/", { state: { startOlympiadId: action.olympiad.id } });
  };

  async function handleViewAttempt(result: AttemptResult) {
    if (!result.results_released || result.status === "active") {
      setActionMessage("Работа станет доступна после завершения попытки и публикации результата.");
      return;
    }
    setViewingAttemptId(result.attempt_id);
    setActionMessage(null);
    try {
      const view = await platformApi.getAttempt(result.attempt_id);
      setViewingResult(result);
      setAttemptView(view);
    } catch {
      setActionMessage("Не удалось загрузить работу. Попробуйте позже.");
    } finally {
      setViewingAttemptId(null);
    }
  }

  const handleDownloadDiploma = async (result: AttemptResult) => {
    if (!result.results_released) {
      setActionMessage("Диплом появится после публикации результата.");
      return;
    }
    if (user.school_status !== "selected" && user.school_status !== "not_required") {
      setActionMessage("Диплом станет доступен после подтверждения школы администратором.");
      return;
    }
    setDownloadingAttemptId(result.attempt_id);
    setActionMessage(null);
    const outcome = await downloadAttemptDiploma({
      apiBaseUrl: API_BASE_URL,
      attemptId: result.attempt_id,
      accessToken: tokens?.access_token ?? null
    });
    if (!outcome.ok) setActionMessage(outcome.message);
    setDownloadingAttemptId(null);
  };

  return (
    <PlatformShell
      activeSection={activeSection}
      userName={user.name}
      login={user.login}
      classGrade={user.class_grade}
      notificationCount={announcementCount + schoolNotifications.length}
      coinsContent={<CoinsBalance enabled={COINS_ENABLED} balance={user.coins} />}
      onSignOut={handleSignOut}
    >
      <section className="student-platform-intro">
        {activeSection === "profile" ? <p>Учётная запись</p> : null}
        <h1>{activeSection === "home" ? <>Привет, {user.name || user.login}! <span aria-hidden="true">👋</span></> : sectionTitle[activeSection]}</h1>
        <span>{activeSection === "home" ? "Рады видеть тебя на платформе «Невский интеграл»." : activeSection === "profile" ? "Личные данные, школа и связь с учителями." : activeSection === "results" ? "Твои участия, результаты и дипломы по сезонам." : "Объявления и важные события твоего кабинета."}</span>
      </section>
      {actionMessage ? <div className="student-action-message" role="alert">{actionMessage}</div> : null}
      <PlatformContent
        section={activeSection}
        user={user}
        olympiads={overview.olympiads}
        results={overview.results}
        announcements={overview.announcements}
        schoolNotifications={schoolNotifications}
        activeAttempt={overview.activeAttempt}
        startingOlympiadId={null}
        viewingAttemptId={viewingAttemptId}
        downloadingAttemptId={downloadingAttemptId}
        onOlympiadAction={handleOlympiadAction}
        onContinueAttempt={continueAttempt}
        onViewAttempt={(result) => void handleViewAttempt(result)}
        onDownloadDiploma={(result) => void handleDownloadDiploma(result)}
        downloadingPdfId={downloadingPdfId}
        onDownloadPdf={(id) => void handleDownloadPdf(id)}
        onRefresh={overview.refresh}
        profileContent={(
          <StudentProfile
            user={user}
            client={client}
            api={platformApi}
            onUserUpdated={(updated) => { const current = storage.getTokens(); if (current) setSession(current, updated); }}
          />
        )}
      />
      <AttemptReviewModal
        client={client}
        view={attemptView}
        result={viewingResult}
        onClose={() => { setAttemptView(null); setViewingResult(null); }}
      />
    </PlatformShell>
  );
}
