import crypto from "node:crypto";
import type { MinionJobType } from "@prisma/client";
import { readEnv } from "@/server/envUtil";
import type { MinionCsvKind } from "@/server/minionCsvData";

const PICK_TOKEN_TTL_MS = 10 * 60 * 1000;

type RecruitPickPayload = {
  v: 1;
  userId: string;
  itemId: string;
  category: MinionCsvKind;
  candidates: MinionJobType[];
  exp: number;
};

function base64urlEncode(buf: Buffer) {
  return buf
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function base64urlDecode(s: string) {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replaceAll("-", "+").replaceAll("_", "/") + pad;
  return Buffer.from(b64, "base64");
}

function getSecret() {
  const s = readEnv("SESSION_SECRET") || readEnv("ADMIN_TOKEN");
  if (!s) throw new Error("SESSION_SECRET_NOT_SET");
  return s;
}

function sign(input: string) {
  return base64urlEncode(crypto.createHmac("sha256", getSecret()).update(input).digest());
}

export function createRecruitPickToken(input: {
  userId: string;
  itemId: string;
  category: MinionCsvKind;
  candidates: MinionJobType[];
}) {
  const payload: RecruitPickPayload = {
    v: 1,
    userId: input.userId,
    itemId: input.itemId,
    category: input.category,
    candidates: input.candidates,
    exp: Date.now() + PICK_TOKEN_TTL_MS,
  };
  const body = base64urlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${body}.${sign(body)}`;
}

export function verifyRecruitPickToken(token: string, userId: string): RecruitPickPayload {
  const [body, sig] = token.split(".", 2);
  if (!body || !sig) throw new Error("INVALID_PICK_TOKEN");

  const expected = sign(body);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error("INVALID_PICK_TOKEN");
  } catch (e) {
    if (e instanceof Error && e.message === "INVALID_PICK_TOKEN") throw e;
    throw new Error("INVALID_PICK_TOKEN");
  }

  let payload: RecruitPickPayload;
  try {
    payload = JSON.parse(base64urlDecode(body).toString("utf8")) as RecruitPickPayload;
  } catch {
    throw new Error("INVALID_PICK_TOKEN");
  }

  if (payload?.v !== 1) throw new Error("INVALID_PICK_TOKEN");
  if (payload.userId !== userId) throw new Error("INVALID_PICK_TOKEN");
  if (typeof payload.itemId !== "string" || payload.itemId.length < 1) throw new Error("INVALID_PICK_TOKEN");
  if (payload.category !== "GATHER" && payload.category !== "DUNGEON") throw new Error("INVALID_PICK_TOKEN");
  if (!Array.isArray(payload.candidates) || payload.candidates.length < 1) throw new Error("INVALID_PICK_TOKEN");
  if (typeof payload.exp !== "number" || payload.exp < Date.now()) throw new Error("PICK_TOKEN_EXPIRED");

  return payload;
}
