"use client";

import { MinionManagementPanel } from "@/app/_components/MinionManagementPanel";
import { GamePanel } from "@/app/_components/gameUi";
import { GamePanelInfo, GamePanelLoading } from "@/app/_components/panelFeedback";
import { useGameFrameOptional } from "@/app/_components/GameFrameContext";
import { useSessionUser } from "@/app/_components/SessionProvider";
import type { EmbeddedPanelProps } from "@/shared/panelEmbed";

export function ProfilePanel(props: EmbeddedPanelProps = {}) {
  const embedded = props.embedded ?? false;
  const { user, loading: sessionLoading } = useSessionUser();
  const frame = useGameFrameOptional();
  const summary = frame?.summary ?? null;

  if (sessionLoading) {
    return <GamePanelLoading label="내 정보 불러오는 중…" />;
  }

  if (!user) {
    return (
      <GamePanel className="profile-panel">
        <GamePanelInfo>로그인하면 내 정보를 볼 수 있어요.</GamePanelInfo>
      </GamePanel>
    );
  }

  return (
    <div className={`profile-panel-stack ${embedded ? "profile-panel-stack--fit panel-fit" : ""}`.trim()}>
      {summary?.dungeon.active ? (
        <GamePanel className="profile-panel">
          <section className="profile-panel__stats" aria-label="계정 요약">
            <div className="profile-bar-stat profile-bar-stat-highlight">
              <span className="profile-bar-stat-label">던전</span>
              <span className="profile-bar-stat-value">{summary.dungeon.name ?? "진행 중"}</span>
            </div>
          </section>
        </GamePanel>
      ) : null}

      <MinionManagementPanel embedded />
    </div>
  );
}
