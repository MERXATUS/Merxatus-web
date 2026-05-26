import { spawn, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const webRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const nextBin = path.join(webRoot, "node_modules", "next", "dist", "bin", "next");

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
}

if (!existsSync(nextBin)) {
  console.error("[dev] next binary not found. Run `npm install` in web/ first.");
  process.exit(1);
}

console.log("[dev] starting Next.js on http://localhost:3000…");

const child = spawn(process.execPath, [nextBin, "dev"], {
  cwd: webRoot,
  stdio: "inherit",
  env: { ...process.env, NEXT_DISABLE_TURBOPACK: "1" },
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
