import { useEffect } from "react";

/** 열린 모달이 여러 개일 때 가장 마지막(위) 것부터 ESC로 닫기 */
const escapeCloseStack: Array<() => void> = [];
let escapeListenerAttached = false;

function ensureEscapeListener() {
  if (escapeListenerAttached) return;
  escapeListenerAttached = true;
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const close = escapeCloseStack[escapeCloseStack.length - 1];
    if (!close) return;
    e.preventDefault();
    close();
  });
}

/** `enabled`일 때 ESC → `onClose` (닫기 버튼과 동일) */
export function useEscapeClose(enabled: boolean, onClose: () => void) {
  useEffect(() => {
    if (!enabled) return;
    ensureEscapeListener();
    escapeCloseStack.push(onClose);
    return () => {
      const idx = escapeCloseStack.lastIndexOf(onClose);
      if (idx >= 0) escapeCloseStack.splice(idx, 1);
    };
  }, [enabled, onClose]);
}
