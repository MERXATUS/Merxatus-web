"use client";

import { EquipmentCodexPanel } from "@/app/_components/EquipmentCodexPanel";

export function CodexPanel() {
  return (
    <div className="codex-panel space-y-3">
      <header className="codex-panel__head">
        <h2 className="codex-panel__title">장비 도감</h2>
        <p className="codex-panel__subtitle">
          무기·방어구를 등록해 영구 버프를 모으고, 세트를 완성하면 추가 보너스를 받습니다.
        </p>
      </header>
      <EquipmentCodexPanel />
    </div>
  );
}
