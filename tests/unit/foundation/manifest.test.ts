import { execFile } from "node:child_process";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  realpath,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const workspace = process.cwd();
const temporaryRoots: string[] = [];

type CommandResult = {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
};

async function run(command: string, args: readonly string[], cwd: string): Promise<CommandResult> {
  try {
    const result = await execFileAsync(command, args, { cwd, encoding: "utf8" });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
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
      return { code: error.code, stdout: error.stdout, stderr: error.stderr };
    }
    throw error;
  }
}

async function git(root: string, args: readonly string[]): Promise<string> {
  const result = await run("git", args, root);
  if (result.code !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

async function fixtureRepository(): Promise<{
  readonly root: string;
  readonly baseHead: string;
}> {
  const root = await mkdtemp(resolve(tmpdir(), "myeongham-manifest-test-"));
  temporaryRoots.push(root);
  await git(root, ["init"]);
  await git(root, ["config", "user.name", "Fixture"]);
  await git(root, ["config", "user.email", "fixture@invalid.test"]);
  await writeFile(resolve(root, ".gitignore"), "ignored.txt\n");
  await writeFile(resolve(root, "deleted.txt"), "delete me\n");
  await writeFile(resolve(root, "mode.txt"), "executable fixture\n");
  await mkdir(resolve(root, "links"));
  await writeFile(resolve(root, "links", "target.txt"), "target\n");
  await git(root, ["add", "."]);
  await git(root, ["commit", "-m", "base"]);
  const normalizedRoot = await realpath(root);
  return { root: normalizedRoot, baseHead: await git(normalizedRoot, ["rev-parse", "HEAD"]) };
}

async function outputPath(name: string): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "myeongham-manifest-output-"));
  temporaryRoots.push(root);
  return resolve(root, name);
}

