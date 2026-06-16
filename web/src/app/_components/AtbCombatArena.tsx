"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { CombatPortrait } from "@/app/_components/CombatPortrait";
import type { AtbCombatEvent, AtbCombatSnapshot, AtbFighterView } from "@/shared/atbCombat";
import { ATB_ROW_LABEL } from "@/shared/atbCombat";
import {
  minionPortraitView,
  monsterIdFromDisplayName,
  monsterPortraitView,
} from "@/shared/combatPortrait";

type FloatKind = "damage" | "heal" | "lifesteal" | "crit" | "extra";

type FloatText = {
  id: number;
  targetId: string;
  targetSide: "party" | "enemy";
  text: string;
  kind: FloatKind;
};

type Props = {
  snapshot: AtbCombatSnapshot | null;
  playing: boolean;
  /** 전투 시작마다 증가 — 플로터 상태 초기화용 */
  sessionKey?: number;
  speedMult?: number;
  compact?: boolean;
  hideEnemyPortrait?: boolean;
};

const ACTING_MS = 220;
const FLOAT_LIFETIME_MS = 900;

function hpPct(hp: number, maxHp: number) {
  return Math.max(0, Math.min(100, Math.round((hp / Math.max(1, maxHp)) * 100)));
}

function eventAmount(ev: AtbCombatEvent): number | null {
  if (ev.amount != null) return ev.amount;
  const legacy = (ev as { damage?: number }).damage;
  return legacy != null ? legacy : null;
}

function resolveTargetSide(fighters: AtbFighterView[], targetId: string): "party" | "enemy" {
  const f = fighters.find((x) => x.id === targetId || x.label === targetId);
  return f?.side ?? "party";
}

function floatFromEvent(
  ev: AtbCombatEvent,
  fighters: AtbFighterView[],
): { text: string; kind: FloatKind; targetId: string; targetSide: "party" | "enemy" } | null {
  if (ev.floatKind === "lifesteal") {
    const targetId = ev.targetId ?? ev.actorId;
    if (!targetId) return null;
    return {
      text: `흡혈${eventAmount(ev) ?? 0}`,
      kind: "lifesteal",
      targetId,
      targetSide: resolveTargetSide(fighters, targetId),
    };
  }
  if (ev.floatKind === "heal" || ev.kind === "heal") {
    const targetId = ev.targetId ?? ev.actorId;
    if (!targetId) return null;
    return {
      text: `+${eventAmount(ev) ?? 0}`,
      kind: "heal",
      targetId,
      targetSide: resolveTargetSide(fighters, targetId),
    };
  }
  const targetId = ev.targetId ?? ev.actorId;
  const amount = eventAmount(ev);
  if (!targetId || amount == null) return null;
  const targetSide = resolveTargetSide(fighters, targetId);
  if (ev.crit) return { text: `${amount}!`, kind: "crit", targetId, targetSide };
  if (ev.kind === "extra") return { text: `${amount}`, kind: "extra", targetId, targetSide };
  if (ev.kind === "hit") return { text: `${amount}`, kind: "damage", targetId, targetSide };
  return null;
}

function floaterClassName(fl: FloatText) {
  if (fl.kind === "lifesteal") {
    return "atb-combat__floater atb-combat__floater--heal atb-combat__lifesteal";
  }
  if (fl.kind === "heal") {
    return "atb-combat__floater atb-combat__floater--heal";
  }
  const tone = fl.targetSide === "enemy" ? "enemy" : "party";
  const parts = ["atb-combat__floater", "atb-combat__damage", `atb-combat__damage--${tone}`];
  if (fl.kind === "crit") parts.push("atb-combat__damage--crit");
  if (fl.kind === "extra") parts.push("atb-combat__damage--extra");
  return parts.join(" ");
}

function floaterMatchesFighter(fl: FloatText, f: AtbFighterView) {
  return fl.targetId === f.id || fl.targetId === f.label;
}

function tickEventsKey(snapshot: AtbCombatSnapshot): string {
  const evs = snapshot.events ?? [];
  return `${snapshot.elapsedMs}|${evs.map((e) => `${e.kind}:${e.actorId}:${e.targetId ?? ""}:${eventAmount(e) ?? ""}:${e.crit ? 1 : 0}`).join(";")}`;
}

