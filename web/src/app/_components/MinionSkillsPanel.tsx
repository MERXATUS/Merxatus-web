"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GameBtn } from "@/app/_components/gameUi";
import type { MinionSkillView } from "@/shared/minionSkills";
import { useHoldRepeat } from "@/shared/useHoldRepeat";

type SkillDraft = Record<string, number>;

function draftTotal(draft: SkillDraft) {
  return Object.values(draft).reduce((n, v) => n + (v > 0 ? v : 0), 0);
}

function emptyDraft(skills: MinionSkillView[]): SkillDraft {
  const out: SkillDraft = {};
  for (const s of skills) out[s.id] = 0;
  return out;
}

function SkillStepButton(props: {
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

function SkillAllocateCard(props: {
  skill: MinionSkillView;
  draft: SkillDraft;
  setDraft: React.Dispatch<React.SetStateAction<SkillDraft>>;
  unspentSkillPoints: number;
  busy?: boolean;
  canAllocate: boolean;
}) {
  const { skill, draft, setDraft, unspentSkillPoints, busy, canAllocate } = props;
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const add = draft[skill.id] ?? 0;
  const cur = skill.level;
  const preview = cur + add;
  const atCap = preview >= skill.maxLevel;
  const spent = draftTotal(draft);
  const remaining = unspentSkillPoints - spent;
  const changed = add > 0;
  const locked = !skill.unlocked && add <= 0;

  const tryBump = useCallback(
    (delta: 1 | -1) => {
      const prev = draftRef.current;
      const next = { ...prev };
      const curDraft = next[skill.id] ?? 0;
      if (delta > 0) {
        const rem = unspentSkillPoints - draftTotal(prev);
        if (rem <= 0) return false;
        if (!skill.unlocked && curDraft <= 0 && rem < 1) return false;
        if (skill.level + curDraft >= skill.maxLevel) return false;
        next[skill.id] = curDraft + 1;
      } else {
        if (curDraft <= 0) return false;
        next[skill.id] = curDraft - 1;
      }
      setDraft(next);
      return true;
    },
    [setDraft, skill, unspentSkillPoints],
  );

  const tryPlus = useCallback(() => tryBump(1), [tryBump]);
  const tryMinus = useCallback(() => tryBump(-1), [tryBump]);

  if (!canAllocate) {
    return (
      <li className="minion-skills__item">
        <div className="minion-skills__item-head">
          <span className="minion-skills__name">
            {skill.name}
            <span className="minion-skills__tier">{skill.tierLabel}</span>
          </span>
          <span className="minion-skills__level">
            {skill.unlocked ? `Lv ${cur}` : "미습득"}
          </span>
        </div>
        <p className="minion-skills__desc">{skill.unlocked ? skill.effectSummary : skill.description}</p>
        {!skill.unlocked ? <p className="minion-skills__hint">{skill.acquireHint}</p> : null}
      </li>
    );
  }

  return (
    <li
      className={[
        "minion-skills__item",
        changed ? "minion-skills__item--changed" : "",
        locked ? "minion-skills__item--locked" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="minion-skills__item-head">
        <span className="minion-skills__name">
          {skill.name}
          <span className="minion-skills__tier">{skill.tierLabel}</span>
        </span>
        <span className="minion-skills__level">
          {changed ? (
            <>
              <span className="minion-skills__level-old">Lv {cur}</span>
              <span className="minion-skills__level-arrow">→</span>
              <span className="minion-skills__level-new">Lv {preview}</span>
            </>
          ) : skill.unlocked ? (
            `Lv ${cur}`
          ) : (
            "미습득"
          )}
        </span>
      </div>
      <p className="minion-skills__desc">{skill.description}</p>
      {skill.unlocked && skill.effectSummary ? (
        <p className="minion-skills__effect">{skill.effectSummary}</p>
      ) : (
        <p className="minion-skills__hint">{skill.acquireHint}</p>
      )}
      <div className="minion-skills__card-actions">
        <SkillStepButton
          delta={-1}
          className="minion-skills__step"
          disabled={!!busy || add <= 0}
          onStep={tryMinus}
          ariaLabel={`${skill.name} 1 감소`}
        />
        {add > 0 ? (
          <span className="minion-skills__draft">+{add}</span>
        ) : (
          <span className="minion-skills__draft minion-skills__draft--empty">·</span>
        )}
        <SkillStepButton
          delta={1}
          className="minion-skills__step minion-skills__step--plus"
          disabled={!!busy || remaining <= 0 || atCap}
          onStep={tryPlus}
          ariaLabel={`${skill.name} 1 증가`}
        />
      </div>
    </li>
  );
}

export function MinionSkillsPanel(props: {
  minionId: string;
  skills: MinionSkillView[];
  unspentSkillPoints: number;
  compact?: boolean;
  busy?: boolean;
  onApply?: (allocation: SkillDraft) => void | Promise<void>;
}) {
  const { skills, unspentSkillPoints, compact, busy, onApply } = props;
  if (skills.length === 0) return null;

  const [draft, setDraft] = useState<SkillDraft>(() => emptyDraft(skills));
  const canAllocate = unspentSkillPoints > 0 && !!onApply;

  useEffect(() => {
    setDraft(emptyDraft(skills));
  }, [props.minionId, unspentSkillPoints]);

  const spent = draftTotal(draft);
  const remaining = unspentSkillPoints - spent;

  if (compact && !canAllocate) {
    return (
      <div className="minion-skills minion-skills--compact">
        <span className="minion-skills__title">스킬</span>
        <ul className="minion-skills__chips">
          {skills.map((skill) => (
            <li key={skill.id} className="minion-skills__chip">
              <span className="minion-skills__chip-tier">{skill.tierLabel}</span>
              {skill.name} {skill.unlocked ? `Lv${skill.level}` : "—"}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className={["minion-skills", canAllocate ? "minion-skills--active" : ""].filter(Boolean).join(" ")}>
      <div className="minion-skills__head">
        <div className="minion-skills__title">스킬</div>
        {canAllocate ? (
          <div className="minion-skills__allocate-head">
            <div className="minion-skills__points">
              <span className="minion-skills__points-badge">{remaining}</span>
              <span className="minion-skills__points-label">포인트 남음</span>
            </div>
            <GameBtn variant="primary" disabled={!!busy || spent <= 0} onClick={() => void onApply?.(draft)}>
              적용
            </GameBtn>
          </div>
        ) : null}
      </div>
      <ul className="minion-skills__list">
        {skills.map((skill) => (
          <SkillAllocateCard
            key={skill.id}
            skill={skill}
            draft={draft}
            setDraft={setDraft}
            unspentSkillPoints={unspentSkillPoints}
            busy={busy}
            canAllocate={canAllocate}
          />
        ))}
      </ul>
    </div>
  );
}
