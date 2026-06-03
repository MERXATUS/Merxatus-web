import { useCallback, useEffect, useRef, type PointerEvent } from "react";

const HOLD_DELAY_MS = 320;
const INITIAL_INTERVAL_MS = 130;
const MIN_INTERVAL_MS = 40;
const ACCELERATION = 0.86;

/** 버튼을 누르고 있으면 짧은 지연 후 가속하며 onTick 반복. onTick이 false면 중단. */
export function useHoldRepeat(onTick: () => boolean, disabled: boolean) {
  const tickRef = useRef(onTick);
  tickRef.current = onTick;

  const stopRef = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      if (disabled || e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);

      stop();

      if (!tickRef.current()) return;

      let delayTimer = 0;
      let repeatTimer = 0;
      let speed = INITIAL_INTERVAL_MS;

      const cleanup = () => {
        if (delayTimer) window.clearTimeout(delayTimer);
        if (repeatTimer) window.clearTimeout(repeatTimer);
        delayTimer = 0;
        repeatTimer = 0;
        stopRef.current = null;
      };

      const schedule = () => {
        repeatTimer = window.setTimeout(() => {
          if (!tickRef.current()) {
            cleanup();
            return;
          }
          speed = Math.max(MIN_INTERVAL_MS, speed * ACCELERATION);
          schedule();
        }, speed);
      };

      delayTimer = window.setTimeout(schedule, HOLD_DELAY_MS);
      stopRef.current = cleanup;
    },
    [disabled, stop],
  );

  const onPointerEnd = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      stop();
    },
    [stop],
  );

  return { onPointerDown, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd };
}
