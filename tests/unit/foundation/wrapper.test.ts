import { execFile } from "node:child_process";
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const workspace = process.cwd();

async function invoke(args: readonly string[]): Promise<{
  readonly code: number;
  readonly stderr: string;
}> {
  try {
    await execFileAsync(
      process.execPath,
      [resolve(workspace, "scripts/run-local-supabase.mjs"), ...args],
      { cwd: workspace, encoding: "utf8" },
    );
    return { code: 0, stderr: "" };
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      typeof error.code === "number" &&
      "stderr" in error &&
      typeof error.stderr === "string"
    ) {
      return { code: error.code, stderr: error.stderr };
    }
    throw error;
  }
}

describe("exclusive local Supabase wrapper", () => {
  it("Given a remote flag When invoked Then it fails before process creation", async () => {
    const result = await invoke([
      "--",
      "npx",
      "supabase",
      "status",
      "--project-ref",
      "synthetic-remote",
    ]);

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("remote or linked Supabase targets are forbidden");
  });

  it("Given lifecycle source files When inspected Then no direct Supabase CLI child exists", async () => {
    const scripts = ["scripts/run-local-production-e2e.mjs", "package.json"];
    for (const path of scripts) {
      const source = await readFile(resolve(workspace, path), "utf8");
      expect(source).not.toMatch(/spawn\(\s*["']npx["']\s*,\s*\[\s*["']supabase["']/);
    }
    const runner = await readFile(
      resolve(workspace, "scripts/run-local-production-e2e.mjs"),
      "utf8",
    );
    expect(runner).toContain("run-local-supabase.mjs");
    const packageJson = await readFile(resolve(workspace, "package.json"), "utf8");
    expect(packageJson).toContain(
      "node scripts/run-local-supabase.mjs -- npx supabase test db",
    );
    expect(runner).toContain('["status", "-o", "env"]');
  });

  it("Given a sentinel replacement wrapper When production E2E starts Then lifecycle process creation cannot bypass it", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "myeongham-wrapper-sentinel-"));
    try {
      await mkdir(resolve(root, "scripts"), { recursive: true });
      await copyFile(
        resolve(workspace, "scripts/run-local-production-e2e.mjs"),
        resolve(root, "scripts/run-local-production-e2e.mjs"),
      );
      await writeFile(
        resolve(root, "scripts/run-local-supabase.mjs"),
        [
          'import { writeFile } from "node:fs/promises";',
          'import { resolve } from "node:path";',
          'await writeFile(resolve(process.cwd(), "sentinel-called"), "called\\n");',
          "process.exitCode = 73;",
          "",
        ].join("\n"),
      );
      const environment = {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: `pk_test_${Buffer.from(
          "fixture.clerk.accounts.dev$",
        ).toString("base64")}`,
        CLERK_SECRET_KEY: "sk_test_synthetic_fixture_value",
        CLERK_TESTING_TOKEN: "synthetic-testing-token",
        CLERK_FAPI: "fixture.clerk.accounts.dev",
        DEV_LOGIN_USER_ID: "synthetic-user",
        ALLOWED_USER_IDS: "synthetic-user",
      };
      const result = await execFileAsync(
        process.execPath,
        [
          resolve(root, "scripts/run-local-production-e2e.mjs"),
          "--",
          "tests/e2e/authenticated-smoke.spec.ts",
        ],
        { cwd: root, env: environment, encoding: "utf8" },
      ).then(
        ({ stdout, stderr }) => ({ code: 0, stdout, stderr }),
        (error: unknown) => {
          if (
            error instanceof Error &&
            "code" in error &&
            typeof error.code === "number" &&
            "stdout" in error &&
            "stderr" in error &&
            typeof error.stdout === "string" &&
            typeof error.stderr === "string"
          ) {
            return { code: error.code, stdout: error.stdout, stderr: error.stderr };
          }
          throw error;
        },
      );

      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain('"gate":"local_stack_gate"');
      expect(await readFile(resolve(root, "sentinel-called"), "utf8")).toBe("called\n");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("Given an intercepted npx process When local commands run Then migration, status, and reset all pass through the wrapper", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "myeongham-npx-intercept-"));
    try {
      const bin = resolve(root, "bin");
      const log = resolve(root, "npx-argv.txt");
      await mkdir(bin);
      const npx = resolve(bin, "npx");
      await writeFile(
        npx,
        '#!/bin/sh\nprintf "%s\\n" "$*" > "$SUPABASE_SENTINEL_LOG"\n',
      );
      await chmod(npx, 0o755);
      const environment = {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        SUPABASE_SENTINEL_LOG: log,
        CLERK_FAPI: "fixture.clerk.accounts.dev",
      };
      const commands = [
        ["migration", "new", "fixture"],
        ["status", "-o", "env"],
        ["db", "reset"],
      ] as const;
      for (const command of commands) {
        const result = await execFileAsync(
          process.execPath,
          [
            resolve(workspace, "scripts/run-local-supabase.mjs"),
            "--",
            "npx",
            "supabase",
            ...command,
          ],
          { cwd: workspace, env: environment, encoding: "utf8" },
        );
        expect(result.stderr).toBe("");
        expect(await readFile(log, "utf8")).toBe(`supabase ${command.join(" ")}\n`);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
