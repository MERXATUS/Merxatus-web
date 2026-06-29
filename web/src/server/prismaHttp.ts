import { Prisma } from "@prisma/client";

/** DB에 스키마 컬럼이 없을 때(P2022). npx prisma db push 필요 */
export function prismaKnownErrorResponse(e: unknown): Response | null {
  // DB 연결/인증 문제 (P1000/P1001 등). 보통 DATABASE_URL/네트워크/풀러 설정 이슈.
  if (e instanceof Prisma.PrismaClientInitializationError) {
    const msg = typeof e.message === "string" ? e.message : "PrismaClientInitializationError";
    return Response.json(
      {
        ok: false,
        error: "DB_CONNECTION_FAILED",
        message: msg,
        hint:
          "Supabase: DATABASE_URL은 Transaction pooler :6543 + ?pgbouncer=true&connection_limit=1 (5432/session pooler 사용 금지).",
      },
      { status: 503 },
    );
  }

  if (e instanceof Prisma.PrismaClientUnknownRequestError) {
    const msg = String(e.message ?? "");
    if (msg.includes("Timed out fetching a new connection from the connection pool")) {
      return Response.json(
        {
          ok: false,
          error: "DB_POOL_TIMEOUT",
          message: msg,
          hint:
            "Supabase Transaction pooler(6543) DATABASE_URL에 connection_limit=8 이상·pool_timeout=30 권장. Vercel 환경변수에 connection_limit=1만 있으면 앱이 자동 보정하지만 재배포가 필요할 수 있어요.",
        },
        { status: 503 },
      );
    }
    if (msg.includes("Unable to start a transaction") || msg.includes("Transaction already closed")) {
      return Response.json(
        {
          ok: false,
          error: "DB_TRANSACTION_BUSY",
          message: msg,
          hint: "DB 연결이 바쁩니다. 잠시 후 다시 시도하세요.",
        },
        { status: 503 },
      );
    }
    if (
      msg.includes("Transaction not found") ||
      msg.includes("Transaction API error") ||
      msg.includes("old closed transaction")
    ) {
      return Response.json(
        {
          ok: false,
          error: "DB_TRANSACTION_FAILED",
          message: "전투 처리 중 DB 오류가 발생했습니다.",
          hint: "잠시 후 다시 시도해 주세요. 반복되면 새로고침 후 재시도하세요.",
        },
        { status: 503 },
      );
    }
    if (msg.includes("prepared statement") || msg.includes("42P05")) {
      return Response.json(
        {
          ok: false,
          error: "DB_POOLER_MISCONFIG",
          message: msg,
          hint:
            "DATABASE_URL 포트를 6543으로, 끝에 ?pgbouncer=true&connection_limit=1 을 붙이세요. 5432+pgbouncer 조합은 사용하지 마세요.",
        },
        { status: 503 },
      );
    }
  }

  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2028" || e.code === "P2034") {
      return Response.json(
        {
          ok: false,
          error: "DB_TRANSACTION_BUSY",
          message: e.message,
          hint: "DB 연결이 바쁩니다. 잠시 후 다시 시도하세요.",
        },
        { status: 503 },
      );
    }
    if (e.code === "P2021" || e.code === "P2022") {
      return Response.json(
        {
          ok: false,
          error: "DB_SCHEMA_OUT_OF_DATE",
          message:
            "DB가 최신 스키마와 맞지 않아요. 터미널에서 프로젝트 web 폴더로 이동한 뒤 npx prisma db push 를 실행하고 서버를 재시작하세요.",
        },
        { status: 503 },
      );
    }
  }
  return null;
}
