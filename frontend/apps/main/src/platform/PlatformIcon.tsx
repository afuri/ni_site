import React from "react";

export type PlatformIconName =
  | "home"
  | "results"
  | "profile"
  | "notifications"
  | "coins"
  | "trophy"
  | "arrow"
  | "calendar"
  | "tasks"
  | "help"
  | "info"
  | "logout";

const paths: Record<PlatformIconName, React.ReactNode> = {
  home: <><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10.5V20h13v-9.5M9 20v-6h6v6" /></>,
  results: <><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" /></>,
  profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  notifications: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
  coins: <><circle cx="12" cy="12" r="9" /><path d="M14.5 7.5h-3a2.5 2.5 0 0 0 0 5h1a2.5 2.5 0 0 1 0 5h-3M12 5v14" /></>,
  trophy: <><path d="M8 4h8v4a4 4 0 0 1-8 0V4Z" /><path d="M8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4M12 12v5M8 20h8M10 17h4" /></>,
  arrow: <path d="M5 12h14M14 7l5 5-5 5" />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></>,
  tasks: <path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" />,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .5-1.5 1-1.5 2M12 16h.01" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
  logout: <><path d="M10 4H5v16h5M14 8l4 4-4 4m4-4H9" /></>
};

export function PlatformIcon({ name, size = 20 }: { name: PlatformIconName; size?: number }) {
  return (
    <svg
      className="platform-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
