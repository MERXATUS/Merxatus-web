import { GAME_RULES } from "@/server/gameRules";

/** 줄바꿈 과다·공백만 방지, 길이 클램프 */
export function normalizeChatBody(raw: string): { ok: true; body: string } | { ok: false; error: string } {
  let s = raw.replace(/\r\n/g, "\n").trim();
  if (s.length === 0) return { ok: false, error: "EMPTY_BODY" };
  const lines = s.split("\n").slice(0, 8);
  s = lines.join("\n").slice(0, GAME_RULES.chat.maxBodyLength);
  if (s.trim().length === 0) return { ok: false, error: "EMPTY_BODY" };
  return { ok: true, body: s.trim() };
}
