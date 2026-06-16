"use client";

import type { CombatReport } from "@/shared/combatReport";
import { formatCombatDuration } from "@/shared/combatReport";

type Props = {
  report: CombatReport | null;
  compact?: boolean;
  title?: string;
  className?: string;
};

function barPct(value: number, max: number) {
  if (max <= 0) return 0;
  return Math.max(4, Math.round((value / max) * 100));
}

export function CombatReportPanel(props: Props) {
  const { report, compact, title = "전투 리포트", className } = props;
  if (!report || report.fighters.length === 0) return null;

  const maxDealt = Math.max(1, ...report.fighters.map((f) => f.dealt));
  const maxTaken = Math.max(1, ...report.fighters.map((f) => f.taken));
  const outcomeLabel = report.outcome === "WIN" ? "승리" : "패배";

  return (
    <div className={`combat-report${compact ? " combat-report--compact" : ""}${className ? ` ${className}` : ""}`}>
      <div className="combat-report__head">
        <span className="combat-report__title">{title}</span>
        <span className={`combat-report__outcome combat-report__outcome--${report.outcome.toLowerCase()}`}>
          {outcomeLabel}
        </span>
        {report.durationMs > 0 ? (
          <span className="combat-report__duration">{formatCombatDuration(report.durationMs)}</span>
        ) : null}
      </div>

      <div className="combat-report__section">
        <p className="combat-report__label">가한 피해</p>
        {report.fighters.map((f) => (
          <div key={`dealt-${f.fighterId}`} className="combat-report__row">
            <span className="combat-report__name">{f.label}</span>
            <div className="combat-report__bar-track">
              <div
                className={`combat-report__bar-fill combat-report__bar-fill--dealt${f.side === "enemy" ? " combat-report__bar-fill--enemy" : ""}`}
                style={{ width: `${barPct(f.dealt, maxDealt)}%` }}
              />
            </div>
            <span className="combat-report__value">{f.dealt.toLocaleString()}</span>
          </div>
        ))}
      </div>

      <div className="combat-report__section">
        <p className="combat-report__label">받은 피해</p>
        {report.fighters.map((f) => (
          <div key={`taken-${f.fighterId}`} className="combat-report__row">
            <span className="combat-report__name">{f.label}</span>
            <div className="combat-report__bar-track">
              <div
                className="combat-report__bar-fill combat-report__bar-fill--taken"
                style={{ width: `${barPct(f.taken, maxTaken)}%` }}
              />
            </div>
            <span className="combat-report__value">{f.taken.toLocaleString()}</span>
          </div>
        ))}
      </div>

      {report.fighters.some((f) => f.healed > 0) ? (
        <div className="combat-report__section combat-report__section--heal">
          <p className="combat-report__label">회복</p>
          {report.fighters
            .filter((f) => f.healed > 0)
            .map((f) => (
              <div key={`heal-${f.fighterId}`} className="combat-report__row combat-report__row--plain">
                <span className="combat-report__name">{f.label}</span>
                <span className="combat-report__value combat-report__value--heal">+{f.healed.toLocaleString()}</span>
              </div>
            ))}
        </div>
      ) : null}
    </div>
  );
}
