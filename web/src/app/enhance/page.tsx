import { GameShell } from "@/app/_components/GameShell";
import { WeaponEnhancePanel } from "@/app/_components/WeaponEnhancePanel";

export default function EnhancePage() {
  return (
    <GameShell title="강화소" subtitle="무기 선택 · 재료 확인 · 강화">
      <WeaponEnhancePanel />
    </GameShell>
  );
}
