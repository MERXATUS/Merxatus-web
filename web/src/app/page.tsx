import { Suspense } from "react";
import { GameFrame } from "@/app/_components/GameFrame";
import { GameBootSplash } from "@/app/_components/GameBootSplash";

export default function Home() {
  return (
    <Suspense fallback={<GameBootSplash phase="default" />}>
      <GameFrame />
    </Suspense>
  );
}
