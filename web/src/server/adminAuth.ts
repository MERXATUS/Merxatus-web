export function requireAdmin(req: Request) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return { ok: false as const, error: "ADMIN_TOKEN_NOT_SET" };

  const header = req.headers.get("x-admin-token") ?? "";
  if (header !== token) return { ok: false as const, error: "UNAUTHORIZED" };
  return { ok: true as const };
}

