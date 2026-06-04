"use client";

import { itemIconSrc } from "@/shared/itemIcon";
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
  const src = iconSrc ?? itemIconSrc({ itemId: id || "item_unknown", icon });

  return (
    <span
      className={`item-icon inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg ${className ?? ""}`}
      style={{ width: size, height: size }}
    >
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className="h-full w-full object-contain"
        style={{ imageRendering: "pixelated" }}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
      />
    </span>
  );
}
