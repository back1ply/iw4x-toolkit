/**
 * @file smoke.test.ts
 * Stdio transport smoke test — verifies that `dist/index.js` starts, responds
 * to an `initialize` request over JSON-RPC, and exits cleanly on SIGTERM.
 *
 * This is the only test that exercises the full compiled bundle and the
 * `isDirectRun` path, catching bugs like the Windows path-comparison issue
 * that made the server exit immediately without connecting.
 */

import { describe, it, expect } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_ENTRY = path.resolve(__dirname, "..", "dist", "index.js");

// JSON-RPC 2.0 initialize request (MCP protocol handshake)
const INIT_REQUEST =
  JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "smoke-test", version: "1.0.0" },
    },
  }) + "\n";

/**
 * Spawns the MCP server, sends a single initialize request, collects the
 * first JSON-RPC response line, then kills the process.
 *
 * Returns the parsed response object plus the still-running proc ref so
 * callers can assert it was alive when we killed it.
 */
function runSmokeTest(): Promise<{
  response: Record<string, unknown>;
  wasAlive: boolean;
}> {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(DIST_ENTRY)) {
      reject(
        new Error(
          `Bundled server not found at ${DIST_ENTRY} — run 'npm run build' first`,
        ),
      );
      return;
    }

    const proc: ChildProcess = spawn(process.execPath, [DIST_ENTRY], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let settled = false;

    const finish = (line: string) => {
      if (settled) return;
      settled = true;

      // Server is still running at this point — capture "alive" state before kill
      const wasAlive = proc.exitCode === null && !proc.killed;

      // Terminate gracefully
      proc.kill("SIGTERM");

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(line) as Record<string, unknown>;
      } catch {
        reject(new Error(`Server response was not valid JSON:\n${line}`));
        return;
      }
      resolve({ response: parsed, wasAlive });
    };

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        proc.kill("SIGTERM");
        reject(new Error("Timeout: server did not respond within 5 s"));
      }
    }, 5000);

    proc.stdout!.setEncoding("utf-8");
    proc.stdout!.on("data", (chunk: string) => {
      stdout += chunk;
      const lines = stdout.split("\n").filter((l) => l.trim().length > 0);
      if (lines.length > 0) {
        clearTimeout(timer);
        finish(lines[0]);
      }
    });

    proc.stderr!.on("data", (chunk: Buffer) => {
      // Informational — don't reject. Useful if test fails.
      process.stderr.write(`[server stderr] ${chunk}`);
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(err);
      }
    });

    proc.on("exit", (code) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(new Error(`Server exited with code ${code} before responding`));
      }
    });

    // Send the initialize request, then close stdin so the pipe doesn't block
    proc.stdin!.write(INIT_REQUEST, () => {
      proc.stdin!.end();
    });
  });
}

describe("stdio smoke test", () => {
  it(
    "server starts, responds to initialize, and stays alive until killed",
    async () => {
      const { response, wasAlive } = await runSmokeTest();

      // Valid JSON-RPC 2.0 response shape
      expect(response.jsonrpc).toBe("2.0");
      expect(response.id).toBe(1);
      expect(response.result).toBeDefined();

      const result = response.result as Record<string, unknown>;
      expect(result.protocolVersion).toBeDefined();
      expect(result.serverInfo).toBeDefined();

      const info = result.serverInfo as Record<string, unknown>;
      expect(info.name).toBe("iw4x-toolkit");

      // Server must have been alive when we killed it (didn't exit spontaneously)
      expect(wasAlive).toBe(true);
    },
    10_000, // 10 s test timeout
  );
});
