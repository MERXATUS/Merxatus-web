import fs from "node:fs";
import path from "node:path";

const envPath = path.join(process.cwd(), ".env");
const text = fs.readFileSync(envPath, "utf8");

function parseLine(key) {
  const re = new RegExp(`^${key}=(.*)$`, "m");
  const m = text.match(re);
  if (!m) return null;
  let v = m[1].trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

const id = parseLine("GOOGLE_CLIENT_ID");
const secret = parseLine("GOOGLE_CLIENT_SECRET");
const redirect = parseLine("GOOGLE_REDIRECT_URI");

console.log("GOOGLE_CLIENT_ID:", id ? `ok (${id.length} chars)` : "MISSING");
console.log(
  "  ends with .apps.googleusercontent.com:",
  !!id?.endsWith(".apps.googleusercontent.com"),
);
console.log("GOOGLE_CLIENT_SECRET:", secret ? `ok (${secret.length} chars)` : "MISSING");
console.log("  starts with GOCSPX-:", secret?.startsWith("GOCSPX-") ?? false);
console.log("  contains whitespace:", secret ? /\s/.test(secret) : false);
console.log("GOOGLE_REDIRECT_URI:", redirect || "(auto from request origin)");

// process.env (what Next dev server sees if run with same cwd)
console.log("\nprocess.env from shell:");
console.log(
  "  GOOGLE_CLIENT_ID:",
  process.env.GOOGLE_CLIENT_ID ? `set (${process.env.GOOGLE_CLIENT_ID.length} chars)` : "NOT SET",
);
console.log(
  "  GOOGLE_CLIENT_SECRET:",
  process.env.GOOGLE_CLIENT_SECRET
    ? `set (${process.env.GOOGLE_CLIENT_SECRET.length} chars)`
    : "NOT SET",
);
