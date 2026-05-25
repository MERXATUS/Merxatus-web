import { readFileSync, writeFileSync } from "node:fs";

const path = "src/app/_components/InventoryPanel.tsx";
let c = readFileSync(path, "utf8").replace(/\r\n/g, "\n");

function replaceBetween(startMarker, endMarker, replacement) {
  const start = c.indexOf(startMarker);
  const end = c.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error(`markers not found: ${startMarker} -> ${endMarker}`);
  c = c.slice(0, start) + replacement + c.slice(end);
}

const weapons = `          {tab === "WEAPONS" ? (
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
                      <div className="inventory-item-card__body min-w-0">
                        <div className="inventory-item-card__title">
                          <motion.div className="flex flex-wrap items-baseline gap-0">
                            <span className={\`inventory-item-card__name \${itemGradeNameClassName(w.grade ?? 1)}\`}>
                              {w.name}
                            </span>
                            {w.enhanceLevel > 0 ? (
                              <span className="text-[var(--game-muted)]">{\` +\${w.enhanceLevel}\`}</span>
                            ) : null}
                          </div>
                          {w.gradeLabel ? <span className="inventory-badge-grade">{w.gradeLabel}</span> : null}
                        </div>
                        <div className="inventory-item-card__id">{w.id}</div>
                        <div className="inventory-item-card__meta">베이스: {w.baseItemId}</div>
                        {(w.options?.length ?? 0) > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {(w.options ?? []).map((op, i) => (
                              <span
                                key={\`\${op.kind}-\${i}\`}
                                className="inline-flex max-w-full items-center gap-1 rounded-md px-2 py-0.5 text-[11px] inventory-option-emerald"
                                title={\`\${op.label} · \${op.tierLabel}\`}
                              >
                                <span className="font-semibold">{op.tierLabel}</span>
                                <span className="truncate">{op.label}</span>
                                <span className="tabular-nums font-semibold">
                                  {op.displayValue >= 0 ? "+" : ""}
                                  {op.displayValue}
                                </span>
                              </span>
                            ))}
                          </div>
                        ) : null}
                        {upgradeInfo.text ? (
                          <div className="mt-2 text-[11px] leading-snug text-[var(--game-muted)]">{upgradeInfo.text}</div>
                        ) : null}
                      </div>
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
                          className="inventory-btn inventory-btn-enhance h-9 px-3 text-xs disabled:opacity-50"
                          disabled={!!busy || enhBusyId === w.id || upgradeInfo.atMax}
                          onClick={async () => {
                            setEnhBusyId(w.id);
                            setError(null);
                            try {
                              await postJson("/api/inventory/weapon-instance/upgrade", { weaponInstanceId: w.id });
                              await refresh();
                            } catch (e) {
                              setError(e);
                            } finally {
                              setEnhBusyId(null);
                            }
                          }}
                        >
                          강화
                        </button>
                      </div>
                    </div>
                  );
                })}
              </motion.div>
            )}
          </div>
          ) : null}

`;

const tools = `          {tab === "TOOLS" ? (
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
                    <div key={t.id} className="inventory-item-card">
                      <ItemIcon itemId={t.baseItemId} size={48} className="shrink-0" />
                      <div className="inventory-item-card__body min-w-0">
                        <div className="inventory-item-card__title">
                          <div className={\`inventory-item-card__name \${itemGradeNameClassName(t.grade ?? 1)}\`}>{t.name}</div>
                          {t.gradeLabel ? <span className="inventory-badge-grade">{t.gradeLabel}</span> : null}
                        </div>
                        <div className="inventory-item-card__id">{t.id}</div>
                        <div className="inventory-item-card__meta">베이스: {t.baseItemId}</div>
                        {(t.options?.length ?? 0) > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {(t.options ?? []).map((op, i) => (
                              <span
                                key={\`\${op.kind}-\${i}\`}
                                className="inline-flex max-w-full items-center gap-1 rounded-md px-2 py-0.5 text-[11px] inventory-option-sky"
                                title={\`\${op.label} · \${op.tierLabel}\`}
                              >
                                <span className="font-semibold">{op.tierLabel}</span>
                                <span className="truncate">{op.label}</span>
                                <span className="tabular-nums font-semibold">
                                  {op.displayValue >= 0 ? "+" : ""}
                                  {op.displayValue}
                                </span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="inventory-item-card__meta">옵션 없음</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

`;

const materials = `          {tab === "MATERIALS" ? (
          <div className="inventory-item-list">
            {filteredMaterials.length === 0 ? (
              <div className="text-sm text-[var(--game-muted)]">재료가 없어. (마을 수령/구매/시드 후)</div>
            ) : (
              filteredMaterials.map((it) => (
                <div key={it.itemId} className="inventory-item-card">
                  <ItemIcon itemId={it.itemId} icon={it.icon} iconSrc={it.iconSrc} size={48} className="shrink-0" />
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
          ) : null}

`;

const clean = (s) =>
  s
    .replaceAll("<motion.div", "<div")
    .replaceAll("</motion.div>", "</div>")
    .replaceAll("motion.div", "motion.div");

replaceBetween('          {tab === "WEAPONS" ? (', '          {tab === "TOOLS" ? (', clean(weapons));
replaceBetween('          {tab === "TOOLS" ? (', '          {tab === "MATERIALS" ? (', clean(tools));
replaceBetween('          {tab === "MATERIALS" ? (', '          <div className="inventory-notice text-sm">', clean(materials));

// fix duplicate option classes
c = c.replaceAll(
  "inline-flex max-w-full items-center gap-1 inline-flex max-w-full items-center gap-1 ",
  "inline-flex max-w-full items-center gap-1 ",
);

// remaining light buttons in sell modal etc
c = c.replaceAll(
  'className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-semibold text-[var(--game-text)]"',
  'className="inventory-btn h-9 px-3 text-xs"',
);
c = c.replaceAll(
  'className="h-10 flex-1 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-[var(--game-text)]"',
  'className="inventory-btn h-10 flex-1 px-4 text-sm"',
);

writeFileSync(path, c, "utf8");
console.log("done", {
  weapons: c.includes("ItemIcon itemId={w.baseItemId}"),
  materials: c.includes("icon={it.icon}"),
  motionTypos: c.includes("motion.div"),
});
