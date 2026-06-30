/** Supabase pooler DATABASE_URL 정규화 — 42P05 prepared statement 오류 방지 */
export function normalizeDatabaseUrl(raw: string | undefined): string {
  if (!raw) {
    throw new Error("DATABASE_URL is not set");
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }

  if (!url.hostname.includes("pooler.supabase.com")) {
    return raw;
  }

  const port = url.port || "5432";

  if (port === "5432" && url.searchParams.get("pgbouncer") === "true") {
    throw new Error(
      "DATABASE_URL: port 5432 + pgbouncer=true 조합은 prepared statement 오류(42P05)를 유발합니다. " +
        "Transaction pooler 포트 6543 + ?pgbouncer=true&connection_limit=1 을 사용하세요.",
    );
  }

  if (port === "5432" && url.hostname.includes("pooler.supabase.com")) {
    const isDev = process.env.NODE_ENV === "development";
    const limitRaw = url.searchParams.get("connection_limit");
    const limit = limitRaw ? Number(limitRaw) : NaN;
    if (isDev && (!Number.isFinite(limit) || limit < 5)) {
      url.searchParams.set("connection_limit", "10");
    }
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", "30");
    }
    return url.toString();
  }

  if (port === "6543") {
    url.searchParams.set("pgbouncer", "true");
    const isDev = process.env.NODE_ENV === "development";
    const envLimit = Number(process.env.PRISMA_CONNECTION_LIMIT ?? "");
    const limitRaw = url.searchParams.get("connection_limit");
    const limit = limitRaw ? Number(limitRaw) : NaN;
    const minProd = Number.isFinite(envLimit) && envLimit > 0 ? Math.floor(envLimit) : 8;
    // Promise.all로 동시 쿼리가 많음 — limit=1이면 pool timeout(10s) 빈번. dev는 10, prod는 최소 8.
    if (isDev) {
      if (!Number.isFinite(limit) || limit < 5) {
        url.searchParams.set("connection_limit", "10");
      }
    } else if (!Number.isFinite(limit) || limit < minProd) {
      url.searchParams.set("connection_limit", String(minProd));
    }
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", "30");
    }
    return url.toString();
  }

  if (port === "5432" && process.env.VERCEL) {
    console.warn(
      "[db] Vercel에서 Supabase Session pooler(5432) 사용 중 — max clients 오류 가능. Transaction pooler(6543) 권장.",
    );
  }

  return raw;
}

/** .env 값에 붙은 따옴표 제거 (Windows에서 흔함) */
export function readEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  let s = raw.trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s || undefined;
}
