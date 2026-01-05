import React from "react";

export type ButtonVariant = "primary" | "outline" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
};

export function Button({
  variant = "primary",
  size = "md",
  isLoading = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || isLoading;
  const classes = [
    "btn",
    `btn-${variant}`,
    `btn-${size}`,
    isLoading ? "btn-loading" : "",
    className ?? ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={classes} disabled={isDisabled} {...rest}>
      <span className="btn-label">{children}</span>
      {isLoading ? <span className="btn-spinner" aria-hidden="true" /> : null}
    </button>
  );
}
