"use client";

type Props = {
  clearChance: number;
  pendingSummary?: string;
  floorLabel: string;
  forfeitHint?: string;
  className?: string;
};

export function PushLuckRiskBar(props: Props) {
  const pct = Math.round(Math.max(0, Math.min(1, props.clearChance)) * 100);
  const risk = pct >= 70 ? "low" : pct >= 45 ? "mid" : "high";

  return (
    <div className={`push-luck-risk ${props.className ?? ""}`.trim()} role="status">
      <div className="push-luck-risk__head">
        <span className="push-luck-risk__label">{props.floorLabel}</span>
        <span className={`push-luck-risk__chance push-luck-risk__chance--${risk}`}>
          클리어 확률 {pct}%
        </span>
      </div>
      <div className="push-luck-risk__track" aria-hidden>
        <div
          className={`push-luck-risk__fill push-luck-risk__fill--${risk}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {props.pendingSummary ? (
        <p className="push-luck-risk__pending">누적: {props.pendingSummary}</p>
      ) : null}
      {props.forfeitHint ? (
        <p className="push-luck-risk__warn">{props.forfeitHint}</p>
      ) : null}
    </div>
  );
}
