/**
 * Google OAuth 클라이언트 ID/비밀키가 쌍으로 유효한지 확인합니다.
 * (가짜 code로 토큰 요청 → invalid_grant 이면 비밀키 OK, invalid_client 이면 비밀키 오류)
 */
import fs from "node:fs";

function parseEnvFile() {
  const text = fs.readFileSync(".env", "utf8");
  const get = (key) => {
    const m = text.match(new RegExp(`^${key}=(.*)$`, "m"));
    if (!m) return null;
    let v = m[1].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1).trim();
    }
    return v;
  };
  return {
    clientId: get("GOOGLE_CLIENT_ID"),
    clientSecret: get("GOOGLE_CLIENT_SECRET"),
    redirectUri:
      get("GOOGLE_REDIRECT_URI") ||
      "http://localhost:3000/api/auth/google/callback",
  };
}

const { clientId, clientSecret, redirectUri } = parseEnvFile();
if (!clientId || !clientSecret) {
  console.error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing in .env");
  process.exit(1);
}

const res = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    code: "fake_code_for_credential_check",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  }),
});

const json = await res.json().catch(() => ({}));
const err = json.error || "unknown";

console.log("HTTP", res.status);
console.log("Google error:", err);
if (json.error_description) console.log("Description:", json.error_description);

if (err === "invalid_grant") {
  console.log("\n✓ 클라이언트 ID + 비밀키는 Google이 인정합니다.");
  console.log("  (코드만 틀린 것이므로 invalid_grant — 로그인 플로우는 정상 가능)");
  process.exit(0);
}

if (err === "invalid_client") {
  console.log("\n✗ 클라이언트 ID 또는 비밀키가 Google과 맞지 않습니다.");
  console.log("  Google 콘솔에서 같은 웹 클라이언트의 새 비밀번호를 발급해 .env에 넣으세요.");
  process.exit(1);
}

console.log("\n? 예상과 다른 응답입니다. 콘솔 OAuth 클라이언트 유형(웹)을 확인하세요.");
process.exit(2);
