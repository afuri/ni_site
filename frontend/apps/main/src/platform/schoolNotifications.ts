import type { SchoolStatus } from "@api";

export type SchoolNotification = {
  id: string;
  title: string;
  text: string;
};

const notificationsByStatus: Partial<Record<SchoolStatus, Omit<SchoolNotification, "id">>> = {
  missing: {
    title: "Укажите школу",
    text: "Выберите школу в профиле или отправьте заявку на её добавление, чтобы участвовать в олимпиадах."
  },
  submission_pending: {
    title: "Заявка на школу рассматривается",
    text: "Вы можете участвовать в олимпиадах. Диплом станет доступен после подтверждения школы администратором."
  },
  submission_rejected: {
    title: "Заявку на школу нужно исправить",
    text: "Откройте профиль, проверьте сведения о школе и отправьте новую заявку."
  }
};

export function getSchoolNotifications(status: SchoolStatus): SchoolNotification[] {
  const notification = notificationsByStatus[status];
  return notification ? [{ id: `school-${status}`, ...notification }] : [];
}
