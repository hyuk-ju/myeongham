import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

const execFileAsync = promisify(execFile);
const workspace = process.cwd();
const temporaryRoots: string[] = [];

const evidenceFileSchema = z.object({
  path: z.string(),
  byteSize: z.number(),
  sha256: z.string(),
});
const taskManifestSchema = z.object({
  version: z.literal(1),
  tasks: z.array(z.object({ task: z.number(), files: z.array(evidenceFileSchema) })),
  manifestSha256: z.string(),
});
const sourceFileSchema = z.object({
  path: z.string(),
  type: z.enum(["regular", "symlink"]),
  gitMode: z.string(),
  byteSize: z.number(),
  sha256: z.string(),
});
const sourceManifestSchema = z.object({
  version: z.literal(2),
  baseHead: z.string(),
  files: z.array(sourceFileSchema),
  deletions: z.array(z.object({ path: z.string(), gitMode: z.string(), objectSha: z.string() })),
  treeSha256: z.string(),
  manifestSha256: z.string(),
});

function canonical(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "myeongham-evidence-audit-test-"));
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

async function createCurrentSourceManifest(root: string): Promise<string> {
  const output = resolve(root, "source-manifest.json");
  const head = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: workspace })).stdout.trim();
  const result = await runScript("scripts/delivery-snapshot.mjs", [
    "--source-root",
    workspace,
    "--base-head",
    head,
    "--output",
    output,
  ]);
  expect(result.code).toBe(0);
  return output;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("evidence audit CLI", () => {
  it("Given frozen manifests When audited twice Then deterministic sanitized receipts match", async () => {
    const root = await temporaryRoot();
    const sourceManifest = await createCurrentSourceManifest(root);
    const taskManifest = resolve(
      workspace,
      ".omo/evidence/business-card-priority-fixes/snapshots/task-evidence-manifest.json",
    );
    const first = resolve(root, "first.md");
    const second = resolve(root, "second.md");

    for (const output of [first, second]) {
      const result = await runScript("scripts/evidence-audit.mjs", [
        "--manifest",
        taskManifest,
        "--source-manifest",
        sourceManifest,
        "--output",
        output,
      ]);
      expect(result.code).toBe(0);
    }

    const firstReceipt = await readFile(first, "utf8");
    expect(firstReceipt).toBe(await readFile(second, "utf8"));
    expect(firstReceipt).toContain("Verdict: PASS");
    expect(firstReceipt).toContain("Tasks: 11/11");
    expect(firstReceipt).not.toContain(workspace);
  });

  it("Given the missing-task-7 fixture When failure is expected Then only its machine code is emitted", async () => {
    const before = (await readdir(resolve(workspace, ".omo"), { recursive: true })).filter((path) =>
      path.endsWith("task-1-safe.txt"),
    );
    const result = await runScript("scripts/evidence-audit.mjs", [
      "--fixture",
      "tests/fixtures/evidence-missing-task-7",
      "--expect-failure",
    ]);
    const after = (await readdir(resolve(workspace, ".omo"), { recursive: true })).filter((path) =>
      path.endsWith("task-1-safe.txt"),
    );

    expect(result.code).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("missing_evidence:task-7\n");
    expect(after).toEqual(before);
  });

  it("Given a canonical task manifest with changed evidence hash When audited Then bytes are rejected", async () => {
    const root = await temporaryRoot();
    const sourceManifest = await createCurrentSourceManifest(root);
    const original = taskManifestSchema.parse(
      JSON.parse(
        await readFile(
          resolve(
            workspace,
            ".omo/evidence/business-card-priority-fixes/snapshots/task-evidence-manifest.json",
          ),
          "utf8",
        ),
      ),
    );
    const tasks = original.tasks.map((task) =>
      task.task === 1
        ? { ...task, files: task.files.map((file, index) => (index === 0 ? { ...file, sha256: "0".repeat(64) } : file)) }
        : task,
    );
    const unsigned = { version: 1, tasks } as const;
    const changed = { ...unsigned, manifestSha256: sha256(canonical(unsigned)) };
    const changedPath = resolve(root, "changed-task-manifest.json");
    await writeFile(changedPath, canonical(changed));

    const result = await runScript("scripts/evidence-audit.mjs", [
      "--manifest",
      changedPath,
      "--source-manifest",
      sourceManifest,
      "--output",
      resolve(root, "receipt.md"),
    ]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("evidence_hash_mismatch");
  });

  it("Given a canonical source manifest with changed mode When audited Then mode drift is rejected", async () => {
    const root = await temporaryRoot();
    const sourcePath = await createCurrentSourceManifest(root);
    const original = sourceManifestSchema.parse(JSON.parse(await readFile(sourcePath, "utf8")));
    const files = original.files.map((file) =>
      file.path === "scripts/delivery-snapshot.mjs" ? { ...file, gitMode: "100755" } : file,
    );
    const treeSha256 = sha256(canonical({ files, deletions: original.deletions }));
    const unsigned = {
      version: 2,
      baseHead: original.baseHead,
      files,
      deletions: original.deletions,
      treeSha256,
    } as const;
    const changed = { ...unsigned, manifestSha256: sha256(canonical(unsigned)) };
    const changedPath = resolve(root, "changed-source-manifest.json");
    await writeFile(changedPath, canonical(changed));

    const result = await runScript("scripts/evidence-audit.mjs", [
      "--manifest",
      resolve(
        workspace,
        ".omo/evidence/business-card-priority-fixes/snapshots/task-evidence-manifest.json",
      ),
      "--source-manifest",
      changedPath,
      "--output",
      resolve(root, "receipt.md"),
    ]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("source_mode_mismatch");
  });

  it("Given only a narrative report for one task When audited Then self-reported-only proof is rejected", async () => {
    const root = await temporaryRoot();
    const sourceManifest = await createCurrentSourceManifest(root);
    const original = taskManifestSchema.parse(
      JSON.parse(
        await readFile(
          resolve(
            workspace,
            ".omo/evidence/business-card-priority-fixes/snapshots/task-evidence-manifest.json",
          ),
          "utf8",
        ),
      ),
    );
    const reportPath = ".omo/evidence/business-card-priority-fixes/task-8-core-flow-report.md";
    const reportBytes = await readFile(resolve(workspace, reportPath));
    const tasks = original.tasks.map((task) =>
      task.task === 8
        ? {
            task: 8,
            files: [{ path: reportPath, byteSize: reportBytes.byteLength, sha256: createHash("sha256").update(reportBytes).digest("hex") }],
          }
        : task,
    );
    const unsigned = { version: 1, tasks } as const;
    const changedPath = resolve(root, "self-report-manifest.json");
    await writeFile(
      changedPath,
      canonical({ ...unsigned, manifestSha256: sha256(canonical(unsigned)) }),
    );

    const result = await runScript("scripts/evidence-audit.mjs", [
      "--manifest",
      changedPath,
      "--source-manifest",
      sourceManifest,
      "--output",
      resolve(root, "receipt.md"),
    ]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("self_reported_only:task-8");
  });

  it("Given the legacy root CLI When run Then existing behavior remains available", async () => {
    const root = await temporaryRoot();
    const evidenceRoot = resolve(root, "evidence");
    await mkdir(evidenceRoot);
    await writeFile(resolve(evidenceRoot, "task-1-proof.txt"), "sanitized proof\n");

    const result = await runScript("scripts/evidence-audit.mjs", ["--root", evidenceRoot]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('"status":"ok"');
  });
});
