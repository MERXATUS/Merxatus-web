import { PrismaClient } from "@prisma/client";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set in web/.env");
  process.exit(1);
}

let host = "(invalid url)";
try {
  host = new URL(url).host;
} catch {
  /* ignore */
}
console.log("Target:", host);

const prisma = new PrismaClient({ datasources: { db: { url } } });
try {
  await prisma.$connect();
  const n = await prisma.$queryRaw`SELECT 1 AS ok`;
  console.log("OK: connected", n);
} catch (e) {
  console.error("FAIL:", e.message?.split("\n").slice(0, 3).join(" "));
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
