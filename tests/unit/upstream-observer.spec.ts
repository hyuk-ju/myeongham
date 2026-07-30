import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";

async function waitForState(path: string): Promise<{ readonly count: number; readonly held: boolean }> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const value: unknown = JSON.parse(await readFile(path, "utf8"));
      if (typeof value === "object" && value !== null && "count" in value && "held" in value && typeof value.count === "number" && typeof value.held === "boolean") return { count: value.count, held: value.held };
    } catch {
      await new Promise((settle) => setTimeout(settle, 20));
    }
  }
  throw new Error("observer self-test timed out");
}

describe("server-side upstream observer", () => {
  it("Given the preload in a child process When a target fetch is held and released Then the sanitized receipt records one call", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "myeongham-observer-test-"));
    const statePath = resolve(root, "queue-upstream-observer.json");
    const releasePath = resolve(root, "queue-upstream-release");
    const preload = resolve(process.cwd(), "tests/e2e/upstream-observer.mjs");
    const child = spawn(process.execPath, ["--import", preload, "-e", "await fetch('https://chatgpt.com/backend-api/test')"], {
      env: { ...process.env, E2E_RUN_ROOT: root, QUEUE_UPSTREAM_OBSERVER: "1" },
      stdio: "ignore",
    });
    try {
      await expect(waitForState(statePath)).resolves.toEqual({ count: 1, held: true });
      await writeFile(releasePath, "release", { mode: 0o600 });
      await new Promise<void>((resolveChild, reject) => {
        child.once("error", reject);
        child.once("exit", () => resolveChild());
      });
      await expect(readFile(statePath, "utf8")).resolves.toBe(JSON.stringify({ count: 1, held: false }));
    } finally {
      child.kill();
      await rm(root, { recursive: true, force: true });
    }
  });
});
