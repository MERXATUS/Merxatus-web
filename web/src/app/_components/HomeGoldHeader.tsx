"use client";

function fmtInt(n: unknown) {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return "—";
  return Math.floor(x).toLocaleString();
}

type HomeGoldHeaderProps = {
  gold: number | null;
};

export function HomeGoldHeader(props: HomeGoldHeaderProps) {
  const goldAmount = props.gold != null ? fmtInt(props.gold) : "—";

  return (
    <div className="home-gold-header" aria-label="보유 골드">
      <span className="home-gold-header__glyph" aria-hidden>
        ◈
      </span>
      <div className="home-gold-header__body">
        <span className="home-gold-header__label">보유 골드</span>
        <span className="home-gold-header__value">
          {goldAmount}
          <span className="home-gold-header__unit">G</span>
        </span>
      </div>
    </div>
  );
}
