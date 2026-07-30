#!/usr/bin/env node

import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const RULES = [
  { id: "private_key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { id: "bearer_token", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/i },
  { id: "clerk_secret", pattern: /\bsk_(?:test|live)_[A-Za-z0-9_-]{10,}/ },
  { id: "clerk_publishable_value", pattern: /\bpk_(?:test|live)_[A-Za-z0-9_-]{10,}/ },
  { id: "openai_secret", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}/ },
  { id: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/ },
  { id: "remote_supabase_url", pattern: /https:\/\/[a-z0-9]{8,}\.supabase\.co\b/i },
  { id: "email", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
  { id: "clerk_user_id", pattern: /\buser_[A-Za-z0-9]{8,}\b/ },
  { id: "ticket_query", pattern: /__clerk_ticket=[^&\s"']+/ },
];

class EvidenceScanError extends Error {
  constructor(message) {
    super(message);
    this.name = "EvidenceScanError";
  }
}

function inside(root, candidate) {
  const path = relative(root, candidate);
  return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

async function collect(path) {
  const stat = await lstat(path);
  if (stat.isSymbolicLink()) throw new EvidenceScanError(`symlink evidence is forbidden: ${path}`);
  if (stat.isFile()) return [path];
  if (!stat.isDirectory()) throw new EvidenceScanError(`unsupported evidence type: ${path}`);
  const entries = await readdir(path, { withFileTypes: true });
  const nested = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    nested.push(...(await collect(resolve(path, entry.name))));
  }
  return nested;
}

export async function scanEvidencePaths(paths) {
  if (paths.length === 0) throw new EvidenceScanError("at least one --include path is required");
  const root = await realpath(process.cwd());
  const files = [];
  for (const requested of paths) {
    const absolute = resolve(requested);
    files.push(...(await collect(absolute)));
  }
  const findings = [];
  for (const file of [...new Set(files)].sort()) {
    const bytes = await readFile(file);
    if (bytes.includes(0)) continue;
    const text = bytes.toString("utf8");
    for (const rule of RULES) {
      if (rule.pattern.test(text)) {
        findings.push({
          path: inside(root, file) ? relative(root, file) : basename(file),
          rule: rule.id,
        });
      }
    }
  }
  if (findings.length > 0) {
    throw new EvidenceScanError(
      `evidence_scan_failed ${JSON.stringify(findings)}`,
    );
  }
  return files.sort();
}

function parseIncludes(argv) {
  const includes = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--include" || argv[index + 1] === undefined) {
      throw new EvidenceScanError("usage: evidence-scan.mjs --include <path> [--include <path>]");
    }
    includes.push(argv[index + 1]);
    index += 1;
  }
  return includes;
}

async function main() {
  try {
    const argv = process.argv.slice(2);
    if (argv.length === 3 && argv[0] === "--fixture" && argv[2] === "--expect-failure") {
      try {
        await scanEvidencePaths([argv[1]]);
      } catch (error) {
        if (error instanceof EvidenceScanError && error.message.startsWith("evidence_scan_failed")) {
          throw new EvidenceScanError("secret_or_pii_detected");
        }
        throw error;
      }
      throw new EvidenceScanError("expected_failure_missing");
    }
    const files = await scanEvidencePaths(parseIncludes(argv));
    console.log(JSON.stringify({ status: "ok", files: files.length }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "evidence scan failed");
    process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
