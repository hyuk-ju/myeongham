#!/usr/bin/env node

import {
  lstat,
  mkdir,
  readFile,
  readlink,
  realpath,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const SECRET_PATHS = [
  /(^|\/)\.env(?:\.|$)(?!example$)/,
  /(^|\/)\.clerk(?:\/|$)/,
  /(^|\/)\.vercel(?:\/|$)/,
  /(^|\/)(?:credentials?|secrets?)(?:\.|\/|$)/i,
  /\.(?:pem|key|p12|pfx)$/i,
];

class ManifestError extends Error {
  constructor(message) {
    super(message);
    this.name = "ManifestError";
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonical(value) {
  return `${JSON.stringify(value)}\n`;
}

function isInside(root, candidate) {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}

function validateDeliveryPath(path) {
  if (path === "" || path.startsWith("/") || path.split("/").includes("..") || path.includes("\0")) {
    throw new ManifestError(`invalid delivery path: ${path}`);
  }
  if (path === ".omo" || path.startsWith(".omo/")) return false;
  if (SECRET_PATHS.some((pattern) => pattern.test(path)) && path !== ".env.example") {
    throw new ManifestError(`secret or private path is forbidden: ${path}`);
  }
  return true;
}

async function runGit(root, args) {
  const child = spawn("git", ["-C", root, ...args], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  const code = await new Promise((settle, reject) => {
    child.once("error", reject);
    child.once("exit", (exitCode) => settle(exitCode ?? 1));
  });
  if (code !== 0) {
    throw new ManifestError(Buffer.concat(stderr).toString("utf8").trim() || "git command failed");
  }
  return Buffer.concat(stdout);
}

function parseNullList(buffer) {
  const text = buffer.toString("utf8");
  if (text === "") return [];
  const values = text.split("\0");
  if (values.at(-1) === "") values.pop();
  return values;
}

function parseTree(buffer) {
  return parseNullList(buffer).map((entry) => {
    const tab = entry.indexOf("\t");
    const header = entry.slice(0, tab).split(" ");
    const path = entry.slice(tab + 1);
    const [gitMode, objectType, objectSha] = header;
    if (tab < 0 || gitMode === undefined || objectType !== "blob" || objectSha === undefined) {
      throw new ManifestError(`unsupported Git tree entry: ${entry}`);
    }
    return { path, gitMode, objectSha };
  });
}

async function normalizeRoot(sourceRoot) {
  if (!isAbsolute(sourceRoot)) throw new ManifestError("--source-root must be absolute");
  const root = await realpath(sourceRoot);
  if (resolve(sourceRoot) !== root) throw new ManifestError("--source-root must be normalized");
  const gitRoot = (await runGit(root, ["rev-parse", "--show-toplevel"])).toString("utf8").trim();
  if ((await realpath(gitRoot)) !== root) throw new ManifestError("--source-root must be the Git worktree root");
  return root;
}

async function resolveBaseHead(root, requested) {
  if (!/^[0-9a-f]{40}$/i.test(requested)) throw new ManifestError("--base-head must be a full commit SHA");
  await runGit(root, ["cat-file", "-e", `${requested}^{commit}`]);
  return (await runGit(root, ["rev-parse", `${requested}^{commit}`])).toString("utf8").trim();
}

async function recordPath(root, path) {
  if (!validateDeliveryPath(path)) return null;
  const absolute = resolve(root, path);
  if (!isInside(root, absolute)) throw new ManifestError(`path escapes source root: ${path}`);
  const stat = await lstat(absolute);
  if (stat.isSymbolicLink()) {
    const target = await readlink(absolute);
    const resolvedTarget = resolve(dirname(absolute), target);
    if (isAbsolute(target) || !isInside(root, resolvedTarget)) {
      throw new ManifestError(`symlink escapes source root: ${path}`);
    }
    let realTarget;
    try {
      realTarget = await realpath(resolvedTarget);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        throw new ManifestError(`symlink target is missing: ${path}`);
      }
      throw error;
    }
    if (!isInside(root, realTarget)) {
      throw new ManifestError(`symlink resolves outside source root: ${path}`);
    }
    const bytes = Buffer.from(target);
    return {
      path,
      type: "symlink",
      gitMode: "120000",
      byteSize: bytes.byteLength,
      sha256: sha256(bytes),
    };
  }
  if (!stat.isFile()) throw new ManifestError(`unsupported special file: ${path}`);
  const bytes = await readFile(absolute);
  return {
    path,
    type: "regular",
    gitMode: stat.mode & 0o111 ? "100755" : "100644",
    byteSize: bytes.byteLength,
    sha256: sha256(bytes),
  };
}

export async function createSourceManifest({ sourceRoot, baseHead }) {
  const root = await normalizeRoot(sourceRoot);
  const resolvedBase = await resolveBaseHead(root, baseHead);
  const baseEntries = parseTree(await runGit(root, ["ls-tree", "-rz", "-r", resolvedBase]));
  const untracked = parseNullList(
    await runGit(root, ["ls-files", "-o", "--exclude-standard", "-z"]),
  ).filter(validateDeliveryPath);
  const candidates = new Set([...baseEntries.map((entry) => entry.path), ...untracked]);
  const files = [];
  const missing = new Set();
  for (const path of [...candidates].sort()) {
    try {
      const record = await recordPath(root, path);
      if (record !== null) files.push(record);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") missing.add(path);
      else throw error;
    }
  }
  const deletions = baseEntries
    .filter((entry) => missing.has(entry.path) && validateDeliveryPath(entry.path))
    .map(({ path, gitMode, objectSha }) => ({ path, gitMode, objectSha }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const sortedFiles = files.sort((left, right) => left.path.localeCompare(right.path));
  const treeSha256 = sha256(canonical({ files: sortedFiles, deletions }));
  const unsigned = {
    version: 2,
    baseHead: resolvedBase,
    files: sortedFiles,
    deletions,
    treeSha256,
  };
  return { ...unsigned, manifestSha256: sha256(canonical(unsigned)) };
}

export function verifyManifestShape(manifest) {
  if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new ManifestError("manifest must be an object");
  }
  const { manifestSha256, ...unsigned } = manifest;
  if (manifest.version !== 2 || typeof manifestSha256 !== "string") {
    throw new ManifestError("unsupported source manifest");
  }
  if (sha256(canonical(unsigned)) !== manifestSha256) {
    throw new ManifestError("source manifest digest mismatch");
  }
  if (
    !Array.isArray(manifest.files) ||
    !Array.isArray(manifest.deletions) ||
    sha256(canonical({ files: manifest.files, deletions: manifest.deletions })) !== manifest.treeSha256
  ) {
    throw new ManifestError("source tree digest mismatch");
  }
  return manifest;
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === undefined || value === undefined || !key.startsWith("--")) {
      throw new ManifestError("arguments must be --name value pairs");
    }
    values.set(key, value);
  }
  const sourceRoot = values.get("--source-root");
  const baseHead = values.get("--base-head");
  const output = values.get("--output");
  if (sourceRoot === undefined || baseHead === undefined || output === undefined) {
    throw new ManifestError("--source-root, --base-head, and --output are required");
  }
  if (!isAbsolute(output)) throw new ManifestError("--output must be absolute");
  return { sourceRoot, baseHead, output: resolve(output) };
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const manifest = await createSourceManifest(args);
    await mkdir(dirname(args.output), { recursive: true });
    await writeFile(args.output, canonical(manifest), { flag: "wx" });
    console.log(JSON.stringify({
      status: "ok",
      files: manifest.files.length,
      deletions: manifest.deletions.length,
      treeSha256: manifest.treeSha256,
      manifestSha256: manifest.manifestSha256,
    }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "source manifest failed");
    process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
