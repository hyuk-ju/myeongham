#!/usr/bin/env node

import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readlink,
  realpath,
  rm,
  symlink,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import process from "node:process";
import { createSourceManifest, verifyManifestShape } from "./delivery-snapshot.mjs";

class MaterializeError extends Error {
  constructor(message) {
    super(message);
    this.name = "MaterializeError";
  }
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === undefined || value === undefined || !key.startsWith("--")) {
      throw new MaterializeError("arguments must be --name value pairs");
    }
    values.set(key, value);
  }
  const sourceRoot = values.get("--source-root");
  const baseHead = values.get("--base-head");
  const manifest = values.get("--manifest");
  const destination = values.get("--destination");
  if ([sourceRoot, baseHead, manifest, destination].some((value) => value === undefined)) {
    throw new MaterializeError("--source-root, --base-head, --manifest, and --destination are required");
  }
  if (![sourceRoot, manifest, destination].every((value) => isAbsolute(value))) {
    throw new MaterializeError("all path arguments must be absolute");
  }
  return { sourceRoot, baseHead, manifest, destination };
}

async function runGit(root, args) {
  const child = spawn("git", ["-C", root, ...args], { stdio: ["ignore", "pipe", "pipe"] });
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  const code = await new Promise((settle, reject) => {
    child.once("error", reject);
    child.once("exit", (exitCode) => settle(exitCode ?? 1));
  });
  if (code !== 0) throw new MaterializeError(Buffer.concat(stderr).toString("utf8").trim());
  return Buffer.concat(stdout).toString("utf8").trim();
}

function destinationPath(root, path) {
  const candidate = resolve(root, path);
  const rel = relative(root, candidate);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new MaterializeError(`manifest path escapes destination: ${path}`);
  }
  return candidate;
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const sourceRoot = await realpath(args.sourceRoot);
    const destination = await realpath(args.destination);
    const manifest = verifyManifestShape(JSON.parse(await readFile(args.manifest, "utf8")));
    const captured = await createSourceManifest({ sourceRoot, baseHead: args.baseHead });
    if (
      captured.manifestSha256 !== manifest.manifestSha256 ||
      captured.treeSha256 !== manifest.treeSha256
    ) {
      throw new MaterializeError("source tree no longer matches the frozen manifest");
    }
    const destinationHead = await runGit(destination, ["rev-parse", "HEAD"]);
    if (destinationHead !== manifest.baseHead || destinationHead !== args.baseHead) {
      throw new MaterializeError("destination HEAD does not match baseHead");
    }
    if ((await runGit(destination, ["status", "--porcelain=v1"])) !== "") {
      throw new MaterializeError("destination must be a clean clone");
    }
    for (const deletion of manifest.deletions) {
      await rm(destinationPath(destination, deletion.path), { force: true, recursive: true });
    }
    for (const file of manifest.files) {
      const source = destinationPath(sourceRoot, file.path);
      const target = destinationPath(destination, file.path);
      await mkdir(dirname(target), { recursive: true });
      await rm(target, { force: true, recursive: true });
      if (file.type === "symlink") {
        const linkTarget = await readlink(source);
        await symlink(linkTarget, target);
      } else if (file.type === "regular") {
        await copyFile(source, target);
        await chmod(target, file.gitMode === "100755" ? 0o755 : 0o644);
      } else {
        throw new MaterializeError(`unsupported manifest file type: ${file.type}`);
      }
    }
    const projected = await createSourceManifest({ sourceRoot: destination, baseHead: args.baseHead });
    if (projected.treeSha256 !== manifest.treeSha256) {
      throw new MaterializeError("materialized tree digest mismatch");
    }
    for (const file of manifest.files) {
      const stat = await lstat(destinationPath(destination, file.path));
      if ((file.type === "symlink") !== stat.isSymbolicLink()) {
        throw new MaterializeError(`materialized type mismatch: ${file.path}`);
      }
    }
    console.log(JSON.stringify({ status: "ok", treeSha256: manifest.treeSha256 }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "materialization failed");
    process.exitCode = 1;
  }
}

await main();
