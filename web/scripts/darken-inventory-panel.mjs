import { readFileSync, writeFileSync } from "node:fs";

const path = "src/app/_components/InventoryPanel.tsx";
let c = readFileSync(path, "utf8").replace(/\r\n/g, "\n");

const reps = [
  ['overflow-auto rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900', "inventory-alert-error overflow-auto rounded-xl p-3 text-xs"],
  ["mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-[var(--game-muted)]", "inventory-alert-info mt-4 rounded-xl p-3 text-sm"],
  ["rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm text-[var(--game-muted)]", "inventory-alert-info rounded-xl p-3 text-sm"],
  ['label className="text-xs font-semibold text-[var(--game-muted)]"', 'label className="inventory-label"'],
  [
    'className="mt-2 h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"',
    'className="inventory-input mt-2"',
  ],
  [
    'className="mt-2 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"',
    'className="inventory-input mt-2"',
  ],
  [
    'className="h-10 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-200"',
    'className="inventory-input"',
  ],
  ['rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900', "inventory-badge-grade"],
  ["rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-[var(--game-muted)]", "inventory-badge-cat"],
  [
    "rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-950",
    "inline-flex max-w-full items-center gap-1 rounded-md px-2 py-0.5 text-[11px] inventory-option-emerald",
  ],
  [
    "rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] text-sky-950",
    "inline-flex max-w-full items-center gap-1 rounded-md px-2 py-0.5 text-[11px] inventory-option-sky",
  ],
  [
    'className="inline-flex max-w-full items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-950"',
    'className="inline-flex max-w-full items-center gap-1 rounded-md px-2 py-0.5 text-[11px] inventory-option-emerald"',
  ],
  [
    'className="inline-flex max-w-full items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] text-sky-950"',
    'className="inline-flex max-w-full items-center gap-1 rounded-md px-2 py-0.5 text-[11px] inventory-option-sky"',
  ],
  [
    'rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950',
    "inventory-alert-warn rounded-xl px-3 py-2 text-sm",
  ],
  [
    "mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-[var(--game-muted)]",
    "inventory-notice text-sm",
  ],
  ["w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl", "inventory-modal w-full max-w-xl"],
  [
    'className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-[var(--game-text)]"',
    'className="inventory-btn h-9 px-3 text-xs"',
  ],
  [
    'className="h-10 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-[var(--game-text)]"',
    'className="inventory-btn h-10 px-4 text-sm"',
  ],
  [
    'className="h-10 shrink-0 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-[var(--game-text)] disabled:opacity-50"',
    'className="inventory-btn h-10 shrink-0 px-3 text-sm disabled:opacity-50"',
  ],
  [
    'className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-[var(--game-text)] disabled:opacity-50"',
    'className="inventory-btn px-3 py-2 text-xs disabled:opacity-50"',
  ],
  [
    'className="h-10 flex-1 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-50"',
    'className="inventory-btn inventory-btn-enhance h-10 flex-1 px-4 text-sm disabled:opacity-50"',
  ],
  [
    'className="h-9 rounded-xl bg-indigo-700 px-3 text-xs font-semibold text-white disabled:opacity-50"',
    'className="inventory-btn inventory-btn-enhance h-9 px-3 text-xs disabled:opacity-50"',
  ],
  [
    'className="h-10 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white disabled:opacity-50"',
    'className="inventory-btn inventory-btn-violet h-10 px-4 text-sm disabled:opacity-50"',
  ],
];

for (const [from, to] of reps) {
  if (!c.includes(from)) continue;
  c = c.split(from).join(to);
}

