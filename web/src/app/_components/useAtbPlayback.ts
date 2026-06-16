"use client";

import { useEffect, useRef, useState } from "react";
import type { AtbCombatSnapshot } from "@/shared/atbCombat";
import { ATB_CLIENT_TICK_MS } from "@/shared/atbCombat";

/** 서버가 미리 계산한 스냅샷 시퀀스 재생 (PvP 등) */
export function useAtbPlayback(input: {
  snapshots: AtbCombatSnapshot[] | null;
  playing: boolean;
  speedMult?: number;
  onComplete?: () => void;
}) {
  const { snapshots, playing, speedMult = 1, onComplete } = input;
  const [index, setIndex] = useState(0);
  const doneRef = useRef(false);

  useEffect(() => {
    if (!playing || !snapshots?.length) {
      setIndex(0);
      doneRef.current = false;
      return;
    }
    setIndex(0);
    doneRef.current = false;
    const intervalMs = Math.max(40, Math.round(ATB_CLIENT_TICK_MS / speedMult));
    const timer = setInterval(() => {
      setIndex((prev) => {
        const next = prev + 1;
        if (next >= snapshots.length - 1) {
          if (!doneRef.current) {
            doneRef.current = true;
            onComplete?.();
          }
          return snapshots.length - 1;
        }
        return next;
      });
    }, intervalMs);
    return () => clearInterval(timer);
  }, [playing, snapshots, speedMult, onComplete]);

  const snapshot = snapshots?.[index] ?? snapshots?.[snapshots.length - 1] ?? null;
  return { snapshot, index, total: snapshots?.length ?? 0 };
}
