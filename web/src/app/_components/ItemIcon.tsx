"use client";

import { useMemo, useState } from "react";
import { itemIconSrc, itemIconSrcCandidates, normalizeItemIconSrc } from "@/shared/itemIcon";
import { normalizeItemIdLower } from "@/shared/itemId";

type ItemIconProps = {
  itemId: unknown;
  icon?: string | null;
  iconSrc?: string | null;
  size?: number;
  className?: string;
  eager?: boolean;
};

export function ItemIcon({ itemId, icon, iconSrc, size = 48, className, eager }: ItemIconProps) {
  const id = normalizeItemIdLower(itemId);
  const candidates = useMemo(() => {
    const base = itemIconSrcCandidates({ itemId: id || "item_unknown", icon });
    if (!iconSrc) return base;
    const normalized = normalizeItemIconSrc(iconSrc) ?? iconSrc;
    if (normalized === base[0]) return base;
    return [normalized, ...base.filter((s) => s !== normalized)];
  }, [iconSrc, id, icon]);
  const [candidateIdx, setCandidateIdx] = useState(0);
  const src = candidates[candidateIdx] ?? itemIconSrc({ itemId: id || "item_unknown", icon });
  const broken = candidateIdx >= candidates.length;

  return (
    <span
      className={`item-icon inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg ${className ?? ""}`}
      style={{ width: size, height: size }}
    >
      {broken ? (
        <span className="text-[0.55rem] font-bold text-white/35" aria-hidden>
          ?
        </span>
      ) : (
        <img
          key={src}
          src={src}
          alt=""
          width={size}
          height={size}
          className="h-full w-full object-contain"
          style={{ imageRendering: "pixelated" }}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          onError={() => setCandidateIdx((i) => i + 1)}
        />
      )}
    </span>
  );
}
