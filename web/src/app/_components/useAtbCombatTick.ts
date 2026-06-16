"use client";

import { useEffect, useRef } from "react";
import { ATB_CLIENT_TICK_MS } from "@/shared/atbCombat";

/** ATB 전투 tick — 요청 완료 후 다음 tick 예약 (setInterval + skip 방지) */
export function useAtbCombatTick(input: {
  active: boolean;
  speedMult: number;
  tick: (dtMs: number) => Promise<void>;
}) {
  const tickRef = useRef(input.tick);
  const activeRef = useRef(input.active);
  const speedRef = useRef(input.speedMult);
  const busyRef = useRef(false);

  useEffect(() => {
    tickRef.current = input.tick;
  }, [input.tick]);

  useEffect(() => {
    activeRef.current = input.active;
  }, [input.active]);

  useEffect(() => {
    speedRef.current = input.speedMult;
  }, [input.speedMult]);

  useEffect(() => {
    if (!input.active) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (delayMs: number) => {
      if (cancelled || !activeRef.current) return;
      timer = setTimeout(run, delayMs);
    };

    const run = () => {
      if (cancelled || !activeRef.current || busyRef.current) {
        schedule(16);
        return;
      }
      busyRef.current = true;
      const dtMs = Math.min(500, Math.max(16, Math.round(ATB_CLIENT_TICK_MS * speedRef.current)));
      void tickRef
        .current(dtMs)
        .catch(() => {
          /* caller handles error state */
        })
        .finally(() => {
          busyRef.current = false;
          if (!cancelled && activeRef.current) {
            schedule(Math.max(16, Math.round(ATB_CLIENT_TICK_MS / Math.max(0.25, speedRef.current))));
          }
        });
    };

    schedule(0);

    return () => {
      cancelled = true;
      if (timer != null) clearTimeout(timer);
      busyRef.current = false;
    };
  }, [input.active, input.speedMult]);
}
