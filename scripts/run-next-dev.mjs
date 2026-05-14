import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const port = process.env.PORT || "3000";
const distDir = process.env.NEXT_DIST_DIR || ".next-dev";
const cwd = process.cwd();

async function ensureMiddlewareManifest() {
  const serverDir = path.join(cwd, distDir, "server");
  const manifestPath = path.join(serverDir, "middleware-manifest.json");
  await mkdir(serverDir, { recursive: true });
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        version: 3,
        middleware: {},
        functions: {},
        sortedMiddleware: [],
      },
      null,
      2,
    ),
    "utf8",
  );
}

async function main() {
  await rm(path.join(cwd, distDir), { recursive: true, force: true });
  await ensureMiddlewareManifest();

  const guard = spawn(process.execPath, ["scripts/ensure-dev-port.mjs"], {
    cwd,
    stdio: "inherit",
    env: { ...process.env, PORT: port },
  });

  const guardCode = await new Promise((resolve) => guard.on("exit", resolve));
  if (guardCode !== 0) {
    process.exit(Number(guardCode) || 1);
  }

  const next = spawn(
    path.join(cwd, "node_modules", ".bin", "next"),
    ["dev", "-p", port],
    {
      cwd,
      stdio: "inherit",
      env: { ...process.env, NEXT_DIST_DIR: distDir, PORT: port },
    },
  );

  const interval = setInterval(() => {
    void ensureMiddlewareManifest();
  }, 1000);

  const shutdown = (signal) => {
    clearInterval(interval);
    next.kill(signal);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  next.on("exit", (code) => {
    clearInterval(interval);
    process.exit(code ?? 0);
  });
}

void main();
