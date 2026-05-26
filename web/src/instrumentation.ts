/**
 * 개발 서버에서만(명시 플래그) NPC 봇 틱을 주기 실행.
 * HTTP로 자기 자신을 때리지 않고 서버 함수를 직접 호출해 포트/부팅 타이밍 이슈를 피함.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  if (process.env.NODE_ENV === "production") {
    const { validateProductionEnv } = await import("@/server/productionEnv");
    validateProductionEnv();
  }

  if (process.env.NODE_ENV !== "development") return;
  if (process.env.BOT_AUTO_TICK !== "1") return;

  const g = globalThis as unknown as { __marketBotTickStarted?: boolean };
  if (g.__marketBotTickStarted) return;
  g.__marketBotTickStarted = true;

  const intervalMs = Math.max(10_000, Number(process.env.BOT_TICK_MS ?? 120_000));

  const tick = async () => {
    try {
      const { runMarketBotsTick } = await import("@/server/bots");
      const r = await runMarketBotsTick();
      if (process.env.BOT_TICK_LOG === "1") {
        console.log("[BOT_AUTO_TICK]", r.dayKey, r.actions?.slice?.(0, 5) ?? r);
      }
    } catch (e) {
      console.error("[BOT_AUTO_TICK]", e);
    }
  };

  const bootDelayMs = Math.max(0, Number(process.env.BOT_TICK_BOOT_DELAY_MS ?? 4000));
  setTimeout(() => void tick(), bootDelayMs);
  setInterval(() => void tick(), intervalMs);
}
