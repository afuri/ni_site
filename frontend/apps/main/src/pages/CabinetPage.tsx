import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, LayoutShell, Modal, Table, TextInput, useAuth } from "@ui";
import { createApiClient, type ManualTeacher, type UserRead } from "@api";
import { createAuthStorage } from "@utils";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import logoImage from "../assets/logo2.png";
import "../styles/cabinet.css";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

const MOCK_S3_STORAGE_KEY = "ni_admin_s3_mock";
const VERIFY_SUCCESS_STORAGE_KEY = "ni_email_verified_success";
const OPEN_LOGIN_STORAGE_KEY = "ni_open_login";

const loadMockS3 = (): Record<string, string> => {
  if (typeof window === "undefined") {
    return {};
  }
  const raw = window.localStorage.getItem(MOCK_S3_STORAGE_KEY);
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const LOGIN_REGEX = /^[A-Za-z][A-Za-z0-9]*$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RU_NAME_REGEX = /^[А-ЯЁ][А-ЯЁа-яё -]+$/;
const RU_CITY_REGEX = /^[А-ЯЁ][А-ЯЁа-яё -]+$/;
const FATHER_NAME_REGEX = /^[А-ЯЁ][А-ЯЁа-яё-]*(?: [А-ЯЁ][А-ЯЁа-яё-]*)*$/;
const RU_TEXT_REGEX = /^[А-ЯЁа-яё]+$/;

const TrashIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z"
    />
  </svg>
);

type AttemptResult = {
  attempt_id: number;
  olympiad_id: number;
  olympiad_title?: string;
  status: string;
  score_total: number;
  score_max: number;
  percent?: number;
  graded_at: string | null;
  results_released?: boolean;
};

type AttemptTask = {
  task_id: number;
  title: string;
  content: string;
  task_type: "single_choice" | "multi_choice" | "short_text";
  image_key?: string | null;
  payload: { image_position?: "before" | "after" };
  current_answer?: unknown;
  answer_payload?: unknown;
};

type AttemptView = {
  attempt: { id: number };
  olympiad_title: string;
  tasks: AttemptTask[];
};

type ProfileForm = {
  login: string;
  email: string;
  surname: string;
  name: string;
  fatherName: string;
  country: string;
  city: string;
  school: string;
  classGrade: string;
  gender: "" | "male" | "female";
  subject: string;
};

type ProfileErrors = Partial<Record<keyof ProfileForm, string>>;

type TeacherEntry = {
  id: number;
  fullName: string;
  subject: string;
};

type TeacherStudentLink = {
  id: number;
  teacher_id: number;
  student_id: number;
  status: string;
  requested_by?: "teacher" | "student";
  teacher_surname?: string;
  teacher_name?: string;
  teacher_father_name?: string | null;
  teacher_subject?: string | null;
  student_surname?: string;
  student_name?: string;
  student_father_name?: string | null;
  student_class_grade?: number | null;
};

type LinkDecision = "approve" | "reject" | null;

type DeleteTarget =
  | {
      kind: "linked-teacher";
      teacherId: number;
      name: string;
    }
  | {
      kind: "manual-teacher";
      manualId: number;
      name: string;
    }
  | {
      kind: "student";
      studentId: number;
      name: string;
    };

const buildProfileFromUser = (currentUser: UserRead): ProfileForm => ({
  login: currentUser.login ?? "",
  email: currentUser.email ?? "",
  surname: currentUser.surname ?? "",
  name: currentUser.name ?? "",
  fatherName: currentUser.father_name ?? "",
  country: currentUser.country ?? "Россия",
  city: currentUser.city ?? "",
  school: currentUser.school ?? "",
  classGrade:
    currentUser.class_grade !== null && currentUser.class_grade !== undefined
      ? String(currentUser.class_grade)
      : "",
  gender: currentUser.gender ?? "",
  subject: currentUser.subject ?? ""
});

const mapManualTeachersFromUser = (currentUser: UserRead): TeacherEntry[] =>
  (currentUser.manual_teachers ?? []).map((teacher) => ({
    id: teacher.id,
    fullName: teacher.full_name,
    subject: teacher.subject
  }));

const mapManualTeachersToPayload = (entries: TeacherEntry[]): ManualTeacher[] =>
  entries.map((teacher) => ({
    id: teacher.id,
    full_name: teacher.fullName,
    subject: teacher.subject
  }));

