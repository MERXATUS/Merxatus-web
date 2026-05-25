import { MarketBoard } from "@/app/_components/MarketBoard";
import { GameShell } from "@/app/_components/GameShell";

export default function MarketPage() {
  return (
    <GameShell title="메르카투스 거래소" subtitle="구매 · 판매 · 내 매물 관리">
      <MarketBoard />
    </GameShell>
  );
}