export function AtbCombatArena(props: Props) {
  const { snapshot, compact, hideEnemyPortrait, sessionKey = 0 } = props;
  const [floaters, setFloaters] = useState<FloatText[]>([]);
  const [actingIds, setActingIds] = useState<Set<string>>(() => new Set());
  const floatId = useRef(0);
  const lastTickKeyRef = useRef("");
  const sessionKeyRef = useRef(sessionKey);
  const actingTimersRef = useRef<Map<string, number>>(new Map());

  function markActing(ids: string[]) {
    if (!ids.length) return;
    setActingIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
    for (const id of ids) {
      const prevTimer = actingTimersRef.current.get(id);
      if (prevTimer != null) window.clearTimeout(prevTimer);
      const t = window.setTimeout(() => {
        actingTimersRef.current.delete(id);
        setActingIds((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, ACTING_MS);
      actingTimersRef.current.set(id, t);
    }
  }

  useLayoutEffect(() => {
    if (sessionKey !== sessionKeyRef.current) {
      sessionKeyRef.current = sessionKey;
      lastTickKeyRef.current = "";
      setFloaters([]);
    }
  }, [sessionKey]);

  useLayoutEffect(() => {
    if (!snapshot) {
      lastTickKeyRef.current = "";
      setFloaters([]);
      return;
    }

    const events = snapshot.events ?? [];
    if (!events.length) return;

    const tickKey = tickEventsKey(snapshot);
    if (tickKey === lastTickKeyRef.current) return;
    lastTickKeyRef.current = tickKey;

    const actionActors = events.filter((e) => e.kind === "action").map((e) => e.actorId);
    markActing(actionActors);

    const spawned: FloatText[] = [];
    for (const ev of events) {
      const ft = floatFromEvent(ev, snapshot.fighters);
      if (!ft) continue;
      floatId.current += 1;
      const id = floatId.current;
      spawned.push({
        id,
        targetId: ft.targetId,
        targetSide: ft.targetSide,
        text: ft.text,
        kind: ft.kind,
      });
      window.setTimeout(() => {
        setFloaters((prev) => prev.filter((x) => x.id !== id));
      }, FLOAT_LIFETIME_MS);
    }

    if (spawned.length) {
      setFloaters((prev) => [...prev.slice(-64), ...spawned]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot]);

  useLayoutEffect(() => {
    return () => {
      for (const t of actingTimersRef.current.values()) window.clearTimeout(t);
      actingTimersRef.current.clear();
    };
  }, []);

  if (!snapshot) {
    return (
      <div className="atb-arena atb-arena--idle">
        <p className="atb-arena__hint">전투 준비 중…</p>
      </div>
    );
  }

  const party = snapshot.fighters.filter((f) => f.side === "party");
  const enemy = snapshot.fighters.find((f) => f.side === "enemy");
  const portraitSize = compact ? 36 : 44;
  const enemyPortraitSize = compact ? 52 : 64;

  function fighterPortrait(f: AtbFighterView) {
    if (f.side === "enemy") {
      return monsterPortraitView({ monsterId: monsterIdFromDisplayName(f.label) });
    }
    return minionPortraitView({});
  }

  function renderFloaters(f: AtbFighterView) {
    return floaters
      .filter((fl) => floaterMatchesFighter(fl, f))
      .map((fl) => (
        <span key={fl.id} className={floaterClassName(fl)}>
          {fl.text}
        </span>
      ));
  }

  function renderPartyFighter(f: AtbFighterView) {
    const isActing = actingIds.has(f.id);
    const pct = hpPct(f.hp, f.maxHp);
    const rowLabel = f.row ? ATB_ROW_LABEL[f.row] : null;

    return (
      <div
        key={f.id}
        className={[
          "atb-fighter",
          f.dead ? "atb-fighter--dead" : "",
          isActing ? "atb-fighter--acting" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="atb-fighter__head">
          <CombatPortrait portrait={fighterPortrait(f)} size={portraitSize} side="party" dead={f.dead} />
          <div className="atb-fighter__meta">
            <span className="atb-fighter__name">{f.label}</span>
            {rowLabel ? <span className="atb-fighter__row">{rowLabel}</span> : null}
          </div>
        </div>
        <div className="atb-fighter__hp-wrap">
          <div className="atb-fighter__hp-track">
            <div className="atb-fighter__hp-fill" style={{ width: `${pct}%`, transition: "width 0.08s linear" }} />
          </div>
          <span className="atb-fighter__hp-text">
            {f.hp}/{f.maxHp}
          </span>
          {renderFloaters(f)}
        </div>
      </div>
    );
  }

  function renderEnemy(f: AtbFighterView) {
    const isActing = actingIds.has(f.id);
    const pct = hpPct(f.hp, f.maxHp);

    return (
      <div
        className={[
          "dungeon-arena__enemy atb-combat__enemy",
          f.dead ? "dungeon-arena__enemy--dead" : "",
          isActing ? "dungeon-arena__enemy--acting" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {!hideEnemyPortrait ? (
          <CombatPortrait
            portrait={fighterPortrait(f)}
            side="enemy"
            size={enemyPortraitSize}
            dead={f.dead}
            className="dungeon-arena__enemy-portrait"
          />
        ) : null}
        <div className="dungeon-arena__enemy-name">{f.label}</div>
        <div className="dungeon-hp-track dungeon-arena__enemy-hp">
          <div
            className="dungeon-hp-fill dungeon-hp-fill--enemy"
            style={{ width: `${pct}%`, transition: "width 0.08s linear" }}
          />
        </div>
        <div className="dungeon-arena__enemy-hp-text tabular-nums">
          {f.dead ? "처치!" : `${f.hp}/${f.maxHp}`}
        </div>
        {renderFloaters(f)}
      </div>
    );
  }

  return (
    <div className={`atb-arena atb-combat${compact ? " atb-arena--compact" : ""}`}>
      {snapshot.enemyName ? (
        <div className="atb-arena__banner">
          {snapshot.phase != null ? `페이즈 ${snapshot.phase}` : "전투"} · {snapshot.enemyName}
          {snapshot.bossPhaseLabel ? (
            <span className="atb-arena__boss-phase"> · {snapshot.bossPhaseLabel}</span>
          ) : null}
        </div>
      ) : null}
      <div className="atb-arena__party">{party.map((f) => renderPartyFighter(f))}</div>
      <div className="atb-arena__vs">VS</div>
      {enemy ? <div className="atb-arena__enemy">{renderEnemy(enemy)}</div> : null}
      {snapshot.outcome ? (
        <div className={`atb-arena__result atb-arena__result--${snapshot.outcome.toLowerCase()}`}>
          {snapshot.outcome === "WIN" ? "승리!" : "패배…"}
        </div>
      ) : null}
    </div>
  );
}
