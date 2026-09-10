import type { ChildProcess } from "node:child_process";

import { spawn, spawnSync } from "node:child_process";

interface DevProcess {
  name: string;
  child: ChildProcess;
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

runChecked(process.execPath, ["scripts/ensure-generated.ts"]);

const processes: DevProcess[] = [
  startProcess("api", process.execPath, ["--watch", "--watch-preserve-output", "src/server/index.ts"]),
  startProcess("web", npmCommand, ["run", "dev", "--workspace", "web", "--", "--clearScreen", "false"]),
];

console.log("API runtime: http://localhost:3000");
console.log("Web console: http://localhost:5173");

await waitForProcesses(processes);

function runChecked(command: string, args: string[]): void {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function startProcess(name: string, command: string, args: string[]): DevProcess {
  return {
    name,
    child: spawn(command, args, {
      cwd: process.cwd(),
      stdio: "inherit",
    }),
  };
}

function waitForProcesses(processes: DevProcess[]): Promise<void> {
  let shuttingDown = false;

  return new Promise((resolve) => {
    const shutdown = (exitCode: number, signal?: NodeJS.Signals): void => {
      if (shuttingDown) {
        return;
      }

      shuttingDown = true;
      process.exitCode = exitCode;
      stopProcesses(processes, signal);
      resolve();
    };

    for (const processInfo of processes) {
      processInfo.child.on("error", (error) => {
        console.error(`${processInfo.name} failed to start: ${error.message}`);
        shutdown(1);
      });
      processInfo.child.on("close", (code, signal) => {
        if (!shuttingDown) {
          if (signal && signal !== "SIGINT" && signal !== "SIGTERM") {
            console.error(`${processInfo.name} exited with ${signal}.`);
          } else if (code != null && code !== 0) {
            console.error(`${processInfo.name} exited with code ${code}.`);
          }
          shutdown(code ?? exitCodeForSignal(signal));
        }
      });
    }

    process.once("SIGINT", () => shutdown(0, "SIGINT"));
    process.once("SIGTERM", () => shutdown(0, "SIGTERM"));
  });
}

function exitCodeForSignal(signal: NodeJS.Signals | null): number {
  return signal === "SIGINT" || signal === "SIGTERM" || signal == null ? 0 : 1;
}

function stopProcesses(processes: DevProcess[], signal: NodeJS.Signals = "SIGTERM"): void {
  for (const processInfo of processes) {
    if (processInfo.child.exitCode == null && !processInfo.child.killed) {
      processInfo.child.kill(signal);
    }
  }
}