async function snapshot(root: string, baseHead: string, output: string): Promise<CommandResult> {
  return run(
    process.execPath,
    [
      resolve(workspace, "scripts/delivery-snapshot.mjs"),
      "--source-root",
      root,
      "--base-head",
      baseHead,
      "--output",
      output,
    ],
    root,
  );
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("canonical source manifest v2", () => {
  it("Given deletion, executable, safe symlink, and untracked file When materialized Then the round trip is exact and source Git state is unchanged", async () => {
    const fixture = await fixtureRepository();
    await unlink(resolve(fixture.root, "deleted.txt"));
    await chmod(resolve(fixture.root, "mode.txt"), 0o755);
    await symlink("target.txt", resolve(fixture.root, "links", "safe-link"));
    await writeFile(resolve(fixture.root, "untracked.txt"), "untracked\n");
    const indexBefore = await readFile(resolve(fixture.root, ".git", "index"));
    const headBefore = await git(fixture.root, ["rev-parse", "HEAD"]);
    const statusBefore = await git(fixture.root, ["status", "--porcelain=v1"]);
    const manifestPath = await outputPath("manifest.json");
    const captured = await snapshot(fixture.root, fixture.baseHead, manifestPath);
    expect(captured.code).toBe(0);
    const manifest: unknown = JSON.parse(await readFile(manifestPath, "utf8"));
    expect(manifest).toMatchObject({ version: 2, baseHead: fixture.baseHead });

    const clone = await mkdtemp(resolve(tmpdir(), "myeongham-materialized-test-"));
    temporaryRoots.push(clone);
    await rm(clone, { recursive: true, force: true });
    const cloned = await run("git", ["clone", "--quiet", fixture.root, clone], fixture.root);
    expect(cloned.code).toBe(0);
    const materialized = await run(
      process.execPath,
      [
        resolve(workspace, "scripts/materialize-review-tree.mjs"),
        "--source-root",
        fixture.root,
        "--base-head",
        fixture.baseHead,
        "--manifest",
        manifestPath,
        "--destination",
        clone,
      ],
      fixture.root,
    );
    expect(materialized.code).toBe(0);
    await expect(lstat(resolve(clone, "deleted.txt"))).rejects.toMatchObject({ code: "ENOENT" });
    expect((await lstat(resolve(clone, "mode.txt"))).mode & 0o111).not.toBe(0);
    expect(await readlink(resolve(clone, "links", "safe-link"))).toBe("target.txt");
    expect(await readFile(resolve(clone, "untracked.txt"), "utf8")).toBe("untracked\n");
    expect(await readFile(resolve(fixture.root, ".git", "index"))).toEqual(indexBefore);
    expect(await git(fixture.root, ["rev-parse", "HEAD"])).toBe(headBefore);
    expect(await git(fixture.root, ["status", "--porcelain=v1"])).toBe(statusBefore);
  });

  it("Given a symlink escape When captured Then it fails closed", async () => {
    const fixture = await fixtureRepository();
    await symlink("../../outside", resolve(fixture.root, "links", "escape"));
    const result = await snapshot(
      fixture.root,
      fixture.baseHead,
      await outputPath("escape-manifest.json"),
    );

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("symlink escapes source root");
  });

  it("Given a frozen manifest When bytes or mode change Then materialization refuses it", async () => {
    const fixture = await fixtureRepository();
    const manifestPath = await outputPath("frozen.json");
    expect((await snapshot(fixture.root, fixture.baseHead, manifestPath)).code).toBe(0);
    await writeFile(resolve(fixture.root, "mode.txt"), "changed bytes\n");
    const clone = await mkdtemp(resolve(tmpdir(), "myeongham-mismatch-test-"));
    temporaryRoots.push(clone);
    await rm(clone, { recursive: true, force: true });
    expect((await run("git", ["clone", "--quiet", fixture.root, clone], fixture.root)).code).toBe(0);
    const result = await run(
      process.execPath,
      [
        resolve(workspace, "scripts/materialize-review-tree.mjs"),
        "--source-root",
        fixture.root,
        "--base-head",
        fixture.baseHead,
        "--manifest",
        manifestPath,
        "--destination",
        clone,
      ],
      fixture.root,
    );

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("no longer matches");
  });

  it("Given missing bytes, mode drift, or manifest digest drift When materialized Then every mutation fails", async () => {
    const mutations = ["missing", "mode", "digest"] as const;
    for (const mutation of mutations) {
      const fixture = await fixtureRepository();
      const manifestPath = await outputPath(`${mutation}.json`);
      expect((await snapshot(fixture.root, fixture.baseHead, manifestPath)).code).toBe(0);
      if (mutation === "missing") {
        await unlink(resolve(fixture.root, "mode.txt"));
      } else if (mutation === "mode") {
        await chmod(resolve(fixture.root, "mode.txt"), 0o755);
      } else {
        const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
        manifest.manifestSha256 = "0".repeat(64);
        await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
      }
      const clone = await mkdtemp(resolve(tmpdir(), `myeongham-${mutation}-test-`));
      temporaryRoots.push(clone);
      await rm(clone, { recursive: true, force: true });
      expect((await run("git", ["clone", "--quiet", fixture.root, clone], fixture.root)).code).toBe(0);
      const result = await run(
        process.execPath,
        [
          resolve(workspace, "scripts/materialize-review-tree.mjs"),
          "--source-root",
          fixture.root,
          "--base-head",
          fixture.baseHead,
          "--manifest",
          manifestPath,
          "--destination",
          clone,
        ],
        fixture.root,
      );
      expect(result.code, mutation).not.toBe(0);
    }
  });

  it("Given a new nonignored sentinel When captured Then the portable tree digest changes", async () => {
    const fixture = await fixtureRepository();
    const firstPath = await outputPath("first.json");
    expect((await snapshot(fixture.root, fixture.baseHead, firstPath)).code).toBe(0);
    const first = JSON.parse(await readFile(firstPath, "utf8"));
    await writeFile(resolve(fixture.root, "delivery-snapshot-sentinel.ts"), "export const sentinel = true;\n");
    const secondPath = await outputPath("second.json");
    expect((await snapshot(fixture.root, fixture.baseHead, secondPath)).code).toBe(0);
    const second = JSON.parse(await readFile(secondPath, "utf8"));

    expect(second.treeSha256).not.toBe(first.treeSha256);
  });
});
