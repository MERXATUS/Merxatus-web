"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GameBtn } from "@/app/_components/gameUi";
import {
  MINION_STAT_KEYS,
  MINION_STAT_LABELS,
  type MinionBaseStats,
  type MinionStatKey,
} from "@/shared/minionBaseStats";
import { MINION_LEVEL_RULES } from "@/shared/minionLevel";
import { useHoldRepeat } from "@/shared/useHoldRepeat";
type DraftStats = Record<MinionStatKey, number>;

function emptyDraft(): DraftStats {
  return { strength: 0, agility: 0, intelligence: 0, endurance: 0 };
}

function draftTotal(draft: DraftStats) {
  return MINION_STAT_KEYS.reduce((n, k) => n + draft[k], 0);
}

function XpSection(props: {
  level: number;
  experience: number;
  xpToNext: number;
  xpProgress: number;
  isMaxLevel: boolean;
  compact?: boolean;
  canPromoteFirst?: boolean;
  canPromoteSecond?: boolean;
  nextPromotionLabel?: string | null;
  promoteBusy?: boolean;
  onPromote?: () => void | Promise<void>;
}) {
  const {
    level,
    experience,
    xpToNext,
    xpProgress,
    isMaxLevel,
    compact,
    canPromoteFirst,
    canPromoteSecond,
    nextPromotionLabel,
    promoteBusy,
    onPromote,
  } = props;
  const showPromote = !!(canPromoteFirst || canPromoteSecond);

  return (
    <div className="minion-stat-allocate__xp-block">
      <div className="minion-stat-allocate__xp-head">
        <div className="minion-stat-allocate__xp-head-left">
          <span className="minion-stat-allocate__level-badge">Lv {level}</span>
          {showPromote ? (
            <GameBtn
              variant="primary"
              className="minion-stat-allocate__promote-btn"
              disabled={!!promoteBusy}
              onClick={() => void onPromote?.()}
            >
              {canPromoteSecond ? "2차 전직" : "전직"}
            </GameBtn>
          ) : null}
        </div>
        {isMaxLevel ? (
          <span className="minion-stat-allocate__max-badge">MAX</span>
        ) : (
          <span className="minion-stat-allocate__xp-label">경험치</span>
        )}
      </div>
      {showPromote && nextPromotionLabel && !compact ? (
        <p className="minion-stat-allocate__promote-hint">{nextPromotionLabel}</p>
      ) : null}
      {!isMaxLevel ? (
        <>
          <div
            className="minion-stat-allocate__xp-bar"
            role="progressbar"
            aria-valuenow={experience}
            aria-valuemax={xpToNext}
          >
            <div
              className="minion-stat-allocate__xp-fill"
              style={{ width: `${Math.max(4, Math.round(xpProgress * 100))}%` }}
            />
          </div>
          <div className="minion-stat-allocate__xp-text">
            {experience.toLocaleString()} / {xpToNext.toLocaleString()} EXP
          </div>
        </>
      ) : null}
    </div>
  );
}

function StatStepButton(props: {
  delta: 1 | -1;
  disabled: boolean;
  onStep: () => boolean;
  ariaLabel: string;
  className: string;
}) {
  const hold = useHoldRepeat(props.onStep, props.disabled);
  return (
    <button
      type="button"
      className={props.className}
      disabled={props.disabled}
      aria-label={props.ariaLabel}
      onPointerDown={hold.onPointerDown}
      onPointerUp={hold.onPointerUp}
      onPointerCancel={hold.onPointerCancel}
    >
      {props.delta > 0 ? "+" : "−"}
    </button>
  );
}

