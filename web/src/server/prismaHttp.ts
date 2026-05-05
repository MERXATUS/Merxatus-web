import { Prisma } from "@prisma/client";

/** DB에 스키마 컬럼이 없을 때(P2022). npx prisma db push 필요 */
export function prismaKnownErrorResponse(e: unknown): Response | null {
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
