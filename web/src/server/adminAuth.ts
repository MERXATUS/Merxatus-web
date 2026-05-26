export function requireAdmin(req: Request) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return { ok: false as const, error: "ADMIN_TOKEN_NOT_SET" };

  const header = req.headers.get("x-admin-token") ?? "";
  if (header !== token) return { ok: false as const, error: "UNAUTHORIZED" };
  return { ok: true as const };
}

/** Vercel Cron — CRON_SECRET 이 설정되면 Authorization: Bearer 로 인증 */
export function requireAdminOrCron(req: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth === `Bearer ${cronSecret}`) return { ok: true as const };
  }
  return requireAdmin(req);
}

