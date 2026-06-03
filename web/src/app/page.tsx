import { Suspense } from "react";
import { GameFrame } from "@/app/_components/GameFrame";
import { GamePanelLoading } from "@/app/_components/panelFeedback";

export default function Home() {
  return (
    <Suspense fallback={<GamePanelLoading label="Merxatus 불러오는 중…" className="m-6" />}>
      <GameFrame />
    </Suspense>
  );
}