export function CabinetPage() {
  const { status, user, tokens, setSession, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const storage = useMemo(
    () =>
      createAuthStorage({
        tokensKey: "ni_main_tokens",
        userKey: "ni_main_user"
      }),
    []
  );
  const client = useMemo(() => createApiClient({ baseUrl: API_BASE_URL, storage }), [storage]);

  const [profileForm, setProfileForm] = useState<ProfileForm>({
    login: "",
    email: "",
    surname: "",
    name: "",
    fatherName: "",
    country: "Россия",
    city: "",
    school: "",
    classGrade: "",
    gender: "",
    subject: ""
  });
  const [savedProfile, setSavedProfile] = useState<ProfileForm | null>(null);
  const [profileErrors, setProfileErrors] = useState<ProfileErrors>({});
  const [profileStatus, setProfileStatus] = useState<"idle" | "saving" | "error">("idle");
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [schoolSuggestions, setSchoolSuggestions] = useState<string[]>([]);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const cityLookupTimer = useRef<number | null>(null);
  const schoolLookupTimer = useRef<number | null>(null);
  const [viewedStudent, setViewedStudent] = useState<UserRead | null>(null);

  const [attemptResults, setAttemptResults] = useState<AttemptResult[]>([]);
  const [attemptsStatus, setAttemptsStatus] = useState<"idle" | "loading" | "error">("idle");
  const [attemptsError, setAttemptsError] = useState<string | null>(null);
  const [attemptView, setAttemptView] = useState<AttemptView | null>(null);
  const [attemptViewStatus, setAttemptViewStatus] = useState<"idle" | "loading" | "error">("idle");
  const [attemptViewError, setAttemptViewError] = useState<string | null>(null);
  const [attemptImageUrls, setAttemptImageUrls] = useState<Record<string, string>>({});
  const [pendingResultsMessage, setPendingResultsMessage] = useState<string | null>(null);

  const [emailRequestStatus, setEmailRequestStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [isEmailWarningOpen, setIsEmailWarningOpen] = useState(false);

  const [teacherName, setTeacherName] = useState("");
  const [teacherSubject, setTeacherSubject] = useState("");
  const [teacherList, setTeacherList] = useState<TeacherEntry[]>([]);
  const [linkRequestValue, setLinkRequestValue] = useState("");
  const [linkStatusMessage, setLinkStatusMessage] = useState<string | null>(null);

  const [students, setStudents] = useState<TeacherStudentLink[]>([]);
  const [teachers, setTeachers] = useState<TeacherStudentLink[]>([]);
  const [isLogoutPromptOpen, setIsLogoutPromptOpen] = useState(false);
  const [pendingLinks, setPendingLinks] = useState<TeacherStudentLink[]>([]);
  const [linkDecisions, setLinkDecisions] = useState<Record<number, LinkDecision>>({});
  const [isLinkPromptOpen, setIsLinkPromptOpen] = useState(false);
  const [linkPromptStatus, setLinkPromptStatus] = useState<"idle" | "saving" | "error">("idle");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteStatus, setDeleteStatus] = useState<"idle" | "deleting" | "error">("idle");
  const [hasVerifySuccess, setHasVerifySuccess] = useState(false);
  const [isVerifySuccessOpen, setIsVerifySuccessOpen] = useState(false);

  const closeAttemptView = () => {
    setAttemptViewStatus("idle");
    setAttemptViewError(null);
    setAttemptView(null);
    setAttemptImageUrls({});
  };

  useEffect(() => {
    if (!isUserMenuOpen) {
      return;
    }
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isUserMenuOpen]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const flag = window.localStorage.getItem(VERIFY_SUCCESS_STORAGE_KEY);
    if (!flag) {
      return;
    }
    window.localStorage.removeItem(VERIFY_SUCCESS_STORAGE_KEY);
    setHasVerifySuccess(true);
    setIsVerifySuccessOpen(true);
  }, []);

  const studentParam = searchParams.get("student");
  const studentIdValue = studentParam ? Number(studentParam) : null;
  const viewingStudentId =
    user?.role === "teacher" && studentIdValue && !Number.isNaN(studentIdValue)
      ? studentIdValue
      : null;

  const activeUser = viewingStudentId ? viewedStudent : user;

  useEffect(() => {
    if (!user) {
      return;
    }
    if (viewingStudentId) {
      client
        .request<UserRead>({ path: `/teacher/students/${viewingStudentId}/profile`, method: "GET" })
        .then((data) => setViewedStudent(data))
        .catch(() => setViewedStudent(null));
      return;
    }
    setViewedStudent(null);
    const nextProfile = buildProfileFromUser(user);
    setProfileForm(nextProfile);
    setSavedProfile(nextProfile);
  }, [client, user, viewingStudentId]);

  useEffect(() => {
    const query = profileForm.city.trim();
    if (cityLookupTimer.current !== null) {
      window.clearTimeout(cityLookupTimer.current);
    }
    if (!query) {
      setCitySuggestions([]);
      setSchoolSuggestions([]);
      return;
    }
    cityLookupTimer.current = window.setTimeout(async () => {
      try {
        const cities = await client.lookup.cities({ query, limit: 20 });
        setCitySuggestions(cities);
      } catch {
        setCitySuggestions([]);
      }
    }, 250);
    return () => {
      if (cityLookupTimer.current !== null) {
        window.clearTimeout(cityLookupTimer.current);
      }
    };
  }, [client, profileForm.city]);

  useEffect(() => {
    const cityValue = profileForm.city.trim();
    const query = profileForm.school.trim();
    if (schoolLookupTimer.current !== null) {
      window.clearTimeout(schoolLookupTimer.current);
    }
    if (!cityValue) {
      setSchoolSuggestions([]);
      return;
    }
    schoolLookupTimer.current = window.setTimeout(async () => {
      try {
        const schools = await client.lookup.schools({ city: cityValue, query, limit: 50 });
        setSchoolSuggestions(schools);
      } catch {
        setSchoolSuggestions([]);
      }
    }, 250);
    return () => {
      if (schoolLookupTimer.current !== null) {
        window.clearTimeout(schoolLookupTimer.current);
      }
    };
  }, [client, profileForm.city, profileForm.school]);

  useEffect(() => {
    if (!attemptView) {
      setAttemptImageUrls({});
      return;
    }
    const missingKeys = attemptView.tasks
      .map((task) => task.image_key)
      .filter((key): key is string => Boolean(key))
      .filter((key) => !attemptImageUrls[key]);
    if (missingKeys.length === 0) {
      return;
    }
    let isMounted = true;
    const loadImages = async () => {
      const entries = await Promise.all(
        missingKeys.map(async (key) => {
          if (key.startsWith("http") || key.startsWith("data:")) {
            return [key, key] as const;
          }
          const mockData = loadMockS3()[key];
          if (mockData) {
            return [key, mockData] as const;
          }
          try {
            const safeKey = key.split("/").map(encodeURIComponent).join("/");
            const payload = await client.request<{ url: string }>({
              path: `/uploads/${safeKey}`,
              method: "GET"
            });
            return [key, payload.url] as const;
          } catch {
            return [key, ""] as const;
          }
        })
      );
      if (!isMounted) {
        return;
      }
      setAttemptImageUrls((prev) => {
        const next = { ...prev };
        entries.forEach(([key, url]) => {
          if (url) {
            next[key] = url;
          }
        });
        return next;
      });
    };
    void loadImages();
    return () => {
      isMounted = false;
    };
  }, [attemptView, attemptImageUrls, client]);

  useEffect(() => {
    if (!user || user.role !== "student") {
      setTeacherList([]);
      return;
    }
    setTeacherList(mapManualTeachersFromUser(user));
  }, [user]);

  useEffect(() => {
    if (activeUser && !activeUser.is_email_verified) {
      setIsEmailWarningOpen(true);
    }
  }, [activeUser]);

  useEffect(() => {
    if (!user) {
      return;
    }
    const resultsPath = viewingStudentId
      ? `/teacher/students/${viewingStudentId}/results`
      : "/attempts/results/my";
    if (!viewingStudentId && user.role !== "student") {
      setAttemptResults([]);
      setAttemptsStatus("idle");
      return;
    }
    setAttemptsStatus("loading");
    setAttemptsError(null);
    client
      .request<AttemptResult[]>({ path: resultsPath, method: "GET" })
      .then((data) => {
        setAttemptResults(data ?? []);
        setAttemptsStatus("idle");
      })
      .catch(() => {
        setAttemptsError("Не удалось загрузить результаты.");
        setAttemptsStatus("error");
      });
  }, [client, user, viewingStudentId]);

  useEffect(() => {
    if (!user) {
      return;
    }
    if (user.role === "teacher") {
      client
        .request<TeacherStudentLink[]>({ path: "/teacher/students?status=confirmed", method: "GET" })
        .then((data) => setStudents(data ?? []))
        .catch(() => setStudents([]));
      return;
    }
    if (user.role === "student") {
      client
        .request<TeacherStudentLink[]>({ path: "/student/teachers?status=confirmed", method: "GET" })
        .then((data) => setTeachers(data ?? []))
        .catch(() => setTeachers([]));
    }
  }, [client, user]);

  useEffect(() => {
    if (!viewedStudent) {
      return;
    }
    const nextProfile = buildProfileFromUser(viewedStudent);
    setProfileForm(nextProfile);
    setSavedProfile(nextProfile);
  }, [viewedStudent]);

  useEffect(() => {
    if (!user) {
      return;
    }
    const pendingPath =
      user.role === "teacher" ? "/teacher/students?status=pending" : "/student/teachers?status=pending";
    client
      .request<TeacherStudentLink[]>({ path: pendingPath, method: "GET" })
      .then((data) => {
        const pending = data ?? [];
        const incoming = pending.filter((link) => {
          if (!link.requested_by) {
            return false;
          }
          return link.requested_by !== user.role;
        });
        setPendingLinks(incoming);
        setLinkDecisions({});
        if (incoming.length > 0) {
          setIsLinkPromptOpen(true);
        }
      })
      .catch(() => {
        setPendingLinks([]);
      });
  }, [client, user]);

  const hasProfileChanges = useMemo(() => {
    if (!savedProfile) {
      return false;
    }
    return (Object.keys(profileForm) as (keyof ProfileForm)[]).some(
      (key) => profileForm[key] !== savedProfile[key]
    );
  }, [profileForm, savedProfile]);

  const handleVerifySuccessClose = () => {
    setIsVerifySuccessOpen(false);
    if (!user && typeof window !== "undefined") {
      window.localStorage.setItem(OPEN_LOGIN_STORAGE_KEY, "1");
      navigate("/", { replace: true });
    }
  };

  const verifySuccessModal = (
    <Modal
      isOpen={isVerifySuccessOpen}
      onClose={handleVerifySuccessClose}
      title="Верификация прошла успешно"
      className="cabinet-verify-modal"
      closeOnBackdrop={false}
    >
      <p className="cabinet-verify-message">Верификация прошла успешно.</p>
      <div className="cabinet-modal-actions">
        <Button type="button" onClick={handleVerifySuccessClose}>
          Ок
        </Button>
      </div>
    </Modal>
  );

  if (status === "loading" || status === "idle") {
    return <div className="cabinet-page">Загрузка...</div>;
  }

  if (!user) {
    if (hasVerifySuccess) {
      return (
        <div className="cabinet-page">
          <LayoutShell
            logo={
              <Link to="/" className="cabinet-logo">
                <img src={logoImage} alt="Невский интеграл" />
                <span>НЕВСКИЙ<br />ИНТЕГРАЛ</span>
              </Link>
            }
            nav={null}
            actions={<Button variant="outline" onClick={() => navigate("/")}>На главную</Button>}
            footer={<div>© 2026 Олимпиада «Невский интеграл»</div>}
          >
            <div className="cabinet-verify-standalone">
              <p>Чтобы попасть в личный кабинет, войдите в аккаунт на главной странице.</p>
              <Button onClick={() => navigate("/")}>Перейти на главную</Button>
            </div>
          </LayoutShell>
          {verifySuccessModal}
        </div>
      );
    }
    return <Navigate to="/" replace />;
  }

  if (viewingStudentId && !activeUser) {
    return <div className="cabinet-page">Загрузка...</div>;
  }

  const validateProfile = (form: ProfileForm) => {
    const errors: ProfileErrors = {};
    const profileRole = activeUser?.role ?? user.role;

    if (!form.login || !LOGIN_REGEX.test(form.login)) {
      errors.login = "Логин: латинские буквы/цифры, начинается с буквы.";
    }
    if (!form.email || !EMAIL_REGEX.test(form.email)) {
      errors.email = "Введите корректный email.";
    }
    if (!form.surname || !RU_NAME_REGEX.test(form.surname)) {
      errors.surname = "Первая буква заглавная, можно пробел и дефис.";
    }
    if (!form.name || !RU_NAME_REGEX.test(form.name)) {
      errors.name = "Первая буква заглавная, можно пробел и дефис.";
    }
    if (form.fatherName && !FATHER_NAME_REGEX.test(form.fatherName)) {
      errors.fatherName = "Только русские буквы, каждая часть с заглавной, можно пробел.";
    }
    if (!form.city) {
      errors.city = "Введите город.";
    } else if (!RU_CITY_REGEX.test(form.city)) {
      errors.city = "Первая буква заглавная, можно пробел и дефис.";
    }
    if (!form.school) {
      errors.school = "Введите школу.";
    }
    if (!form.gender) {
      errors.gender = "Выберите пол.";
    }
    if (profileRole === "student" && !form.classGrade) {
      errors.classGrade = "Выберите класс.";
    }
    if (profileRole === "teacher") {
      if (!form.subject) {
        errors.subject = "Введите предмет.";
      } else if (!RU_TEXT_REGEX.test(form.subject)) {
        errors.subject = "Только русские буквы.";
      }
    }

    return errors;
  };

  const handleProfileChange = <K extends keyof ProfileForm>(field: K, value: ProfileForm[K]) => {
    setProfileForm((prev) => ({
      ...prev,
      [field]: value
    }));
    if (profileErrors[field]) {
      setProfileErrors((prev) => ({
        ...prev,
        [field]: undefined
      }));
    }
  };

  const handleProfileSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileMessage(null);
    const errors = validateProfile(profileForm);
    if (Object.keys(errors).length > 0) {
      setProfileErrors(errors);
      return;
    }
    setProfileStatus("saving");
    try {
      const path = viewingStudentId ? `/teacher/students/${viewingStudentId}/profile` : "/users/me";
      const updated = await client.request<UserRead>({
        path,
        method: "PUT",
        body: {
          surname: profileForm.surname.trim(),
          name: profileForm.name.trim(),
          father_name: profileForm.fatherName ? profileForm.fatherName.trim() : null,
          country: profileForm.country.trim(),
          city: profileForm.city.trim(),
          school: profileForm.school.trim(),
          class_grade: profileForm.classGrade ? Number(profileForm.classGrade) : null,
          gender: profileForm.gender || null,
          subject: profileForm.subject ? profileForm.subject.trim() : null
        }
      });
      if (tokens && !viewingStudentId) {
        setSession(tokens, updated);
      } else if (viewingStudentId) {
        setViewedStudent(updated);
      }
      const nextProfile = buildProfileFromUser(updated);
      setProfileForm(nextProfile);
      setSavedProfile(nextProfile);
      setProfileStatus("idle");
      setProfileMessage("Данные сохранены.");
    } catch {
      setProfileStatus("error");
      setProfileMessage("Не удалось сохранить изменения.");
    }
  };

  const handleProfileCancel = () => {
    if (!savedProfile) {
      return;
    }
    setProfileForm(savedProfile);
    setProfileErrors({});
    setProfileMessage(null);
  };

  const handleUserMenuToggle = () => {
    setIsUserMenuOpen((prev) => !prev);
  };

  const handleUserMenuClose = () => {
    setIsUserMenuOpen(false);
  };

  const handleLinkDecision = (linkId: number, decision: LinkDecision) => {
    setLinkDecisions((prev) => ({
      ...prev,
      [linkId]: prev[linkId] === decision ? null : decision
    }));
  };

  const handleLinkPromptSave = async () => {
    const decisions = Object.entries(linkDecisions).filter(([, decision]) => decision);
    if (decisions.length === 0) {
      return;
    }
    setLinkPromptStatus("saving");
    const approvedIds = decisions
      .filter(([, decision]) => decision === "approve")
      .map(([id]) => Number(id));
    const rejectedIds = decisions
      .filter(([, decision]) => decision === "reject")
      .map(([id]) => Number(id));
    const remaining = pendingLinks.filter((link) => !decisions.some(([id]) => Number(id) === link.id));
    try {
      await Promise.all([
        ...approvedIds.map((linkId) => {
          const link = pendingLinks.find((item) => item.id === linkId);
          if (!link) {
            return Promise.resolve();
          }
          const confirmPath =
            user.role === "teacher"
              ? `/teacher/students/${link.student_id}/confirm`
              : `/student/teachers/${link.teacher_id}/confirm`;
          return client.request({
            path: confirmPath,
            method: "POST"
          });
        }),
        ...rejectedIds.map((linkId) => {
          const link = pendingLinks.find((item) => item.id === linkId);
          if (!link) {
            return Promise.resolve();
          }
          const deletePath =
            user.role === "teacher"
              ? `/teacher/students/${link.student_id}`
              : `/student/teachers/${link.teacher_id}`;
          return client.request({
            path: deletePath,
            method: "DELETE"
          });
        })
      ]);
      if (user?.role === "teacher") {
        const updated = await client.request<TeacherStudentLink[]>({
          path: "/teacher/students?status=confirmed",
          method: "GET"
        });
        setStudents(updated ?? []);
      } else {
        const updated = await client.request<TeacherStudentLink[]>({
          path: "/student/teachers?status=confirmed",
          method: "GET"
        });
        setTeachers(updated ?? []);
      }
      setPendingLinks(remaining);
      setLinkDecisions({});
      setIsLinkPromptOpen(false);
      setLinkPromptStatus("idle");
    } catch {
      setLinkPromptStatus("error");
    }
  };

  const handleLogoutClick = () => {
    setIsUserMenuOpen(false);
    if (hasProfileChanges) {
      setIsLogoutPromptOpen(true);
      return;
    }
    void signOut();
  };

  const handleLogoutConfirm = async () => {
    await signOut();
    setIsLogoutPromptOpen(false);
  };

  const openDeletePrompt = (target: DeleteTarget) => {
    setDeleteTarget(target);
    setDeleteStatus("idle");
  };

  const closeDeletePrompt = () => {
    setDeleteTarget(null);
    setDeleteStatus("idle");
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) {
      return;
    }
    setDeleteStatus("deleting");
    try {
      if (deleteTarget.kind === "manual-teacher") {
        const prevList = teacherList;
        const nextList = prevList.filter((entry) => entry.id !== deleteTarget.manualId);
        setTeacherList(nextList);
        const saved = await saveManualTeachers(nextList);
        if (!saved) {
          setTeacherList(prevList);
          setDeleteStatus("error");
          return;
        }
      } else if (deleteTarget.kind === "linked-teacher") {
        await client.request({
          path: `/student/teachers/${deleteTarget.teacherId}`,
          method: "DELETE"
        });
        setTeachers((prev) => prev.filter((entry) => entry.teacher_id !== deleteTarget.teacherId));
      } else if (deleteTarget.kind === "student") {
        await client.request({
          path: `/teacher/students/${deleteTarget.studentId}`,
          method: "DELETE"
        });
        setStudents((prev) => prev.filter((entry) => entry.student_id !== deleteTarget.studentId));
      }
      closeDeletePrompt();
    } catch {
      setDeleteStatus("error");
    }
  };

  const handleStudentLinkClick = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleEmailVerifyRequest = async () => {
    if (!profileForm.email) {
      return;
    }
    setEmailRequestStatus("sending");
    try {
      await client.request({
        path: "/auth/verify/request",
        method: "POST",
        auth: false,
        body: { email: profileForm.email }
      });
      setEmailRequestStatus("sent");
    } catch {
      setEmailRequestStatus("error");
    }
  };

  const openAttempt = async (attempt: AttemptResult) => {
    if (!attempt.results_released) {
      setPendingResultsMessage("Результаты в обработке. Дождитесь публикации администратором.");
      return;
    }
    const attemptId = attempt.attempt_id;
    setAttemptViewStatus("loading");
    setAttemptViewError(null);
    setAttemptView(null);
    try {
      const attemptPath = viewingStudentId ? `/teacher/attempts/${attemptId}` : `/attempts/${attemptId}`;
      const data = await client.request<AttemptView>({
        path: attemptPath,
        method: "GET"
      });
      setAttemptView(data);
      setAttemptViewStatus("idle");
    } catch {
      setAttemptViewStatus("error");
      setAttemptViewError("Не удалось загрузить попытку.");
    }
  };

  const formatDate = (value: string | null) => {
    if (!value) {
      return "—";
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("ru-RU");
  };

  const formatAnswer = (answer: unknown) => {
    if (!answer) {
      return "Нет ответа";
    }
    try {
      return JSON.stringify(answer);
    } catch {
      return String(answer);
    }
  };

  const formatFullName = (parts: Array<string | null | undefined>) => {
    return parts.filter(Boolean).join(" ");
  };

  const saveManualTeachers = async (nextList: TeacherEntry[]) => {
    if (!user || user.role !== "student" || viewingStudentId) {
      return true;
    }
    try {
      const updated = await client.request<UserRead>({
        path: "/users/me",
        method: "PUT",
        body: { manual_teachers: mapManualTeachersToPayload(nextList) }
      });
      if (tokens) {
        setSession(tokens, updated);
      }
      return true;
    } catch {
      return false;
    }
  };

  const addTeacher = async () => {
    if (!teacherName || !teacherSubject) {
      return;
    }
    const entry = {
      id: Date.now(),
      fullName: teacherName.trim(),
      subject: teacherSubject.trim()
    };
    const prevList = teacherList;
    const nextList = [...prevList, entry];
    setTeacherList(nextList);
    setTeacherName("");
    setTeacherSubject("");
    const saved = await saveManualTeachers(nextList);
    if (!saved) {
      setTeacherList(prevList);
    }
  };

  const sendLinkRequest = async () => {
    if (!linkRequestValue) {
      return;
    }
    setLinkStatusMessage(null);
    if (user.role === "teacher") {
      try {
        await client.request({
          path: "/teacher/students",
          method: "POST",
          body: { attach: { student_login: linkRequestValue.trim() } }
        });
        setLinkStatusMessage("Запрос отправлен.");
      } catch {
        setLinkStatusMessage("Не удалось отправить запрос.");
      }
      return;
    } else {
      try {
        await client.request({
          path: "/student/teachers",
          method: "POST",
          body: { attach: { teacher_login: linkRequestValue.trim() } }
        });
        setLinkStatusMessage("Запрос отправлен.");
      } catch {
        setLinkStatusMessage("Не удалось отправить запрос.");
      }
    }
  };

  const teacherEntries = teachers.map((link) => ({
    id: `linked-${link.id}`,
    label:
      formatFullName([link.teacher_surname, link.teacher_name, link.teacher_father_name]) ||
      `Учитель #${link.teacher_id}`,
    sublabel: link.teacher_subject ?? null,
    kind: "linked" as const,
    teacherId: link.teacher_id
  }));
  const manualTeacherEntries = teacherList.map((teacher) => ({
    id: `manual-${teacher.id}`,
    label: teacher.fullName,
    sublabel: teacher.subject,
    kind: "manual" as const,
    manualId: teacher.id
  }));
  const allTeacherEntries = [...teacherEntries, ...manualTeacherEntries];
  const studentEntries = students.map((link) => ({
    id: link.id,
    label: formatFullName([link.student_surname, link.student_name, link.student_father_name]) ||
      `Ученик #${link.student_id}`,
    classGrade: link.student_class_grade,
    href: `/cabinet?student=${link.student_id}`,
    studentId: link.student_id
  }));
  const mobileNavItems = [
    { label: "Результаты", href: "#results", visible: activeUser?.role === "student" },
    { label: "Профиль", href: "#profile", visible: true },
    { label: "Сопровождение", href: "#links", visible: true }
  ].filter((item) => item.visible);

  return (
    <div className="cabinet-page">
      <LayoutShell
        logo={
          <Link to="/" className="cabinet-logo">
            <img src={logoImage} alt="Невский интеграл" />
            <span>НЕВСКИЙ<br />ИНТЕГРАЛ</span>
          </Link>
        }
        nav={
          <div className="cabinet-nav">
            <Link to="/">Главная</Link>
            <span className="cabinet-nav-current">Личный кабинет</span>
          </div>
        }
        actions={
          <div className="cabinet-actions">
            <div className="cabinet-user-menu" ref={userMenuRef}>
              <button
                type="button"
                className="cabinet-user-button"
                onClick={handleUserMenuToggle}
                aria-haspopup="menu"
                aria-expanded={isUserMenuOpen}
              >
                {user.login}
              </button>
              {isUserMenuOpen ? (
                <div className="cabinet-user-popup" role="menu">
                  <Link to="/cabinet" role="menuitem" onClick={handleUserMenuClose}>
                    Личный кабинет
                  </Link>
                  <button type="button" onClick={handleLogoutClick} role="menuitem">
                    Выйти
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        }
        footer={<div className="home-footer">© 2026 Олимпиада «Невский интеграл»</div>}
      >
        <main className="cabinet-content">
          <section className="cabinet-section">
            <h1>Личный кабинет</h1>
            <p className="cabinet-subtitle">
              Добро пожаловать, {activeUser?.surname ?? ""} {activeUser?.name ?? ""}.
            </p>
          </section>

          {activeUser?.role === "student" ? (
            <section className="cabinet-section" id="results">
              <div className="cabinet-section-heading">
                <h2>Результаты прохождения олимпиад</h2>
              </div>
              {attemptsStatus === "error" ? <div className="cabinet-alert">{attemptsError}</div> : null}
              <Table>
                <thead>
                  <tr>
                    <th>№</th>
                    <th>Дата прохождения</th>
                    <th>Название олимпиады</th>
                    <th>Результат</th>
                    <th>Просмотр попытки</th>
                    <th>Диплом</th>
                  </tr>
                </thead>
                <tbody>
                  {attemptsStatus === "loading" ? (
                    <tr>
                      <td colSpan={6}>Загрузка...</td>
                    </tr>
                  ) : attemptResults.length > 0 ? (
                    attemptResults.map((item, index) => (
                      <tr key={item.attempt_id}>
                        <td>{index + 1}</td>
                        <td>{formatDate(item.graded_at)}</td>
                        <td>{item.olympiad_title ?? `Олимпиада #${item.olympiad_id}`}</td>
                        <td>
                          {item.results_released ? `${item.score_total}/${item.score_max}` : "Результаты в обработке"}
                        </td>
                        <td>
                          {item.results_released ? (
                            <button
                              type="button"
                              className="cabinet-link"
                              onClick={() => {
                                openAttempt(item);
                              }}
                            >
                              Просмотр попытки
                            </button>
                          ) : (
                            <span className="cabinet-hint">Недоступно</span>
                          )}
                        </td>
                        <td>
                          {item.results_released ? (
                            <a
                              className="cabinet-link"
                              href={`${API_BASE_URL}/attempts/${item.attempt_id}/diploma`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Диплом
                            </a>
                          ) : (
                            <button
                              type="button"
                              className="cabinet-link"
                              onClick={() =>
                                setPendingResultsMessage("Диплом в процессе изготовления.")
                              }
                            >
                              Диплом
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6}>Результаты пока отсутствуют.</td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </section>
          ) : null}

          <section className="cabinet-section" id="profile">
            <div className="cabinet-section-heading">
              <h2>Личные данные</h2>
            </div>
            <form className="cabinet-form" onSubmit={handleProfileSave}>
              <TextInput
                label="Логин"
                name="login"
                value={profileForm.login}
                onChange={(event) => handleProfileChange("login", event.target.value)}
                error={profileErrors.login}
                helperText="Не менее 5 символов. Только английские буквы и цифры. Начинаться должен с буквы."
              />
              <div className="cabinet-email-row">
              <TextInput
                label="Email"
                name="email"
                type="email"
                value={profileForm.email}
                onChange={(event) => handleProfileChange("email", event.target.value)}
                error={profileErrors.email}
                helperText="Используйте действующий email — понадобится для входа и восстановления."
              />
                <div className="cabinet-email-status">
                  <span
                    className={
                      activeUser?.is_email_verified
                        ? "cabinet-status cabinet-status-verified"
                        : "cabinet-status cabinet-status-unverified"
                    }
                  >
                    {activeUser?.is_email_verified ? "Верифицирован" : "Не верифицирован"}
                  </span>
                  {!activeUser?.is_email_verified ? (
                    <Button
                      type="button"
                      size="sm"
                      className="cabinet-verify-button"
                      onClick={handleEmailVerifyRequest}
                      disabled={emailRequestStatus === "sending"}
                    >
                      Отправить запрос повторно
                    </Button>
                  ) : null}
                  {emailRequestStatus === "sent" ? (
                    <span className="cabinet-hint">Письмо отправлено.</span>
                  ) : null}
                  {emailRequestStatus === "error" ? (
                    <span className="cabinet-hint cabinet-hint-error">Ошибка отправки.</span>
                  ) : null}
                </div>
              </div>
              <TextInput
                label="Фамилия"
                name="surname"
                value={profileForm.surname}
                onChange={(event) => handleProfileChange("surname", event.target.value)}
                error={profileErrors.surname}
                helperText="Первая буква заглавная, можно пробел и дефис."
              />
              <TextInput
                label="Имя"
                name="name"
                value={profileForm.name}
                onChange={(event) => handleProfileChange("name", event.target.value)}
                error={profileErrors.name}
                helperText="Первая буква заглавная, можно пробел и дефис."
              />
              <TextInput
                label="Отчество"
                name="fatherName"
                value={profileForm.fatherName}
                onChange={(event) => handleProfileChange("fatherName", event.target.value)}
                error={profileErrors.fatherName}
                helperText="Русские буквы, каждая часть с заглавной, можно пробел и дефис."
              />
              <div className="field">
                <span className="field-label">Пол</span>
                <div className="cabinet-radio-group" role="radiogroup" aria-label="Пол">
                  <label className="cabinet-radio">
                    <input
                      type="radio"
                      name="gender"
                      value="male"
                      checked={profileForm.gender === "male"}
                      onChange={() => handleProfileChange("gender", "male")}
                    />
                    <span>Муж</span>
                  </label>
                  <label className="cabinet-radio">
                    <input
                      type="radio"
                      name="gender"
                      value="female"
                      checked={profileForm.gender === "female"}
                      onChange={() => handleProfileChange("gender", "female")}
                    />
                    <span>Жен</span>
                  </label>
                </div>
                {profileErrors.gender ? (
                  <span className="field-helper field-helper-error">{profileErrors.gender}</span>
                ) : null}
              </div>
              <TextInput
                label="Город"
                name="city"
                value={profileForm.city}
                onChange={(event) => handleProfileChange("city", event.target.value)}
                error={profileErrors.city}
                helperText="Первая буква заглавная, можно пробел и дефис."
                list="profile-city-suggestions"
              />
              <datalist id="profile-city-suggestions">
                {citySuggestions.map((city) => (
                  <option key={city} value={city} />
                ))}
              </datalist>
              <TextInput
                label="Школа"
                name="school"
                value={profileForm.school}
                onChange={(event) => handleProfileChange("school", event.target.value)}
                error={profileErrors.school}
                list="profile-school-suggestions"
              />
              <datalist id="profile-school-suggestions">
                {schoolSuggestions.map((school) => (
                  <option key={school} value={school} />
                ))}
              </datalist>
              {activeUser?.role === "student" ? (
                <label className="field">
                  <span className="field-label">Класс</span>
                  <select
                    className={`field-input ${profileErrors.classGrade ? "field-input-error" : ""}`.trim()}
                    value={profileForm.classGrade}
                    onChange={(event) => handleProfileChange("classGrade", event.target.value)}
                  >
                    <option value="">Выберите класс</option>
                    {Array.from({ length: 12 }, (_, index) => String(index)).map((grade) => (
                      <option key={grade} value={grade}>
                        {grade}
                      </option>
                    ))}
                  </select>
                  {profileErrors.classGrade ? (
                    <span className="field-helper field-helper-error">{profileErrors.classGrade}</span>
                  ) : (
                    <span className="field-helper">Обязательно для ученика.</span>
                  )}
                </label>
              ) : null}
              {activeUser?.role === "teacher" ? (
                <TextInput
                  label="Предмет"
                  name="subject"
                  value={profileForm.subject}
                  onChange={(event) => handleProfileChange("subject", event.target.value)}
                  error={profileErrors.subject}
                  helperText="Только русские буквы."
                />
              ) : null}

              {profileMessage ? <div className="cabinet-alert">{profileMessage}</div> : null}
              <div className="cabinet-form-actions">
                <Button
                  type="submit"
                  className="cabinet-save-button cabinet-action-button"
                  isLoading={profileStatus === "saving"}
                >
                  Сохранить
                </Button>
                <Button
                  type="button"
                  className="cabinet-cancel-button cabinet-action-button"
                  onClick={handleProfileCancel}
                >
                  Отмена
                </Button>
              </div>
            </form>
          </section>

          <section className="cabinet-section" id="links">
            <div className="cabinet-section-heading">
              <h2>Сопровождение</h2>
            </div>
            {user.role === "student" ? (
              <div className="cabinet-grid">
                <div className="cabinet-card">
                  <h3>Добавить учителя вручную</h3>
                  <TextInput
                    label="ФИО учителя"
                    name="teacherName"
                    value={teacherName}
                    onChange={(event) => setTeacherName(event.target.value)}
                  />
                  <TextInput
                    label="Предмет"
                    name="teacherSubject"
                    value={teacherSubject}
                    onChange={(event) => setTeacherSubject(event.target.value)}
                  />
                  <Button type="button" className="cabinet-save-button-student" onClick={addTeacher}>
                    Добавить
                  </Button>
                </div>
                <div className="cabinet-card">
                  <h3>Запросить сопровождение учителя</h3>
                  <TextInput
                    label="Логин или email учителя"
                    name="teacherLink"
                    value={linkRequestValue}
                    onChange={(event) => setLinkRequestValue(event.target.value)}
                  />
                  <Button type="button" className="cabinet-save-button-student" onClick={sendLinkRequest}>
                    Отправить
                  </Button>
                  {linkStatusMessage ? <p className="cabinet-hint">{linkStatusMessage}</p> : null}
                </div>
                <div className="cabinet-card">
                  <h3>Мои учителя</h3>
                  <Table>
                    <thead>
                      <tr>
                        <th>№</th>
                        <th>ФИО учителя</th>
                        <th>Предмет</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {allTeacherEntries.length === 0 ? (
                        <tr>
                          <td colSpan={4}>Список пуст.</td>
                        </tr>
                      ) : (
                        allTeacherEntries.map((teacher, index) => (
                          <tr key={teacher.id}>
                            <td>{index + 1}</td>
                            <td
                              className={
                                teacher.kind === "manual"
                                  ? "cabinet-teacher-manual"
                                  : "cabinet-teacher-linked"
                              }
                            >
                              {teacher.label}
                            </td>
                            <td
                              className={
                                teacher.kind === "manual"
                                  ? "cabinet-teacher-manual"
                                  : "cabinet-teacher-linked"
                              }
                            >
                              {teacher.sublabel ?? "—"}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="cabinet-delete-button"
                                aria-label={`Удалить ${teacher.label}`}
                                onClick={() =>
                                  openDeletePrompt(
                                    teacher.kind === "manual"
                                      ? {
                                          kind: "manual-teacher",
                                          manualId: teacher.manualId,
                                          name: teacher.label
                                        }
                                      : {
                                          kind: "linked-teacher",
                                          teacherId: teacher.teacherId,
                                          name: teacher.label
                                        }
                                  )
                                }
                              >
                                <TrashIcon />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </Table>
                </div>
              </div>
            ) : (
              <div className="cabinet-grid">
                <div className="cabinet-card">
                  <h3>Добавить ученика</h3>
                  <TextInput
                    label="Логин или email ученика"
                    name="studentLink"
                    value={linkRequestValue}
                    onChange={(event) => setLinkRequestValue(event.target.value)}
                  />
                  <Button type="button" className="cabinet-save-button" onClick={sendLinkRequest}>
                    Отправить
                  </Button>
                  {linkStatusMessage ? <p className="cabinet-hint">{linkStatusMessage}</p> : null}
                </div>
                <div className="cabinet-card">
                  <h3>Привязанные ученики</h3>
                  <Table>
                    <thead>
                      <tr>
                        <th>№</th>
                        <th>ФИО</th>
                        <th>Класс</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {studentEntries.length === 0 ? (
                        <tr>
                          <td colSpan={4}>Нет подтвержденных учеников.</td>
                        </tr>
                      ) : (
                        studentEntries.map((student, index) => (
                          <tr key={student.id}>
                            <td>{index + 1}</td>
                            <td>
                              <Link to={student.href} className="cabinet-link" onClick={handleStudentLinkClick}>
                                {student.label}
                              </Link>
                            </td>
                            <td>
                              {student.classGrade !== null && student.classGrade !== undefined
                                ? `${student.classGrade}`
                                : "—"}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="cabinet-delete-button"
                                aria-label={`Удалить ${student.label}`}
                                onClick={() =>
                                  openDeletePrompt({
                                    kind: "student",
                                    studentId: student.studentId,
                                    name: student.label
                                  })
                                }
                              >
                                <TrashIcon />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </Table>
                </div>
              </div>
            )}
          </section>
          <div className="cabinet-logout">
            <Button type="button" className="cabinet-logout-button" onClick={handleLogoutClick}>
              Выйти
            </Button>
          </div>
        </main>
      </LayoutShell>
      <nav className="cabinet-mobile-nav" aria-label="Навигация кабинета">
        {mobileNavItems.map((item) => (
          <a key={item.href} href={item.href} className="cabinet-mobile-link">
            {item.label}
          </a>
        ))}
      </nav>

      <Modal
        isOpen={isEmailWarningOpen}
        onClose={() => setIsEmailWarningOpen(false)}
        title="Подтвердите email"
      >
        <p>
          Необходимо подтвердить email. На ваш электронный почтовый ящик {profileForm.email} выслано письмо с
          ссылкой подтверждением. Пользователи с неподтвержденным email не могут участвовать в олимпиаде.
        </p>
      </Modal>

      <Modal
        isOpen={isLinkPromptOpen}
        onClose={() => setIsLinkPromptOpen(false)}
        title="Запрос на связь учитель — ученик"
      >
        <div className="cabinet-link-modal">
          <p className="cabinet-hint">Вам поступил запрос на сопровождение:</p>
          <div className="cabinet-link-table">
            {pendingLinks.map((link, index) => {
              const requesterParts =
                user.role === "teacher"
                  ? [link.student_surname, link.student_name, link.student_father_name]
                  : [link.teacher_surname, link.teacher_name, link.teacher_father_name];
              const requesterLabel = requesterParts.filter(Boolean).join(" ");
              const label =
                requesterLabel ||
                (user.role === "teacher"
                  ? `Ученик #${link.student_id}`
                  : `Учитель #${link.teacher_id}`);
              const decision = linkDecisions[link.id] ?? null;
              return (
                <div className="cabinet-link-row" key={link.id}>
                  <span>{index + 1}</span>
                  <span>{label}</span>
                  <button
                    type="button"
                    className={`cabinet-decision-button cabinet-decision-approve ${decision === "approve" ? "is-active" : ""}`.trim()}
                    onClick={() => handleLinkDecision(link.id, "approve")}
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    className={`cabinet-decision-button cabinet-decision-reject ${decision === "reject" ? "is-active" : ""}`.trim()}
                    onClick={() => handleLinkDecision(link.id, "reject")}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
          {linkPromptStatus === "error" ? (
            <p className="cabinet-hint cabinet-hint-error">Не удалось сохранить выбор.</p>
          ) : null}
          <div className="cabinet-modal-actions">
            <Button
              type="button"
              className="cabinet-save-button"
              onClick={handleLinkPromptSave}
              disabled={!Object.values(linkDecisions).some(Boolean) || linkPromptStatus === "saving"}
            >
              ОК
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isLogoutPromptOpen}
        onClose={() => setIsLogoutPromptOpen(false)}
        title="Несохраненные изменения"
      >
        <p>Есть несохраненные данные. Выйти без сохранения?</p>
        <div className="cabinet-modal-actions">
          <Button type="button" className="cabinet-logout-button" onClick={handleLogoutConfirm}>
            Выход
          </Button>
          <Button type="button" className="cabinet-cancel-button" onClick={() => setIsLogoutPromptOpen(false)}>
            Отмена
          </Button>
        </div>
      </Modal>

      <Modal isOpen={Boolean(deleteTarget)} onClose={closeDeletePrompt} title="Удаление">
        <p>
          {deleteTarget
            ? `Вы действительно хотите удалить ${deleteTarget.name} из списка сопровождения`
            : ""}
        </p>
        {deleteStatus === "error" ? (
          <p className="cabinet-hint cabinet-hint-error">Не удалось удалить запись.</p>
        ) : null}
        <div className="cabinet-modal-actions">
          <Button
            type="button"
            className="cabinet-delete-confirm"
            onClick={handleDeleteConfirm}
            isLoading={deleteStatus === "deleting"}
          >
            Да
          </Button>
          <Button type="button" variant="outline" onClick={closeDeletePrompt}>
            Нет
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={attemptViewStatus === "loading" || Boolean(attemptView) || Boolean(attemptViewError)}
        onClose={closeAttemptView}
        title={attemptView?.olympiad_title ?? "Просмотр попытки"}
        className="cabinet-attempt-modal"
        closeOnBackdrop={false}
      >
        {attemptViewStatus === "loading" ? <p>Загрузка...</p> : null}
        {attemptViewError ? <p className="cabinet-alert">{attemptViewError}</p> : null}
        {attemptView ? (
          <div className="cabinet-attempt">
            <p className="cabinet-hint">{attemptView.olympiad_title}</p>
            <div className="cabinet-attempt-tasks">
              {attemptView.tasks.map((task, index) => {
                const imageUrl = task.image_key ? attemptImageUrls[task.image_key] : null;
                const imagePosition = task.payload?.image_position ?? "after";
                return (
                  <div className="cabinet-attempt-task" key={task.task_id}>
                    <h4>
                      Задание {index + 1}. {task.title}
                    </h4>
                    {imageUrl && imagePosition === "before" ? (
                      <img src={imageUrl} alt="Иллюстрация" className="cabinet-attempt-image" />
                    ) : null}
                    <div className="cabinet-attempt-content">{task.content}</div>
                    {imageUrl && imagePosition !== "before" ? (
                      <img src={imageUrl} alt="Иллюстрация" className="cabinet-attempt-image" />
                    ) : null}
                    <div className="cabinet-attempt-answer">
                      <span>Ответ:</span>
                      <div className="cabinet-answer">{formatAnswer(task.current_answer ?? task.answer_payload)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </Modal>

      {verifySuccessModal}

      <Modal
        isOpen={Boolean(pendingResultsMessage)}
        onClose={() => setPendingResultsMessage(null)}
        title="Информация"
      >
        <p>{pendingResultsMessage}</p>
      </Modal>
    </div>
  );
}
