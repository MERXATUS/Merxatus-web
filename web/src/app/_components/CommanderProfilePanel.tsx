"use client";

import { GamePanel } from "@/app/_components/gameUi";
import { formatSpecialistBeforeNickname } from "@/shared/specialistProfession";

type CommanderProfilePanelProps = {
  username: string | null;
  specialistProfession: string | null;
};

export function CommanderProfilePanel(props: CommanderProfilePanelProps) {
  const displayName = formatSpecialistBeforeNickname(props.username, props.specialistProfession);

  return (
    <GamePanel className="profile-bar">
      <div className="profile-bar-inner profile-bar-inner--solo">
        <div className="profile-bar-identity">
          <span className="profile-bar-icon" aria-hidden>
            ♛
          </span>
          <div className="min-w-0">
            <div className="profile-bar-name">{displayName}</div>
          </div>
        </div>
      </div>
    </GamePanel>
  );
}
