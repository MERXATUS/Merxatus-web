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
