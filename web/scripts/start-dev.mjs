import { spawn, execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const webRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const nextBin = path.join(webRoot, "node_modules", "next", "dist", "bin", "next");

/** 삭제된 API 라우트 참조가 남으면 dev 타입 검사·Compiling이 반복될 수 있음 */
function clearStaleDevRouteTypes() {
  const devTypes = path.join(webRoot, ".next", "dev", "types");
  if (!existsSync(devTypes)) return;
  try {
    rmSync(devTypes, { recursive: true, force: true });
    console.log("[dev] cleared stale .next/dev/types");
  } catch {
    /* ignore */
  }
}

/** Windows — .next/dev 잠금(errno -4094) 시 깨진 산출물 제거 */
function clearStaleDevOutput() {
  if (process.platform !== "win32") return;
  const devRoot = path.join(webRoot, ".next", "dev");
  if (!existsSync(devRoot)) return;
  for (const sub of ["server", "static"]) {
    const target = path.join(devRoot, sub);
    if (!existsSync(target)) continue;
    try {
      rmSync(target, { recursive: true, force: true });
      console.log(`[dev] cleared stale .next/dev/${sub} (Windows cache lock fix)`);
    } catch {
      /* ignore — 다른 프로세스가 잡고 있으면 killPort3000 후 재시도 */
    }
  }
}

function killPort3000() {
  try {
    const out = execSync('netstat -ano | findstr ":3000"', { encoding: "utf8" });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes("LISTENING")) continue;
      const pid = line.trim().split(/\s+/).pop();
      if (pid && /^\d+$/.test(pid) && pid !== String(process.pid)) pids.add(pid);
    }
    for (const pid of pids) {
      try {
        execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
        console.log(`[dev] stopped previous process on :3000 (PID ${pid})`);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* port free */
  }
}

if (process.platform === "win32") {
  killPort3000();
  clearStaleDevOutput();
}

clearStaleDevRouteTypes();

if (!existsSync(nextBin)) {
  console.error("[dev] next binary not found. Run `npm install` in web/ first.");
  process.exit(1);
}

console.log("[dev] starting Next.js on http://localhost:3000…");

const child = spawn(process.execPath, [nextBin, "dev", "--webpack"], {
  cwd: webRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    // Windows 경로·백신·동기화 폴더에서 파일 감시/쓰기 오류 완화
    ...(process.platform === "win32"
      ? { WATCHPACK_POLLING: process.env.WATCHPACK_POLLING ?? "true" }
      : {}),
  },
});

child.on("error", (err) => {
  console.error("[dev] failed to start:", err.message);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`[dev] stopped (${signal})`);
  } else if (code && code !== 0) {
    console.error(`[dev] exited with code ${code}`);
  }
  process.exit(code ?? 0);
});
