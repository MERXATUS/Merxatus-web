"use client";

import { useState } from "react";
import { DungeonsPanel } from "@/app/_components/DungeonsPanel";
import type { EmbeddedPanelProps } from "@/shared/panelEmbed";

type DungeonHubTab = "idle" | "special";

export function DungeonHubPanel({ embedded = false }: EmbeddedPanelProps = {}) {
  const [tab, setTab] = useState<DungeonHubTab>("idle");

  return (
    <div className={embedded ? "panel-fit flex min-h-0 flex-col" : ""}>
      <div
        className={`dungeon-hub-tabs ${embedded ? "dungeon-hub-tabs--compact" : ""}`.trim()}
        role="tablist"
        aria-label="던전 유형"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "idle"}
          className={`dungeon-hub-tabs__btn ${tab === "idle" ? "dungeon-hub-tabs__btn--active" : ""}`.trim()}
          onClick={() => setTab("idle")}
        >
          방치 탐험
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "special"}
          className={`dungeon-hub-tabs__btn ${tab === "special" ? "dungeon-hub-tabs__btn--active" : ""}`.trim()}
          onClick={() => setTab("special")}
        >
          특수 던전
        </button>
      </div>
      {tab === "idle" ? (
        <DungeonsPanel embedded={embedded} contentMode="idle" />
      ) : (
        <DungeonsPanel embedded={embedded} contentMode="special" />
      )}
    </div>
  );
}
