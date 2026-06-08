import { PrismaClient } from "@prisma/client";
import { normalizeDatabaseUrl } from "./envUtil";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const databaseUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);

/** Supabase pooler(connection_limit=1)에서 트랜잭션 대기·타임아웃 여유 */
export const PRISMA_TX_OPTS = { maxWait: 30_000, timeout: 30_000 } as const;

export type PrismaTxClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends" | "$use"
>;

export async function runPrismaTransaction<T>(fn: (tx: PrismaTxClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn, PRISMA_TX_OPTS);
}

/** Supabase Transaction pooler(6543)는 interactive $transaction 미지원 — updateMany 낙관적 잠금 */
export const RUN_STATE_CHANGED = "RUN_STATE_CHANGED";

export function assertRowsUpdated(count: number, code = RUN_STATE_CHANGED) {
  if (count <= 0) throw new Error(code);
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    datasources: { db: { url: databaseUrl } },
  });

/** Vercel 등 서버리스에서 인스턴스당 PrismaClient·DB 연결 폭증 방지 */
globalForPrisma.prisma = prisma;

