import React from "react";
import { Button, type ButtonProps } from "@ui";

type ActionIcon = "copy" | "edit-copy" | "preview" | "archive" | "delete" | "return-draft";

type Props = Omit<ButtonProps, "children" | "aria-label" | "title"> & {
  icon: ActionIcon;
  label: string;
  tooltip?: string;
};

const icons: Record<ActionIcon, React.ReactNode> = {
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  "edit-copy": <><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="m16 3 5 5M10 14l2-6 6-6a2.1 2.1 0 0 1 3 3l-6 6-5 3Z" /></>,
  preview: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  archive: <><rect x="3" y="3" width="18" height="4" rx="1" /><path d="M5 7v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7M10 11h4" /></>,
  "return-draft": <><path d="M14 2H6a2 2 0 0 0-2 2v5M14 2v6h6l-6-6ZM20 8v12a2 2 0 0 1-2 2h-6M4 12l-3 3 3 3M1 15h7a4 4 0 0 1 4 4M9 11h5" /></>,
  delete: <><path d="M3 6h18M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M5 6l1 14a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1l1-14M10 10v7M14 10v7" /></>
};

export function AdminIconButton({ icon, label, tooltip = label, className, ...props }: Props) {
  return <span className="admin-icon-action" title={tooltip}>
    <Button type="button" size="sm" variant="outline" {...props}
      className={`admin-icon-button ${className ?? ""}`.trim()} aria-label={label} title={tooltip}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
        strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        {icons[icon]}
      </svg>
    </Button>
  </span>;
}
