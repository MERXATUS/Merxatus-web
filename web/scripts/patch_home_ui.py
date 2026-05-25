from pathlib import Path

p = Path(__file__).resolve().parents[1] / "src" / "app" / "_components" / "HomeDashboard.tsx"
c = p.read_text(encoding="utf-8")

# Sidebar profile panel
old_profile = """            <motion.div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <motion.div className="text-xs font-semibold text-zinc-500">내 정보</motion.div>"""

# use DIVTAG trick
old_profile = old_profile.replace("motion.div", "DIVTAG")

c = c.replace(
    """            <DIVTAG className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <DIVTAG className="text-xs font-semibold text-zinc-500">내 정보</DIVTAG>""".replace("DIVTAG", "div"),
    """            <GamePanel>
              <GamePanelTitle>지휘관 프로필</GamePanelTitle>""",
)

old_stats = """              <DIVTAG className="mt-3 break-all font-mono text-[11px] text-zinc-600">
                {userId ? userId : "미로그인"}
              </DIVTAG>
              {refreshedAt ? (
                <DIVTAG className="mt-2 text-[11px] text-zinc-400">갱신 {refreshedAt.toLocaleTimeString()}</DIVTAG>
              ) : null}

              <DIVTAG className="mt-4 space-y-2">
                <DIVTAG className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <DIVTAG className="text-[11px] font-semibold text-zinc-600">보유 골드</DIVTAG>
                  <DIVTAG className="mt-0.5 text-sm font-semibold">{gold != null ? `${fmtInt(gold)}G` : "—"}</DIVTAG>
                </DIVTAG>
                <DIVTAG className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <DIVTAG className="text-[11px] font-semibold text-zinc-600">잠금 골드</DIVTAG>
                  <DIVTAG className="mt-0.5 text-sm font-semibold">{goldLocked != null ? `${fmtInt(goldLocked)}G` : "—"}</DIVTAG>
                </DIVTAG>
                <DIVTAG className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <DIVTAG className="text-[11px] font-semibold text-zinc-600">인벤 요약</DIVTAG>
                  <DIVTAG className="mt-0.5 text-sm font-semibold">
                    {invKinds != null && invQtySum != null ? `${fmtInt(invKinds)}종 · ${fmtInt(invQtySum)}개` : "—"}
                    {weaponInstanceCount != null ? ` · 무기 ${fmtInt(weaponInstanceCount)}개` : ""}
                  </DIVTAG>
                </DIVTAG>
              </DIVTAG>

              <button
                type="button"
                onClick={() => void refreshSummary()}
                className="mt-4 h-9 w-full rounded-xl bg-zinc-900 px-3 text-xs font-semibold text-white"
              >
                새로고침
              </button>
            </DIVTAG>""".replace("DIVTAG", "motion.div").replace("motion.div", "div")

new_stats = """              <div className="mt-3 break-all font-mono text-[11px] text-[var(--game-muted)]">
                {userId ? userId : "미로그인"}
              </div>
              {refreshedAt ? (
                <motion.div className="mt-2 text-[11px] text-[var(--game-muted-dim)]">
                  갱신 {refreshedAt.toLocaleTimeString()}
                </motion.div>
              ) : null}

              <div className="mt-4 space-y-2">
                <GameStat label="보유 골드" value={gold != null ? `${fmtInt(gold)} G` : "—"} highlight />
                <GameStat label="잠금 골드" value={goldLocked != null ? `${fmtInt(goldLocked)} G` : "—"} />
                <GameStat
                  label="인벤토리"
                  value={
                    invKinds != null && invQtySum != null
                      ? `${fmtInt(invKinds)}종 · ${fmtInt(invQtySum)}개${weaponInstanceCount != null ? ` · 무기 ${fmtInt(weaponInstanceCount)}` : ""}`
                      : "—"
                  }
                />
              </motion.div>

              <GameBtn variant="gold" className="mt-4 w-full" onClick={() => void refreshSummary()}>
                새로고침
              </GameBtn>
            </GamePanel>""".replace("motion.div", "DIV").replace("DIV", "div")

if old_stats in c:
    c = c.replace(old_stats, new_stats)
else:
    print("stats block not found")

# Header
c = c.replace(
    """            <header className="flex flex-col gap-2">
              <div className="text-sm font-semibold text-zinc-600">경제 시뮬레이션 (프로토타입)</div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">요약 대시보드</h1>
              <p className="max-w-2xl text-sm text-zinc-600 sm:text-base">
                가운데에서 메뉴를 고르고, 왼쪽은 내 상태를 확인해요. 오른쪽 하단 채팅 버튼으로 세계 채팅을 열 수
                있어요.
              </p>
            </header>""",
    """            <header className="flex flex-col gap-2 border-b border-[var(--game-border)] pb-6">
              <p className="game-wordmark">Merxatus</p>
              <h1 className="game-title">상회 지휘 센터</h1>
              <p className="game-subtitle max-w-2xl">
                수집·가공·거래·황실과 암시장을 한곳에서 운영하세요. 왼쪽은 자산 현황, 메뉴 카드로 각 시스템에
                진입합니다.
              </p>
            </header>""",
)

c = c.replace(
    'className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"',
    'className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"',
)

# Chat drawer + fab
c = c.replace(
    "className={`chat-drawer fixed z-40 flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl ${",
    "className={`chat-drawer fixed z-40 flex flex-col overflow-hidden rounded-2xl shadow-2xl ${",
)
c = c.replace(
    'className="fixed bottom-6 right-6 z-50 flex h-12 items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 shadow-lg transition hover:bg-zinc-50"',
    'className="game-chat-fab fixed bottom-6 right-6 z-50 flex h-12 items-center gap-2 rounded-full px-4 text-sm font-semibold transition"',
)

# Card accents
replacements = [
    ('title="로그인/계정"', 'glyph="◇" accent="default" title="로그인/계정"'),
    ('title="인벤토리"', 'glyph="◆" accent="gold" title="인벤토리"'),
    ('title="수집"', 'glyph="⛏" accent="emerald" title="수집"'),
    ('title="전문 작업장"', 'glyph="⚒" accent="amber" title="전문 작업장"'),
    ('title="던전"', 'glyph="⚔" accent="rose" title="던전"'),
    ('title="미니언"', 'glyph="👤" accent="indigo" title="미니언"'),
    ('title="시장(아이템)"', 'glyph="¤" accent="sky" title="시장(아이템)"'),
    ('title="황실"', 'glyph="♛" accent="gold" title="황실"'),
    ('title="지하도시(암시장)"', 'glyph="☾" accent="violet" title="지하도시(암시장)"'),
    ('title="손익(PnL)"', 'glyph="📈" accent="sky" title="손익(PnL)"'),
]
for a, b in replacements:
    c = c.replace(f"          <SummaryCard\n            {a}", f"          <SummaryCard\n            {b}")

p.write_text(c, encoding="utf-8")
print("patched")
