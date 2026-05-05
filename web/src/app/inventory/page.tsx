import { InventoryPanel } from "@/app/_components/InventoryPanel";

export default function InventoryPage() {
  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-950">
      <main className="mx-auto w-full max-w-5xl px-6 py-10">
        <header className="flex flex-col gap-2">
          <div className="text-sm font-semibold text-zinc-600">경제 시뮬레이션 (프로토타입)</div>
          <h1 className="text-3xl font-semibold tracking-tight">인벤토리</h1>
          <p className="max-w-2xl text-zinc-600">무기(개별 강화) · 재료 · 판매를 한 화면에서 관리해.</p>
        </header>

        <div className="mt-6">
          <InventoryPanel />
        </div>
      </main>
    </div>
  );
}

