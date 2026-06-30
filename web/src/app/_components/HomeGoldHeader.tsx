"use client";

import { selectGoldAvailable, useWalletStore } from "@/shared/stores/walletStore";

function fmtInt(n: unknown) {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return "—";
  return Math.floor(x).toLocaleString();
}

function fmtSignedGold(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return null;
  const v = Math.floor(n);
  if (v === 0) return "오늘 ±0 G";
  return v > 0 ? `오늘 +${fmtInt(v)} G` : `오늘 ${fmtInt(v)} G`;
}

type HomeGoldHeaderProps = {
  todayNetGold?: number | null;
  activeListings?: number | null;
  username?: string | null;
};

export function HomeGoldHeader(props: HomeGoldHeaderProps) {
  const gold = useWalletStore(selectGoldAvailable);
  const goldAmount = gold != null ? fmtInt(gold) : "—";
  const todayLabel = fmtSignedGold(props.todayNetGold ?? null);
  const listingsLabel =
    props.activeListings != null ? `매물 ${fmtInt(props.activeListings)}건` : null;
  const commanderLabel = props.username?.trim() || "미로그인";

  return (
    <div className="home-gold-header" aria-label="보유 골드">
      <span className="home-gold-header__glyph" aria-hidden>
        ◈
      </span>
      <div className="home-gold-header__body">
        <div className="home-gold-header__topline">
          <span className="home-gold-header__brand">Merxatus</span>
          <span className="home-gold-header__dot" aria-hidden>
            ·
          </span>
          <span className="home-gold-header__commander">{commanderLabel}</span>
        </div>
        <span className="home-gold-header__label">보유 골드</span>
        <span className="home-gold-header__value">
          {goldAmount}
          <span className="home-gold-header__unit">G</span>
        </span>
        {todayLabel || listingsLabel ? (
          <span className="home-gold-header__meta">
            {[todayLabel, listingsLabel].filter(Boolean).join(" · ")}
          </span>
        ) : null}
      </div>
    </div>
  );
}