// weapons section
const weaponsOld = `{tab === "WEAPONS" ? (
          <motion.div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">보유 무기</div>
                <div className="mt-1 text-xs text-[var(--game-muted)]">
                  무기는 개별 인스턴스 단위로 강화/판매할 수 있어. 강화에는 골드와 돌(item_stone)이 들어가고, 일정 단계마다 광석(item_ore)이 추가로 필요해.
                </div>
              </div>
              <button
                className="inventory-btn h-9 px-3 text-xs disabled:opacity-50"
                disabled={!!busy}
                onClick={() => void refresh()}
              >
                갱신
              </button>
            </div>

            {filteredWeapons.length === 0 ? (
              <div className="mt-3 text-sm text-[var(--game-muted)]">보유 무기가 없어.</div>
            ) : (
              <div className="mt-3 grid gap-2">
                {filteredWeapons.map((w) => {
                  const upgradeInfo = nextWeaponUpgradeLine(w.enhanceLevel ?? 0, nameById);
                  return (
                  <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white p-3">
                    <div className="min-w-0">`;

const weaponsNew = `{tab === "WEAPONS" ? (
          <div className="inventory-section">
            <div>
              <motion.div className="inventory-section-title">보유 무기</div>
              <div className="inventory-section-hint">
                무기는 개별 인스턴스 단위로 강화/판매할 수 있어. 강화에는 골드와 돌(item_stone)이 들어가고, 일정 단계마다 광석(item_ore)이 추가로 필요해.
              </div>
            </div>

            {filteredWeapons.length === 0 ? (
              <div className="mt-3 text-sm text-[var(--game-muted)]">보유 무기가 없어.</div>
            ) : (
              <div className="inventory-item-list mt-3">
                {filteredWeapons.map((w) => {
                  const upgradeInfo = nextWeaponUpgradeLine(w.enhanceLevel ?? 0, nameById);
                  return (
                  <div key={w.id} className="inventory-item-card">
                    <ItemIcon itemId={w.baseItemId} size={48} className="shrink-0" />
                    <div className="inventory-item-card__body min-w-0">`;

c = c.replace(weaponsOld.replace(/motion\.div/g, "motion.div"), weaponsNew.replace(/motion\.div/g, "div"));

// fix weapons card actions wrapper
c = c.replace(
  `                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex flex-wrap justify-end gap-2">
                      <button
                        className="inventory-btn h-9 px-3 text-xs disabled:opacity-50"
                        disabled={!!busy}
                        onClick={() => void openSellWeapon(w)}
                      >
                        판매하기
                      </button>
                      <button
                        className="inventory-btn inventory-btn-enhance h-9 px-3 text-xs disabled:opacity-50"`,
  `                    </div>
                    <div className="inventory-item-card__actions">
                      <button
                        type="button"
                        className="inventory-btn h-9 px-3 text-xs disabled:opacity-50"
                        disabled={!!busy}
                        onClick={() => void openSellWeapon(w)}
                      >
                        판매하기
                      </button>
                      <button
                        type="button"
                        className="inventory-btn inventory-btn-enhance h-9 px-3 text-xs disabled:opacity-50"`,
);

c = c.replace(
  `                      </button>
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
          ) : null}

          {tab === "TOOLS"`,
  `                      </button>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
          ) : null}

          {tab === "TOOLS"`,
);

// tools section
const toolsOldStart = `{tab === "TOOLS" ? (
            <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">보유 도구</div>
                  <div className="mt-1 text-xs text-[var(--game-muted)]">
                    낚싯대·곡괭이·낫 등은 개별 인스턴스로 보관되며 제작 시 옵션이 붙어. (경매장 판매는 무기만 지원)
                  </div>
                </div>
                <button
                  className="inventory-btn h-9 px-3 text-xs disabled:opacity-50"
                  disabled={!!busy}
                  onClick={() => void refresh()}
                >
                  갱신
                </button>
              </div>

              {filteredTools.length === 0 ? (
                <div className="mt-3 text-sm text-[var(--game-muted)]">보유 도구가 없어.</div>
              ) : (
                <div className="mt-3 grid gap-2">
                  {filteredTools.map((t) => (
                    <div key={t.id} className="rounded-xl border border-zinc-200 bg-white p-3">
                      <div className="flex flex-wrap items-center gap-2">`;

