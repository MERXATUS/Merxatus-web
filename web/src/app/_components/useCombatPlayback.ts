"use client";

import { useCallback, useRef, useState } from "react";
import type { CombatLogLine, DungeonCombatReplay } from "@/shared/dungeonCombatLog";
import type { BattleArenaFrame } from "@/shared/dungeonCombatReplay";

export function useCombatPlayback<TResult>() {
  const [playing, setPlaying] = useState(false);
  const [battleReplay, setBattleReplay] = useState<DungeonCombatReplay | null>(null);
  const [battleLines, setBattleLines] = useState<CombatLogLine[]>([]);
  const [battleFrame, setBattleFrame] = useState<BattleArenaFrame | null>(null);
  const [isBoss, setIsBoss] = useState(false);
  const pendingResultRef = useRef<TResult | null>(null);

  const startPlayback = useCallback(
    (lines: CombatLogLine[], replay: DungeonCombatReplay | null, result: TResult | null, boss?: boolean) => {
      if (!lines.length || !replay) return false;
      pendingResultRef.current = result;
      setIsBoss(!!boss);
      setBattleReplay(replay);
      setBattleLines(lines);
      setPlaying(true);
      return true;
    },
    [],
  );

  const finishPlayback = useCallback((onResult: (r: TResult) => void) => {
    setPlaying(false);
    setBattleFrame(null);
    setBattleReplay(null);
    setBattleLines([]);
    const r = pendingResultRef.current;
    pendingResultRef.current = null;
    if (r != null) onResult(r);
  }, []);

  const cancelPlayback = useCallback(() => {
    setPlaying(false);
    setBattleFrame(null);
    setBattleReplay(null);
    setBattleLines([]);
    pendingResultRef.current = null;
  }, []);

  return {
    playing,
    battleReplay,
    battleLines,
    battleFrame,
    setBattleFrame,
    isBoss,
    startPlayback,
    finishPlayback,
    cancelPlayback,
    pendingResultRef,
  };
}
