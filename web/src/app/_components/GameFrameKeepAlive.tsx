"use client";

import dynamic from "next/dynamic";
import { loadPanelChunk } from "@/shared/panelChunkLoad";
import { GamePanelLoading } from "@/app/_components/panelFeedback";
import { isScrollableGameTab, type GameTabKey } from "@/shared/gameNav";

const panelLoading = (label: string) => <GamePanelLoading label={label} />;

const MarketBoard = dynamic(
  () => loadPanelChunk(() => import("@/app/_components/MarketBoard").then((m) => m.MarketBoard)),
  { loading: () => panelLoading("거래소 불러오는 중…") },
);
const ShopPanel = dynamic(
  () => loadPanelChunk(() => import("@/app/_components/ShopPanel").then((m) => m.ShopPanel)),
  { loading: () => panelLoading("상점 불러오는 중…") },
);
const CodexPanel = dynamic(
  () => loadPanelChunk(() => import("@/app/_components/CodexPanel").then((m) => m.CodexPanel)),
  { loading: () => panelLoading("도감 불러오는 중…") },
);
const InventoryPanel = dynamic(
  () => loadPanelChunk(() => import("@/app/_components/InventoryPanel").then((m) => m.InventoryPanel)),
  { loading: () => panelLoading("인벤토리 불러오는 중…") },
);
const WeaponEnhancePanel = dynamic(
  () => loadPanelChunk(() => import("@/app/_components/WeaponEnhancePanel").then((m) => m.WeaponEnhancePanel)),
  { loading: () => panelLoading("대장간 불러오는 중…") },
);
const DungeonHubPanel = dynamic(
  () => loadPanelChunk(() => import("@/app/_components/DungeonHubPanel").then((m) => m.DungeonHubPanel)),
  { loading: () => panelLoading("던전 불러오는 중…") },
);
const RaidsPanel = dynamic(
  () => loadPanelChunk(() => import("@/app/_components/RaidsPanel").then((m) => m.RaidsPanel)),
  { loading: () => panelLoading("레이드 불러오는 중…") },
);
const TowerPanel = dynamic(
  () => loadPanelChunk(() => import("@/app/_components/TowerPanel").then((m) => m.TowerPanel)),
  { loading: () => panelLoading("무한의 탑 불러오는 중…") },
);
const RankingPanel = dynamic(
  () => loadPanelChunk(() => import("@/app/_components/RankingPanel").then((m) => m.RankingPanel)),
  { loading: () => panelLoading("랭킹 불러오는 중…") },
);
const PvpPanel = dynamic(
  () => loadPanelChunk(() => import("@/app/_components/PvpPanel").then((m) => m.PvpPanel)),
  { loading: () => panelLoading("결투장 불러오는 중…") },
);
const MinionManagementPanel = dynamic(
  () =>
    loadPanelChunk(() =>
      import("@/app/_components/MinionManagementPanel").then((m) => m.MinionManagementPanel),
    ),
  { loading: () => panelLoading("미니언 불러오는 중…") },
);

const KEEP_ALIVE_TABS: GameTabKey[] = [
  "market",
  "shop",
  "inventory",
  "codex",
  "enhance",
  "dungeon",
  "raid",
  "tower",
  "pvp",
  "ranking",
  "minions",
];

function panelForTab(
  tab: GameTabKey,
  props: {
    onOpenMinions: () => void;
    onNavigate: (tab: GameTabKey) => void;
  },
) {
  switch (tab) {
    case "market":
      return <MarketBoard embedded />;
    case "shop":
      return <ShopPanel embedded />;
    case "inventory":
      return <InventoryPanel embedded onOpenMinions={props.onOpenMinions} />;
    case "codex":
      return <CodexPanel />;
    case "enhance":
      return <WeaponEnhancePanel embedded />;
    case "dungeon":
      return <DungeonHubPanel embedded />;
    case "raid":
      return <RaidsPanel embedded />;
    case "tower":
      return <TowerPanel embedded />;
    case "pvp":
      return <PvpPanel embedded />;
    case "ranking":
      return <RankingPanel embedded />;
    case "minions":
      return <MinionManagementPanel embedded />;
    default:
      return null;
  }
}

export function GameFrameKeepAlive(props: {
  activeTab: GameTabKey;
  visitedTabs: ReadonlySet<GameTabKey>;
  onOpenMinions: () => void;
  onNavigate: (tab: GameTabKey) => void;
}) {
  const { activeTab, visitedTabs, onOpenMinions, onNavigate } = props;
  const scrollable = isScrollableGameTab(activeTab);

  return (
    <div
      className={[
        "game-frame__content game-frame__panels",
        scrollable ? "game-frame__content--scroll" : "game-frame__content--fit",
      ].join(" ")}
    >
      {KEEP_ALIVE_TABS.map((tab) => {
        if (!visitedTabs.has(tab)) return null;
        const visible = tab === activeTab;
        return (
          <div
            key={tab}
            className={`game-frame__panel ${visible ? "game-frame__panel--active" : ""}`.trim()}
            hidden={!visible}
            aria-hidden={!visible}
          >
            {panelForTab(tab, { onOpenMinions, onNavigate })}
          </div>
        );
      })}
    </div>
  );
}