const toolsNewStart = `{tab === "TOOLS" ? (
            <div className="inventory-section">
              <div>
                <div className="inventory-section-title">보유 도구</div>
                <div className="inventory-section-hint">
                  낚싯대·곡괭이·낫 등은 개별 인스턴스로 보관되며 제작 시 옵션이 붙어. (경매장 판매는 무기만 지원)
                </div>
              </div>

              {filteredTools.length === 0 ? (
                <div className="mt-3 text-sm text-[var(--game-muted)]">보유 도구가 없어.</div>
              ) : (
                <div className="inventory-item-list mt-3">
                  {filteredTools.map((t) => (
                    <motion.div key={t.id} className="inventory-item-card">
                      <ItemIcon itemId={t.baseItemId} size={48} className="shrink-0" />
                      <div className="inventory-item-card__body min-w-0">
                      <div className="inventory-item-card__title">`;

c = c.replace(toolsOldStart, toolsNewStart.replace(/motion\.motion.div/g, "motion.div").replace("<motion.div", "<div").replace("</motion.div>", "</div>"));

c = c.replace(
  `                        <motion.div className={\`text-sm font-semibold \${itemGradeNameClassName(t.grade ?? 1)}\`}>{t.name}</div>`,
  `                        <div className={\`inventory-item-card__name \${itemGradeNameClassName(t.grade ?? 1)}\`}>{t.name}</div>`,
);

c = c.replace(
  `                        <div className={\`text-sm font-semibold \${itemGradeNameClassName(t.grade ?? 1)}\`}>{t.name}</div>`,
  `                        <motion.div className={\`inventory-item-card__name \${itemGradeNameClassName(t.grade ?? 1)}\`}>{t.name}</div>`,
);
c = c.replace(
  `                        <motion.div className={\`inventory-item-card__name \${itemGradeNameClassName(t.grade ?? 1)}\`}>{t.name}</div>`,
  `                        <div className={\`inventory-item-card__name \${itemGradeNameClassName(t.grade ?? 1)}\`}>{t.name}</div>`,
);

c = c.replace(
  `                      <div className="mt-1 font-mono text-xs text-[var(--game-muted)]">{t.id}</div>
                      <div className="mt-1 text-xs text-[var(--game-muted)]">베이스: {t.baseItemId}</motion.div>`,
  `                      </div>
                      <div className="inventory-item-card__id">{t.id}</div>
                      <div className="inventory-item-card__meta">베이스: {t.baseItemId}</motion.div>`,
);
c = c.replace(
  `                      <div className="mt-1 font-mono text-xs text-[var(--game-muted)]">{t.id}</div>
                      <div className="mt-1 text-xs text-[var(--game-muted)]">베이스: {t.baseItemId}</div>`,
  `                      </div>
                      <div className="inventory-item-card__id">{t.id}</div>
                      <div className="inventory-item-card__meta">베이스: {t.baseItemId}</div>`,
);

c = c.replace(
  `                        <div className="mt-2 text-xs text-[var(--game-muted)]">옵션 없음</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {tab === "MATERIALS"`,
  `                        <div className="inventory-item-card__meta">옵션 없음</div>
                      )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {tab === "MATERIALS"`,
);

// materials section
const materialsOld = `{tab === "MATERIALS" ? (
          <div className="mt-6 grid gap-2">
            {filteredMaterials.length === 0 ? (
              <motion.div className="text-sm text-[var(--game-muted)]">재료가 없어. (마을 수령/구매/시드 후)</div>
            ) : (
              filteredMaterials.map((it) => (
                <div
                  key={it.itemId}
                  className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className={\`truncate text-sm font-semibold \${itemGradeNameClassName(it.grade ?? 1)}\`}>{it.name}</div>
                      {it.gradeLabel ? (
                        <span className="inventory-badge-grade">
                          {it.gradeLabel}
                        </span>
                      ) : null}
                      <span className="inventory-badge-cat">
                        {it.category}
                      </span>
                      <span className="font-mono text-xs text-[var(--game-muted)]">{it.itemId}</span>
                    </div>
                    <div className="mt-1 text-sm text-[var(--game-muted)]">
                      수량: <span className="font-semibold">{fmtInt(it.quantity)}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {isMinionRecruitItemId(it.itemId) ? (
                      <button
                        className="inventory-btn inventory-btn-violet h-10 px-4 text-sm disabled:opacity-50"
                        disabled={!!busy}
                        onClick={async () => {
                          setBusy("hatch-egg");
                          setError(null);
                          try {
                            await postJson("/api/minions/hatch", {});
                            await refresh();
                          } catch (e) {
                            setError(e);
                          } finally {
                            setBusy(null);
                          }
                        }}
                      >
                        미니언 고용
                      </button>
                    ) : null}
                    <button
                      className="inventory-btn h-10 px-4 text-sm"
                      onClick={() => void openSell(it)}
                    >
                      판매하기
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          ) : null}`;

