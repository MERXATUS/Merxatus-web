import { readFileSync, writeFileSync } from "node:fs";

const path = "src/app/_components/InventoryPanel.tsx";
let c = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const nl = c.includes("\r\n") ? "\r\n" : "\n";

const heroBlock = [
  '      <div className="flex flex-wrap items-start justify-between gap-3">',
  "        <div>",
  '          <div className="text-sm font-semibold">인벤토리</div>',
  '          <div className="mt-1 text-sm text-[var(--game-muted)]">검색·필터·빠른 판매까지 한 번에.</div>',
  "        </div>",
  '        <div className="flex flex-wrap items-center gap-2">',
  "          <button",
  '            className="h-10 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-[var(--game-text)] disabled:opacity-50"',
  "            disabled={!!busy}",
  "            onClick={() => void refresh()}",
  "          >",
  "            새로고침",
  "          </button>",
  "        </div>",
  "      </div>",
  "",
].join(nl);

if (!c.includes(heroBlock)) throw new Error("hero block missing");
c = c.replace(heroBlock, "");

const kinds = [
  '            <div className="inventory-stat">',
  '              <div className="inventory-stat-label">보유 아이템 종류</div>',
  '              <motion.div className="inventory-stat-value mt-1">{fmtInt(filteredMaterials.length)}종</div>',
  '              <motion.div className="text-[11px] text-[var(--game-muted)]">총 슬롯 {fmtInt((me.inventory ?? []).length)}개</div>',
  "            </div>",
  "",
].join("\n").replaceAll("motion.div", "div");

if (!c.includes(kinds)) throw new Error("kinds block missing");
c = c.replace(kinds, "");

const brokenGold = [
  '            <div className="inventory-stat">',
  '              <div className="inventory-stat inventory-stat--gold"><div className="inventory-stat-label">보유 골드</div>',
  '              <div className="inventory-stat-value mt-1">{fmtInt(me.wallet.goldAvailable)}G</div>',
  '              <div className="inventory-stat-sub">잠금 {fmtInt(me.wallet.goldLocked)}G</div></div>',
  "            </div>",
].join(nl);

const fixedGold = [
  '            <div className="inventory-stat inventory-stat--gold">',
  '              <div className="inventory-stat-label">보유 골드</div>',
  '              <div className="inventory-stat-value mt-1">{fmtInt(me.wallet.goldAvailable)}G</motion.div>',
  '              <div className="inventory-stat-sub">잠금 {fmtInt(me.wallet.goldLocked)}G</div>',
  "            </div>",
].join("\n").replaceAll("</motion.div>", "</div>").replaceAll("<motion.div", "<div");

if (c.includes(brokenGold)) c = c.replace(brokenGold, fixedGold);

c = c.replace(
  '<div className="text-[11px] text-[var(--game-muted)]">판매중 목록은 아래에서 확인</div>',
  '<div className="inventory-stat-sub">판매중 목록은 아래에서 확인</div>',
);

const toolbarOld = [
  '          <div className="mt-4 flex flex-col gap-3">',
  '            <div className="flex flex-wrap gap-2">',
  '              <button',
  '                className={`inventory-tab ${tab === "WEAPONS" ? "inventory-tab--active" : ""}`}',
  '                onClick={() => setTab("WEAPONS")}',
  "              >",
  "                무기",
  "              </button>",
  '              <button',
  '                className={`inventory-tab ${tab === "TOOLS" ? "inventory-tab--active" : ""}`}',
  '                onClick={() => setTab("TOOLS")}',
  "              >",
  "                도구",
  "              </button>",
  '              <button',
  '                className={`inventory-tab ${tab === "MATERIALS" ? "inventory-tab--active" : ""}`}',
  '                onClick={() => setTab("MATERIALS")}',
  "              >",
  "                재료·고용권",
  "              </button>",
  "            </div>",
  '            <div className="flex flex-wrap items-end gap-3">',
].join(nl);

const toolbarNew = [
  '          <div className="inventory-toolbar">',
  '            <div className="inventory-toolbar-top">',
  '              <div className="inventory-tabs">',
  "              <button",
  '                type="button"',
  '                className={`inventory-tab ${tab === "WEAPONS" ? "inventory-tab--active" : ""}`}',
  '                onClick={() => setTab("WEAPONS")}',
  "              >",
  "                무기",
  "              </button>",
  "              <button",
  '                type="button"',
  '                className={`inventory-tab ${tab === "TOOLS" ? "inventory-tab--active" : ""}`}',
  '                onClick={() => setTab("TOOLS")}',
  "              >",
  "                도구",
  "              </button>",
  "              <button",
  '                type="button"',
  '                className={`inventory-tab ${tab === "MATERIALS" ? "inventory-tab--active" : ""}`}',
  '                onClick={() => setTab("MATERIALS")}',
  "              >",
  "                재료·고용권",
  "              </button>",
  "              </div>",
  '              <GameBtn variant="secondary" disabled={!!busy} onClick={() => void refresh()}>',
  "                새로고침",
  "              </GameBtn>",
  "            </div>",
  '            <div className="inventory-filters flex flex-wrap items-end gap-3">',
].join(nl);

if (!c.includes(toolbarOld)) throw new Error("toolbar block missing");
c = c.replace(toolbarOld, toolbarNew);

writeFileSync(path, c.replace(/\n/g, nl === "\r\n" ? "\r\n" : "\n"), "utf8");
console.log("ok", {
  hero: !c.includes("검색·필터"),
  kinds: !c.includes("보유 아이템 종류"),
  toolbar: c.includes("inventory-toolbar-top"),
});
