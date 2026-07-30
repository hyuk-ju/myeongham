import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const temporaryRoots: string[] = [];
const workspace = process.cwd();

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "myeongham-evidence-test-"));
  temporaryRoots.push(root);
  return root;
}

async function runScript(
  script: string,
  args: readonly string[],
): Promise<{ readonly stdout: string; readonly stderr: string; readonly code: number }> {
  try {
    const result = await execFileAsync(process.execPath, [resolve(workspace, script), ...args], {
      cwd: workspace,
      encoding: "utf8",
    });
    return { stdout: result.stdout, stderr: result.stderr, code: 0 };
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      typeof error.code === "number" &&
      "stdout" in error &&
      "stderr" in error &&
      typeof error.stdout === "string" &&
      typeof error.stderr === "string"
    ) {
      return { stdout: error.stdout, stderr: error.stderr, code: error.code };
    }
    throw error;
  }
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("evidence safety foundation", () => {
  it("Given the frozen scan-rule fixture When compared Then every rule is implemented", async () => {
    const fixture = JSON.parse(
      await readFile(resolve(workspace, "tests/fixtures/evidence-scan-rules.json"), "utf8"),
    );
    const scanner = await readFile(resolve(workspace, "scripts/evidence-scan.mjs"), "utf8");
    expect(Array.isArray(fixture.requiredRuleIds)).toBe(true);
    for (const rule of fixture.requiredRuleIds) {
      expect(typeof rule).toBe("string");
      expect(scanner).toContain(`id: "${rule}"`);
    }
  });

  it("Given a named synthetic secret sentinel When scanned Then only the rule and path are reported", async () => {
    const result = await runScript("scripts/evidence-scan.mjs", [
      "--include",
      "tests/fixtures/evidence-secret-sentinel.txt",
    ]);

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("clerk_secret");
    expect(result.stderr).not.toContain("SYNTHETIC_SENTINEL_1234567890");
  });

  it("Given the secret sentinel fixture When failure is expected Then only its machine code is emitted", async () => {
    const result = await runScript("scripts/evidence-scan.mjs", [
      "--fixture",
      "tests/fixtures/evidence-secret-sentinel.txt",
      "--expect-failure",
    ]);

    expect(result.code).not.toBe(0);
    expect(result.stderr.trim()).toBe("secret_or_pii_detected");
    expect(result.stderr).not.toContain("SYNTHETIC_SENTINEL_1234567890");
  });

  it("Given the value-free environment template When scanned Then it passes", async () => {
    const result = await runScript("scripts/evidence-scan.mjs", ["--include", ".env.example"]);

    expect(result).toMatchObject({ code: 0 });
  });

  it("Given a complete copied final context When sealed Then a later plan change fails verification", async () => {
    const root = await temporaryRoot();
    const inputNames = [
      "plan",
      "safe-baseline",
      "source-manifest",
      "task-evidence-manifest",
      "f1",
      "f2",
      "f3",
      "f4",
      "cleanup-receipt",
      "credential-gate",
      "head-receipt",
    ] as const;
    const argumentsList: string[] = [];
    for (const name of inputNames) {
      const path = resolve(root, `${name}.json`);
      const body = name === "safe-baseline" ? '{"included":[]}\n' : `{"fixture":"${name}"}\n`;
      await writeFile(path, body);
      argumentsList.push(`--${name}`, path);
    }
    const seal = resolve(root, "seal.json");
    const create = await runScript("scripts/final-seal.mjs", [
      ...argumentsList,
      "--output",
      seal,
    ]);
    expect(create.code).toBe(0);
    const verify = await runScript("scripts/final-seal.mjs", [
      ...argumentsList,
      "--verify",
      seal,
    ]);
    expect(verify.code).toBe(0);

    await writeFile(resolve(root, "plan.json"), '{"fixture":"changed"}\n');
    const changed = await runScript("scripts/final-seal.mjs", [
      ...argumentsList,
      "--verify",
      seal,
    ]);
    expect(changed.code).not.toBe(0);
    expect(changed.stderr).toContain("an input changed");
    expect(await readFile(seal, "utf8")).toContain("sealSha256");
  });

  it("Given explicit task inputs with task 7 absent When frozen Then the omission is rejected", async () => {
    const root = await temporaryRoot();
    const args: string[] = [];
    for (let task = 1; task <= 11; task += 1) {
      if (task !== 7) {
        args.push(
          `--task-${task}`,
          resolve(workspace, "tests/fixtures/evidence-missing-task-7/task-1-safe.txt"),
        );
      }
    }
    args.push("--output", resolve(root, "manifest.json"));
    const result = await runScript("scripts/evidence-freeze.mjs", args);

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("missing explicit --task-7 input");
  });

  it("Given eleven sanitized task inputs When frozen Then changing one input invalidates verification", async () => {
    const root = await temporaryRoot();
    const evidenceRoot = resolve(root, "evidence");
    await mkdir(evidenceRoot);
    const args: string[] = [];
    for (let task = 1; task <= 11; task += 1) {
      const path = resolve(evidenceRoot, `task-${task}-fixture.txt`);
      await writeFile(path, `sanitized task ${task}\n`);
      args.push(`--task-${task}`, path);
    }
    const manifest = resolve(root, "manifest.json");
    expect(
      (await runScript("scripts/evidence-freeze.mjs", [...args, "--output", manifest])).code,
    ).toBe(0);
    expect(
      (await runScript("scripts/evidence-freeze.mjs", [...args, "--verify", manifest])).code,
    ).toBe(0);
    await writeFile(resolve(evidenceRoot, "task-4-fixture.txt"), "changed sanitized task 4\n");
    const changed = await runScript("scripts/evidence-freeze.mjs", [
      ...args,
      "--verify",
      manifest,
    ]);
    expect(changed.code).not.toBe(0);
    expect(changed.stderr).toContain("changed after freeze");
  });
});
