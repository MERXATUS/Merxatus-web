import type { ReactNode } from "react";

export type GameAccent =
  | "default"
  | "gold"
  | "emerald"
  | "sky"
  | "violet"
  | "rose"
  | "amber"
  | "indigo";

const accentBar: Record<GameAccent, string> = {
  default: "game-card-accent-default",
  gold: "game-card-accent-gold",
  emerald: "game-card-accent-emerald",
  sky: "game-card-accent-sky",
  violet: "game-card-accent-violet",
  rose: "game-card-accent-rose",
  amber: "game-card-accent-amber",
  indigo: "game-card-accent-indigo",
};

export function GamePanel(props: { children: ReactNode; className?: string }) {
  return <div className={`game-panel ${props.className ?? ""}`.trim()}>{props.children}</div>;
}

export function GamePanelTitle(props: { children: ReactNode; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="game-label">{props.children}</div>
      {props.hint ? <span className="text-[10px] font-medium text-[var(--game-muted)]">{props.hint}</span> : null}
    </div>
  );
}

export function GameStat(props: { label: string; value: ReactNode; highlight?: boolean }) {
  return (
    <div className={`game-stat ${props.highlight ? "game-stat-highlight" : ""}`.trim()}>
      <div className="game-stat-label">{props.label}</div>
      <div className="game-stat-value">{props.value}</div>
    </div>
  );
}

export function GameCard(props: {
  title: string;
  subtitle: string;
  metric?: string;
  accent?: GameAccent;
  icon?: ReactNode;
  size?: "main" | "default" | "compact";
  ctaLabel?: string;
  className?: string;
  onClick: () => void;
}) {
  const accent = props.accent ?? "default";
  const size = props.size ?? "default";
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`game-card group ${accentBar[accent]} game-card--${size} ${props.className ?? ""}`.trim()}
    >
      <div className="flex items-start gap-3">
        {props.icon ? (
          <div className="game-card-icon shrink-0" aria-hidden>
            {props.icon}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="game-card-title">{props.title}</div>
              <div className="game-card-sub">{props.subtitle}</div>
            </div>
            {props.metric ? <div className="game-card-metric shrink-0">{props.metric}</div> : null}
          </div>
          <div className="game-card-cta">{props.ctaLabel ?? "열기 →"}</div>
        </div>
      </div>
    </button>
  );
}

export function GameBtn(props: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "ghost" | "gold";
  className?: string;
  disabled?: boolean;
}) {
  const v = props.variant ?? "primary";
  const cls =
    v === "gold" ? "game-btn game-btn-gold" : v === "ghost" ? "game-btn game-btn-ghost" : "game-btn game-btn-primary";
  return (
    <button
      type={props.type ?? "button"}
      onClick={props.onClick}
      disabled={props.disabled}
      className={`${cls} ${props.className ?? ""}`.trim()}
    >
      {props.children}
    </button>
  );
}
