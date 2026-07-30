#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import process from "node:process";
import { scanEvidencePaths } from "./evidence-scan.mjs";

class EvidenceFreezeError extends Error {
  constructor(message) {
    super(message);
    this.name = "EvidenceFreezeError";
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonical(value) {
  return `${JSON.stringify(value)}\n`;
}

function parseArgs(argv) {
  const taskPaths = new Map(Array.from({ length: 11 }, (_, index) => [index + 1, []]));
  let output;
  let verify;
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === undefined || value === undefined) throw new EvidenceFreezeError("invalid arguments");
    if (key === "--output") output = value;
    else if (key === "--verify") verify = value;
    else {
      const match = /^--task-(\d+)$/.exec(key);
      const task = match === null ? Number.NaN : Number(match[1]);
      if (!Number.isInteger(task) || task < 1 || task > 11) {
        throw new EvidenceFreezeError(`unknown argument: ${key}`);
      }
      taskPaths.get(task)?.push(value);
    }
  }
  if ((output === undefined) === (verify === undefined)) {
    throw new EvidenceFreezeError("provide exactly one of --output or --verify");
  }
  for (const [task, paths] of taskPaths) {
    if (paths.length === 0) throw new EvidenceFreezeError(`missing explicit --task-${task} input`);
  }
  return { taskPaths, output, verify };
}

async function buildManifest(taskPaths) {
  const root = resolve(process.cwd());
  const tasks = [];
  for (const [task, paths] of taskPaths) {
    const files = await scanEvidencePaths(paths);
    const records = [];
    for (const file of files) {
      const stat = await lstat(file);
      if (stat.size === 0) throw new EvidenceFreezeError(`empty evidence input: ${file}`);
      const bytes = await readFile(file);
      records.push({
        path: relative(root, file),
        byteSize: bytes.byteLength,
        sha256: sha256(bytes),
      });
    }
    tasks.push({ task, files: records.sort((left, right) => left.path.localeCompare(right.path)) });
  }
  const unsigned = { version: 1, tasks };
  return { ...unsigned, manifestSha256: sha256(canonical(unsigned)) };
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const current = await buildManifest(args.taskPaths);
    if (args.verify !== undefined) {
      const frozen = JSON.parse(await readFile(resolve(args.verify), "utf8"));
      if (canonical(frozen) !== canonical(current)) {
        throw new EvidenceFreezeError("task evidence changed after freeze");
      }
      console.log(JSON.stringify({ status: "ok", manifestSha256: current.manifestSha256 }));
      return;
    }
    if (args.output === undefined || !isAbsolute(args.output)) {
      throw new EvidenceFreezeError("--output must be absolute");
    }
    await mkdir(dirname(args.output), { recursive: true });
    await writeFile(args.output, canonical(current), { flag: "wx" });
    console.log(JSON.stringify({ status: "ok", manifestSha256: current.manifestSha256 }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "evidence freeze failed");
    process.exitCode = 1;
  }
}

await main();
