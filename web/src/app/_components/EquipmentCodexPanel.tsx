"use client";

import { useState } from "react";
import { WeaponCodexPanel } from "@/app/_components/WeaponCodexPanel";
import { ArmorCodexPanel } from "@/app/_components/ArmorCodexPanel";
import { SetCodexPanel } from "@/app/_components/SetCodexPanel";

export function EquipmentCodexPanel() {
  const [kind, setKind] = useState<"weapon" | "armor" | "set">("weapon");

  return (
    <div className="space-y-3">
      <div className="inventory-tabs">
        <button
          type="button"
          className={`inventory-tab ${kind === "weapon" ? "inventory-tab--active" : ""}`}
          onClick={() => setKind("weapon")}
        >
          무기
        </button>
        <button
          type="button"
          className={`inventory-tab ${kind === "armor" ? "inventory-tab--active" : ""}`}
          onClick={() => setKind("armor")}
        >
          방어구
        </button>
        <button
          type="button"
          className={`inventory-tab ${kind === "set" ? "inventory-tab--active" : ""}`}
          onClick={() => setKind("set")}
        >
          세트
        </button>
      </div>
      {kind === "weapon" ? <WeaponCodexPanel /> : kind === "armor" ? <ArmorCodexPanel /> : <SetCodexPanel />}
    </div>
  );
}
