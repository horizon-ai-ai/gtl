import { execSync } from "node:child_process";
import path from "node:path";

const PORT = Number(process.env.PORT || 3000);
const cwd = process.cwd();

function read(command) {
  try {
    return execSync(command, {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

const pid = read(`lsof -ti tcp:${PORT} -sTCP:LISTEN | head -n 1`);

if (!pid) {
  process.exit(0);
}

const command = read(`ps -p ${pid} -o command=`);
const resolvedCwd = path.resolve(cwd);

if (command.includes(resolvedCwd)) {
  process.exit(0);
}

console.error("");
console.error(`[dev guard] Port ${PORT} is already occupied by another process.`);
console.error(`[dev guard] PID: ${pid}`);
console.error(`[dev guard] Command: ${command || "(unknown)"}`);
console.error("[dev guard] Stop that process first, then run `npm run dev` again.");
console.error("");
process.exit(1);
