#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, readFile, readlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import process from "node:process";

const INPUTS = [
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
];

class FinalSealError extends Error {
  constructor(message) {
    super(message);
    this.name = "FinalSealError";
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonical(value) {
  return `${JSON.stringify(value)}\n`;
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === undefined || value === undefined || !key.startsWith("--")) {
      throw new FinalSealError("arguments must be --name value pairs");
    }
    if (values.has(key)) throw new FinalSealError(`duplicate argument: ${key}`);
    values.set(key, value);
  }
  for (const input of INPUTS) {
    if (!values.has(`--${input}`)) throw new FinalSealError(`missing --${input}`);
  }
  const output = values.get("--output");
  const verify = values.get("--verify");
  if ((output === undefined) === (verify === undefined)) {
    throw new FinalSealError("provide exactly one of --output or --verify");
  }
  const paths = Object.fromEntries(
    INPUTS.map((input) => [input, resolve(values.get(`--${input}`))]),
  );
  return { paths, output, verify };
}

async function fileRecord(role, path) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new FinalSealError(`${role} must be a regular file`);
  }
  const bytes = await readFile(path);
  if (bytes.byteLength === 0) throw new FinalSealError(`${role} is empty`);
  return { role, byteSize: bytes.byteLength, sha256: sha256(bytes) };
}

async function includedBaselineRecords(path) {
  const manifest = JSON.parse(await readFile(path, "utf8"));
  if (!Array.isArray(manifest.included)) {
    throw new FinalSealError("safe baseline manifest has no included array");
  }
  const records = [];
  for (const item of manifest.included) {
    if (
      item === null ||
      typeof item !== "object" ||
      typeof item.path !== "string" ||
      item.path.includes("..")
    ) {
      throw new FinalSealError("invalid safe baseline reference");
    }
    const reference = resolve(dirname(path), item.path);
    const stat = await lstat(reference);
    if (stat.isSymbolicLink()) {
      await readlink(reference);
      throw new FinalSealError("safe baseline references may not be symlinks");
    }
    records.push(await fileRecord(`safe-reference:${item.path}`, reference));
  }
  return records.sort((left, right) => left.role.localeCompare(right.role));
}

async function buildSeal(paths) {
  const records = [];
  for (const role of INPUTS) {
    records.push(await fileRecord(role, paths[role]));
  }
  records.push(...(await includedBaselineRecords(paths["safe-baseline"])));
  records.sort((left, right) => left.role.localeCompare(right.role));
  const unsigned = { version: 1, records };
  return { ...unsigned, sealSha256: sha256(canonical(unsigned)) };
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const current = await buildSeal(args.paths);
    if (args.verify !== undefined) {
      const frozen = JSON.parse(await readFile(resolve(args.verify), "utf8"));
      if (canonical(frozen) !== canonical(current)) {
        throw new FinalSealError("final seal verification failed: an input changed");
      }
      console.log(JSON.stringify({ status: "ok", sealSha256: current.sealSha256 }));
      return;
    }
    if (args.output === undefined || !isAbsolute(args.output)) {
      throw new FinalSealError("--output must be absolute");
    }
    await writeFile(args.output, canonical(current), { flag: "wx" });
    console.log(JSON.stringify({ status: "ok", sealSha256: current.sealSha256 }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "final seal failed");
    process.exitCode = 1;
  }
}

await main();