function StatAllocateCard(props: {
  statKey: MinionStatKey;
  baseStats: MinionBaseStats;
  draft: DraftStats;
  setDraft: React.Dispatch<React.SetStateAction<DraftStats>>;
  unspentStatPoints: number;
  busy?: boolean;
  canAllocate: boolean;
}) {
  const { statKey: key, baseStats, draft, setDraft, unspentStatPoints, busy, canAllocate } = props;
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const add = draft[key];
  const cur = baseStats[key];
  const preview = Math.min(MINION_LEVEL_RULES.maxStatPerAttribute, cur + add);
  const atCap = preview >= MINION_LEVEL_RULES.maxStatPerAttribute;
  const spent = draftTotal(draft);
  const remaining = unspentStatPoints - spent;
  const changed = add > 0;

  const tryBump = useCallback(
    (delta: 1 | -1) => {
      const prev = draftRef.current;
      const next = { ...prev };
      const curDraft = next[key];
      if (delta > 0) {
        const rem = unspentStatPoints - draftTotal(prev);
        if (rem <= 0) return false;
        if (baseStats[key] + curDraft >= MINION_LEVEL_RULES.maxStatPerAttribute) return false;
        next[key] = curDraft + 1;
      } else {
        if (curDraft <= 0) return false;
        next[key] = curDraft - 1;
      }
      setDraft(next);
      return true;
    },
    [baseStats, key, setDraft, unspentStatPoints],
  );

  const tryPlus = useCallback(() => tryBump(1), [tryBump]);
  const tryMinus = useCallback(() => tryBump(-1), [tryBump]);

  if (!canAllocate) {
    return (
      <div className="minion-stat-allocate__inline-stat">
        <span className="minion-stat-allocate__inline-label">{MINION_STAT_LABELS[key]}</span>
        <span className="minion-stat-allocate__inline-value">{cur}</span>
      </div>
    );
  }

  return (
    <div
      className={[
        "minion-stat-allocate__card",
        changed ? "minion-stat-allocate__card--changed" : "",
        "minion-stat-allocate__card--interactive",
      ].join(" ")}
    >
      <div className="minion-stat-allocate__card-label">{MINION_STAT_LABELS[key]}</div>
      <div className="minion-stat-allocate__card-value">
        {changed ? (
          <>
            <span className="minion-stat-allocate__card-old">{cur}</span>
            <span className="minion-stat-allocate__card-arrow">→</span>
            <span className="minion-stat-allocate__card-new">{preview}</span>
          </>
        ) : (
          <span>{cur}</span>
        )}
      </div>
      <div className="minion-stat-allocate__card-actions">
        <StatStepButton
          delta={-1}
          className="minion-stat-allocate__step"
          disabled={!!busy || add <= 0}
          onStep={tryMinus}
          ariaLabel={`${MINION_STAT_LABELS[key]} 1 감소`}
        />
        {add > 0 ? (
          <span className="minion-stat-allocate__draft">+{add}</span>
        ) : (
          <span className="minion-stat-allocate__draft minion-stat-allocate__draft--empty">·</span>
        )}
        <StatStepButton
          delta={1}
          className="minion-stat-allocate__step minion-stat-allocate__step--plus"
          disabled={!!busy || remaining <= 0 || atCap}
          onStep={tryPlus}
          ariaLabel={`${MINION_STAT_LABELS[key]} 1 증가`}
        />
      </div>
    </div>
  );
}

export function MinionStatAllocatePanel(props: {
  minionId: string;
  baseStats: MinionBaseStats;
  unspentStatPoints: number;
  level: number;
  experience: number;
  xpToNext: number;
  xpProgress: number;
  isMaxLevel: boolean;
  canPromoteFirst?: boolean;
  canPromoteSecond?: boolean;
  nextPromotionLabel?: string | null;
  busy?: boolean;
  promoteBusy?: boolean;
  compact?: boolean;
  onApply: (stats: Partial<Record<MinionStatKey, number>>) => void | Promise<void>;
  onPromote?: () => void | Promise<void>;
}) {
  const {
    baseStats,
    unspentStatPoints,
    level,
    experience,
    xpToNext,
    xpProgress,
    isMaxLevel,
    canPromoteFirst,
    canPromoteSecond,
    nextPromotionLabel,
    busy,
    promoteBusy,
    compact,
    onApply,
    onPromote,
  } = props;

  const [draft, setDraft] = useState<DraftStats>(emptyDraft);
  const canAllocate = unspentStatPoints > 0;

  useEffect(() => {
    setDraft(emptyDraft());
  }, [props.minionId, unspentStatPoints]);

  const spent = draftTotal(draft);
  const remaining = unspentStatPoints - spent;

  return (
    <div
      className={[
        "minion-stat-allocate",
        canAllocate ? "minion-stat-allocate--active" : "",
        compact ? "minion-stat-allocate--compact" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <XpSection
        level={level}
        experience={experience}
        xpToNext={xpToNext}
        xpProgress={xpProgress}
        isMaxLevel={isMaxLevel}
        compact={compact}
        canPromoteFirst={canPromoteFirst}
        canPromoteSecond={canPromoteSecond}
        nextPromotionLabel={nextPromotionLabel}
        promoteBusy={promoteBusy}
        onPromote={onPromote}
      />

      {canAllocate ? (
        <div className="minion-stat-allocate__allocate-head">
          <div>
            <div className="minion-stat-allocate__title">스탯 배분</div>
            <div className="minion-stat-allocate__points">
              <span className="minion-stat-allocate__points-badge">{remaining}</span>
              <span className="minion-stat-allocate__points-label">포인트 남음</span>
            </div>
          </div>
          <GameBtn variant="primary" disabled={!!busy || spent <= 0} onClick={() => void onApply(draft)}>
            적용
          </GameBtn>
        </div>
      ) : null}

      <div
        className={compact && !canAllocate ? "minion-stat-allocate__inline-stats" : "minion-stat-allocate__grid"}
        aria-label="기본 스탯"
      >
        {MINION_STAT_KEYS.map((key) => {
          if (compact && !canAllocate) {
            return (
              <div key={key} className="minion-stat-allocate__inline-stat">
                <span className="minion-stat-allocate__inline-label">{MINION_STAT_LABELS[key]}</span>
                <span className="minion-stat-allocate__inline-value">{baseStats[key]}</span>
              </div>
            );
          }

          return (
            <StatAllocateCard
              key={key}
              statKey={key}
              baseStats={baseStats}
              draft={draft}
              setDraft={setDraft}
              unspentStatPoints={unspentStatPoints}
              busy={busy}
              canAllocate={canAllocate}
            />
          );
        })}
      </div>
    </div>
  );
}
