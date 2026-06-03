"use client";

import { useState, type CSSProperties } from "react";
import { ItemIcon } from "@/app/_components/ItemIcon";
import type { CombatPortraitView } from "@/shared/combatPortrait";

type Props = {
  portrait: CombatPortraitView;
  size?: number;
  side?: "party" | "enemy";
  className?: string;
  dead?: boolean;
};

export function CombatPortrait(props: Props) {
  const { portrait, size = 40, side = "party", className, dead } = props;
  const [imgFailed, setImgFailed] = useState(false);

  const frameClass = [
    "combat-portrait",
    side === "enemy" ? "combat-portrait--enemy" : "combat-portrait--party",
    dead ? "combat-portrait--dead" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const style = portrait.tint ? ({ ["--portrait-tint" as string]: portrait.tint } as CSSProperties) : undefined;

  if (portrait.kind === "item" && portrait.itemId && !imgFailed) {
    return (
      <span className={frameClass} style={style}>
        <ItemIcon itemId={portrait.itemId} icon={portrait.icon} iconSrc={portrait.src} size={size} eager />
      </span>
    );
  }

  const showImg = portrait.kind === "glyph" && portrait.src && !imgFailed;

  return (
    <span className={frameClass} style={style}>
      {showImg ? (
        <img
          src={portrait.src}
          alt=""
          width={size}
          height={size}
          className="combat-portrait__img"
          loading="eager"
          decoding="async"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span className="combat-portrait__glyph" aria-hidden>
          {portrait.glyph ?? "?"}
        </span>
      )}
    </span>
  );
}
