import { DungeonsPanel } from "@/app/_components/DungeonsPanel";
import { GameShell } from "@/app/_components/GameShell";

export default function DungeonPage() {
  return (
    <GameShell title="던전" subtitle="파티 편성 · 전투 · 보상 수령">
      <DungeonsPanel />
    </GameShell>
  );
}