const materialsNew = `{tab === "MATERIALS" ? (
          <motion.div className="inventory-item-list">
            {filteredMaterials.length === 0 ? (
              <div className="text-sm text-[var(--game-muted)]">재료가 없어. (마을 수령/구매/시드 후)</div>
            ) : (
              filteredMaterials.map((it) => (
                <div key={it.itemId} className="inventory-item-card">
                  <ItemIcon
                    itemId={it.itemId}
                    icon={it.icon}
                    iconSrc={it.iconSrc}
                    size={48}
                    className="shrink-0"
                  />
                  <div className="inventory-item-card__body min-w-0">
                    <div className="inventory-item-card__title">
                      <div className={\`inventory-item-card__name \${itemGradeNameClassName(it.grade ?? 1)}\`}>{it.name}</div>
                      {it.gradeLabel ? <span className="inventory-badge-grade">{it.gradeLabel}</span> : null}
                      <span className="inventory-badge-cat">{it.category}</span>
                    </div>
                    <div className="inventory-item-card__meta">
                      수량 <span className="font-semibold text-[var(--game-text)]">{fmtInt(it.quantity)}</span>
                    </div>
                    <div className="inventory-item-card__id">{it.itemId}</div>
                  </div>
                  <div className="inventory-item-card__actions">
                    {isMinionRecruitItemId(it.itemId) ? (
                      <button
                        type="button"
                        className="inventory-btn inventory-btn-violet h-10 px-4 text-sm disabled:opacity-50"
                        disabled={!!busy}
                        onClick={async () => {
                          setBusy("hatch");
                          setError(null);
                          try {
                            await postJson("/api/minions/hatch", { itemId: it.itemId });
                            await refresh();
                          } catch (e) {
                            setError(e);
                          } finally {
                            setBusy(null);
                          }
                        }}
                      >
                        미니언 고용
                      </button>
                    ) : null}
                    <button type="button" className="inventory-btn h-10 px-4 text-sm" onClick={() => void openSell(it)}>
                      판매하기
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          ) : null}`;

if (c.includes(materialsOld.replace(/motion\.div/g, "div"))) {
  c = c.replace(materialsOld.replace(/motion\.div/g, "motion.div"), materialsNew.replace(/motion\.div/g, "div"));
} else if (!c.includes("ItemIcon\n                    itemId={it.itemId}")) {
  console.warn("materials block not replaced - may need manual fix");
}

// weapon id/meta classes
c = c.replace(
  '                      <div className="mt-1 font-mono text-xs text-[var(--game-muted)]">{w.id}</div>\n                      <div className="mt-1 text-xs text-[var(--game-muted)]">베이스: {w.baseItemId}</div>',
  '                      <motion.div className="inventory-item-card__id">{w.id}</div>\n                      <div className="inventory-item-card__meta">베이스: {w.baseItemId}</div>',
).replace(/motion\.motion.div/g, "div").replace("<motion.div className=\"inventory-item-card__id\"", '<motion.div className="inventory-item-card__id"'.replace("motion.", ""));

writeFileSync(path, c.replace(/\n/g, "\n"), "utf8");
console.log({
  itemIconMaterials: c.includes("icon={it.icon}"),
  inventorySection: c.includes("inventory-section"),
  zincLeft: (c.match(/border-zinc-200/g) ?? []).length,
});
