import { Suspense } from "react";
import { GameFrame } from "@/app/_components/GameFrame";
import { GamePanelLoading } from "@/app/_components/panelFeedback";

export default function PvpPage() {
  return (
    <Suspense fallback={<GamePanelLoading label="결투장 불러오는 중…" className="m-6" />}>
      <GameFrame />
    </Suspense>
  );
}
