import React, { useEffect, useMemo, useState } from "react";

type CountdownProps = {
  targetIso: string;
  label?: string;
  className?: string;
};

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return {
    days,
    hours,
    minutes,
    seconds
  };
}

export function Countdown({ targetIso, label, className }: CountdownProps) {
  const target = useMemo(() => new Date(targetIso).getTime(), [targetIso]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const remaining = formatDuration(target - now);

  return (
    <div className={`countdown ${className ?? ""}`.trim()}>
      {label ? <span className="countdown-label">{label}</span> : null}
      <div className="countdown-timer" aria-live="polite">
        <span>{String(remaining.days).padStart(2, "0")}д</span>
        <span>{String(remaining.hours).padStart(2, "0")}ч</span>
        <span>{String(remaining.minutes).padStart(2, "0")}м</span>
        <span>{String(remaining.seconds).padStart(2, "0")}с</span>
      </div>
    </div>
  );
}
