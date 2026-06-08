"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { GameTabKey, MinionPanelTab } from "@/shared/gameNav";
import type { MeDashboardLight } from "@/shared/meDashboard";
import type { DungeonRunState, MeSummary } from "@/shared/meSummary";

export type GameFrameContextValue = {
  activeTab: GameTabKey;
  navigateTab: (tab: GameTabKey, opts?: { minionTab?: MinionPanelTab }) => void;
  minionPanelTab: MinionPanelTab;
  summary: MeSummary | null;
  summaryLoading: boolean;
  dashboardLight: MeDashboardLight | null;
  runState: DungeonRunState | null;
  refreshSummary: (opts?: { force?: boolean }) => Promise<void>;
  gold: number | null;
  loggedIn: boolean;
  sessionLoading: boolean;
};

const GameFrameContext = createContext<GameFrameContextValue | null>(null);

export function GameFrameProvider(props: { value: GameFrameContextValue; children: ReactNode }) {
  return <GameFrameContext.Provider value={props.value}>{props.children}</GameFrameContext.Provider>;
}

export function useGameFrame() {
  const ctx = useContext(GameFrameContext);
  if (!ctx) throw new Error("useGameFrame must be used within GameFrameProvider");
  return ctx;
}

export function useGameFrameOptional() {
  return useContext(GameFrameContext);
}
