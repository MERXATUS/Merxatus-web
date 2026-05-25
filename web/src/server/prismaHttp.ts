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
          "DATABASE_URL을 Supabase Session pooler(aws-...pooler...:5432)로 설정했는지 확인하고 Redeploy 하세요. Vercel Runtime Logs에 더 자세한 원인이 나옵니다.",
      },
      { status: 503 },
    );
  }

  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2022") {
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
  return null;
}
