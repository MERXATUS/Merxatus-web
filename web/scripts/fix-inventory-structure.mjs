import { readFileSync, writeFileSync } from "node:fs";

const path = "src/app/_components/InventoryPanel.tsx";
let c = readFileSync(path, "utf8").replace(/\r\n/g, "\n");

const brokenStart = `                >
                  {tab === "WEAPONS" ? (
          <div className="inventory-section">`;

const noticeMarker = `          <motion.div className="inventory-notice text-sm">`;
const noticeMarker2 = `          <div className="inventory-notice text-sm">`;

const noticeIdx = c.indexOf(noticeMarker2);
const brokenIdx = c.indexOf(brokenStart);
if (brokenIdx < 0 || noticeIdx < 0) throw new Error("markers missing");

const tabSections = c.slice(brokenIdx + `                >
                  {tab === "WEAPONS" ? (
`.length, noticeIdx);

const sortAndTabs = `                >
                  {tab === "WEAPONS" ? (
                    <>
                      <option value="newest">획득 순 · 최신</option>
                      <option value="oldest">획득 순 · 오래됨</option>
                      <option value="name_az">이름 가나다</option>
                      <option value="name_za">이름 역순</option>
                      <option value="enh_high">강화 높은 순</option>
                      <option value="enh_low">강화 낮은 순</option>
                      <option value="grade_high">등급 높은 순</option>
                      <option value="grade_low">등급 낮은 순</option>
                    </>
                  ) : tab === "TOOLS" ? (
                    <>
                      <option value="newest">획득 순 · 최신</option>
                      <option value="oldest">획득 순 · 오래됨</option>
                      <option value="name_az">이름 가나다</option>
                      <option value="name_za">이름 역순</option>
                      <option value="grade_high">등급 높은 순</option>
                      <option value="grade_low">등급 낮은 순</option>
                    </>
                  ) : (
                    <>
                      <option value="qty_high">수량 많은 순</option>
                      <option value="qty_low">수량 적은 순</option>
                      <option value="name_az">이름 가나다</option>
                      <option value="name_za">이름 역순</option>
                      <option value="grade_high">등급 높은 순</option>
                      <option value="grade_low">등급 낮은 순</option>
                      <option value="id_az">itemId 가나다</option>
                    </>
                  )}
                </select>
              </div>
            </div>
          </div>

          {error ? (
            <div className="mt-4 space-y-2">
              {inventoryErrorHint ? (
                <div className="inventory-alert-warn rounded-xl px-3 py-2 text-sm">
                  {inventoryErrorHint}
                </div>
              ) : null}
              <pre className="inventory-alert-error overflow-auto rounded-xl p-3 text-xs">
                {JSON.stringify(error, null, 2)}
              </pre>
            </div>
          ) : null}

          {tab === "WEAPONS" ? (
${tabSections.trimStart().replace(/^          <div className="inventory-section">/, "          <div className=\"inventory-section\">")}
`;

c = c.slice(0, brokenIdx) + sortAndTabs + c.slice(noticeIdx);

writeFileSync(path, c, "utf8");
console.log("fixed", {
  selectOptions: c.includes('<option value="newest">획득 순 · 최신</option>'),
  weaponsOutsideSelect: c.indexOf("inventory-section") > c.indexOf("</select>"),
});
