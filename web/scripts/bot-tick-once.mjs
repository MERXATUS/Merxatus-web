/**
 * 서버가 떠 있는 동안 수동으로 봇 틱 1회(외부 크론/CI용).
 * 사용: BOT_TICK_BASE_URL, ADMIN_TOKEN 환경변수 (또는 npm 스크립트의 --env-file)
 */
const base = (process.env.BOT_TICK_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const token = process.env.ADMIN_TOKEN;
if (!token) {
  console.error("ADMIN_TOKEN 이 없어. .env 또는 환경변수를 설정해.");
  process.exit(1);
}

const url = `${base}/api/bots/tick`;
const res = await fetch(url, { method: "POST", headers: { "x-admin-token": token } });
const text = await res.text();
console.log(res.status, text);
if (!res.ok) process.exit(1);
