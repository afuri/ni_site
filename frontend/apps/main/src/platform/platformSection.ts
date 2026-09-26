import type { PlatformSection } from "./PlatformShell";

const sections: Record<string, PlatformSection> = {
  results: "results",
  profile: "profile",
  notifications: "notifications"
};

export function resolvePlatformSection(pathname: string): PlatformSection | null {
  const suffix = pathname.replace(/^\/platform\/?/, "");
  if (!suffix) return "home";
  if (suffix.includes("/")) return null;
  return Object.prototype.hasOwnProperty.call(sections, suffix) ? sections[suffix] : null;
}
