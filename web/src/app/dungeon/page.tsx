import { Suspense } from "react";
import { GameFrame } from "@/app/_components/GameFrame";
import { GamePanelLoading } from "@/app/_components/panelFeedback";

export default function DungeonPage() {
  return (
    <Suspense fallback={<GamePanelLoading label="던전 불러오는 중…" className="m-6" />}>
      <GameFrame />
    </Suspense>
  );
}
