"use client";

import { useEffect } from "react";
import { GameBtn } from "@/app/_components/gameUi";

export default function GlobalAppError(props: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app error]", props.error);
  }, [props.error]);

  return (
    <div className="game-shell flex min-h-dvh items-center justify-center p-6">
      <div className="game-subpanel-inset max-w-md space-y-4 p-6 text-center">
        <h1 className="text-lg font-bold text-[var(--game-text)]">화면을 불러오지 못했습니다</h1>
        <p className="text-sm text-[var(--game-muted)]">
          {props.error.message || "예기치 않은 오류가 발생했습니다."}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <GameBtn variant="gold" className="h-10 px-4 text-sm" onClick={() => props.reset()}>
            다시 시도
          </GameBtn>
          <GameBtn variant="ghost" className="h-10 px-4 text-sm" onClick={() => window.location.reload()}>
            새로고침
          </GameBtn>
        </div>
      </div>
    </div>
  );
}
