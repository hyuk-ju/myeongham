import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import process from "node:process";
import { createSourceManifest, verifyManifestShape } from "./delivery-snapshot.mjs";
import { scanEvidencePaths } from "./evidence-scan.mjs";

const REQUIRED_TASK_EVIDENCE = new Map([
  [1, [/task-1-tests\./]],
  [2, [/task-2-pgtap\./, /task-2-concurrency\./]],
  [3, [/task-3-valid-upload\./, /task-3-invalid-boundaries\./]],
  [4, [/task-4-openai-contract\./, /task-4-openai-failures\./]],
  [5, [/task-5-contract\./, /task-5-stale-worker\./, /task-5-multiclient\./, /task-5-storage-revalidation\./]],
  [6, [/task-6-manual-finalize-summary\./, /task-6-rollback\./, /task-6-trace-deletion-receipt\./]],
  [7, [/task-7-tests\./, /task-7-visual-qa\./]],
  [8, [/task-8-core-flow-report\./, /task-8-visual-pass-a-final\./, /task-8-visual-pass-b-final\./, /task-8-e2e-credential-gate\./]],
  [9, [/task-9-capture-review-report\./]],
  [10, [/task-10-enrich-settings-report\./]],
  [11, [/task-11-integration-report\./, /task-11-cleanup-receipt\./, /task-11-gate-unit\./, /task-11-gate-typecheck\./, /task-11-gate-lint\./, /task-11-gate-build\./, /task-11-gate-ct\./]],
]);
const REQUIRED_SOURCE_PATHS = [
  "DESIGN.md",
  "README.md",
  "SETUP.md",
  "lib/ai/openai-company-search.ts",
  "scripts/evidence-audit-lib.mjs",
  "scripts/evidence-audit.mjs",
  "supabase/migrations/20260729121035_draft_claim_and_finalization.sql",
  "tests/ct/adversarial-core-states.spec.tsx",
  "tests/ct/core-routes.spec.tsx",
  "tests/unit/foundation/evidence-audit.test.ts",
];
const SECRET_PATHS = [
  /(^|\/)\.env(?:\.|$)(?!example$)/,
  /(^|\/)\.clerk(?:\/|$)/,
  /(^|\/)\.vercel(?:\/|$)/,
  /(^|\/)(?:credentials?|secrets?)(?:\.|\/|$)/i,
  /\.(?:pem|key|p12|pfx)$/i,
];
const SELF_REPORTED = /(?:report|review|handoff|manifest|summary)(?:\.|-|$)/i;

export class EvidenceAuditError extends Error {
  constructor(code, detail) {
    super(detail === undefined ? code : `${code}:${detail}`);
    this.name = "EvidenceAuditError";
    this.code = code;
  }
}

function fail(code, detail) {
  throw new EvidenceAuditError(code, detail);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonical(value) {
  return `${JSON.stringify(value)}\n`;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validatePath(path, allowEvidence) {
  if (
    typeof path !== "string" ||
    path === "" ||
    path.includes("\0") ||
    path.includes("\\") ||
    isAbsolute(path) ||
    path.split("/").some((part) => part === "" || part === "." || part === "..")
  ) fail("path_escape", String(path));
  if (SECRET_PATHS.some((pattern) => pattern.test(path)) && path !== ".env.example") {
    fail("secret_or_ignored_path", path);
  }
  if (!allowEvidence && (path === ".omo" || path.startsWith(".omo/"))) {
    fail("ignored_source_path", path);
  }
}

async function readCanonicalJson(path, label) {
  const absolute = resolve(path);
  const stat = await lstat(absolute).catch(() => fail(`${label}_missing`));
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label}_not_regular`);
  const bytes = await readFile(absolute);
  let parsed;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail(`${label}_invalid_json`);
  }
  if (canonical(parsed) !== bytes.toString("utf8")) fail(`${label}_not_canonical`);
  return parsed;
}

function validateManifestDigest(manifest, version, label) {
  if (!isObject(manifest) || manifest.version !== version || typeof manifest.manifestSha256 !== "string") {
    fail(`${label}_invalid_shape`);
  }
  const { manifestSha256, ...unsigned } = manifest;
  if (!/^[0-9a-f]{64}$/.test(manifestSha256) || sha256(canonical(unsigned)) !== manifestSha256) {
    fail(`${label}_digest_mismatch`);
  }
}

function validateEvidenceRecord(record, task, previousPath, seen) {
  if (!isObject(record)) fail("evidence_record_invalid", `task-${task}`);
  const { path, byteSize, sha256: digest } = record;
  validatePath(path, true);
  if (!path.startsWith(`.omo/evidence/business-card-priority-fixes/task-${task}-`)) {
    fail("evidence_task_path_mismatch", `task-${task}`);
  }
  if (path.localeCompare(previousPath) <= 0 || seen.has(path)) fail("evidence_paths_not_canonical", `task-${task}`);
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0 || !/^[0-9a-f]{64}$/.test(digest)) {
    fail("evidence_record_invalid", path);
  }
  seen.add(path);
  return path;
}

async function validateEvidenceBytes(root, tasks) {
  const paths = [];
  for (const task of tasks) {
    const required = REQUIRED_TASK_EVIDENCE.get(task.task) ?? [];
    if (task.files.every((record) => SELF_REPORTED.test(basename(record.path)))) {
      fail("self_reported_only", `task-${task.task}`);
    }
    for (const pattern of required) {
      if (!task.files.some((record) => pattern.test(basename(record.path)))) {
        fail("required_evidence_missing", `task-${task.task}`);
      }
    }
    for (const record of task.files) {
      const absolute = resolve(root, record.path);
      const escaped = relative(root, absolute);
      if (escaped === ".." || escaped.startsWith(`..${sep}`) || isAbsolute(escaped)) fail("path_escape", record.path);
      const stat = await lstat(absolute).catch(() => fail("evidence_missing_bytes", record.path));
      if (!stat.isFile() || stat.isSymbolicLink()) fail("evidence_not_regular", record.path);
      if (stat.size !== record.byteSize) fail("evidence_size_mismatch", record.path);
      const bytes = await readFile(absolute);
      if (sha256(bytes) !== record.sha256) fail("evidence_hash_mismatch", record.path);
      paths.push(absolute);
    }
  }
  try {
    await scanEvidencePaths(paths);
  } catch {
    fail("evidence_sanitization_failed");
  }
}

export async function auditTaskManifest(path) {
  const manifest = await readCanonicalJson(path, "task_manifest");
  validateManifestDigest(manifest, 1, "task_manifest");
  if (!Array.isArray(manifest.tasks)) fail("task_manifest_invalid_shape");
  const seen = new Set();
  for (let taskNumber = 1; taskNumber <= 11; taskNumber += 1) {
    const task = manifest.tasks[taskNumber - 1];
    if (!isObject(task) || task.task !== taskNumber || !Array.isArray(task.files) || task.files.length === 0) {
      fail("missing_evidence", `task-${taskNumber}`);
    }
    let previousPath = "";
    for (const record of task.files) previousPath = validateEvidenceRecord(record, taskNumber, previousPath, seen);
  }
  if (manifest.tasks.length !== 11) fail("task_manifest_invalid_shape");
  await validateEvidenceBytes(resolve(process.cwd()), manifest.tasks);
  return {
    manifestSha256: manifest.manifestSha256,
    tasks: manifest.tasks.map((task) => ({ task: task.task, files: task.files.length, bytes: task.files.reduce((sum, file) => sum + file.byteSize, 0) })),
  };
}

function compareSourceRecords(expected, current, label) {
  if (expected.length !== current.length) fail(`${label}_count_mismatch`);
  for (let index = 0; index < expected.length; index += 1) {
    const left = expected[index];
    const right = current[index];
    if (!isObject(left) || !isObject(right) || left.path !== right.path) fail(`${label}_path_mismatch`);
    for (const field of ["type", "gitMode", "byteSize", "sha256", "objectSha"]) {
      if (field in left && left[field] !== right[field]) {
        const code = field === "gitMode" ? "source_mode_mismatch" : field === "sha256" ? "source_hash_mismatch" : `${label}_${field}_mismatch`;
        fail(code, left.path);
      }
    }
  }
}

export async function auditSourceManifest(path) {
  const manifest = await readCanonicalJson(path, "source_manifest");
  validateManifestDigest(manifest, 2, "source_manifest");
  try {
    verifyManifestShape(manifest);
  } catch {
    fail("source_tree_digest_mismatch");
  }
  if (!Array.isArray(manifest.files) || !Array.isArray(manifest.deletions)) fail("source_manifest_invalid_shape");
  let previousPath = "";
  const sourcePaths = new Set();
  for (const record of manifest.files) {
    if (!isObject(record)) fail("source_record_invalid");
    validatePath(record.path, false);
    if (record.path.localeCompare(previousPath) <= 0 || sourcePaths.has(record.path)) fail("source_paths_not_canonical");
    sourcePaths.add(record.path);
    previousPath = record.path;
  }
  for (const required of REQUIRED_SOURCE_PATHS) if (!sourcePaths.has(required)) fail("required_source_missing", required);
  const current = await createSourceManifest({ sourceRoot: resolve(process.cwd()), baseHead: manifest.baseHead });
  compareSourceRecords(manifest.files, current.files, "source_file");
  compareSourceRecords(manifest.deletions, current.deletions, "source_deletion");
  if (manifest.treeSha256 !== current.treeSha256) fail("source_tree_digest_mismatch");
  return {
    baseHead: manifest.baseHead,
    treeSha256: manifest.treeSha256,
    manifestSha256: manifest.manifestSha256,
    files: manifest.files.length,
    deletions: manifest.deletions.length,
  };
}

export function createReceipt(tasks, source) {
  const rows = tasks.tasks.map((task) => `| ${task.task} | PASS | ${task.files} | ${task.bytes} |`).join("\n");
  return `# F1 Evidence Audit\n\nVerdict: PASS\n\n- Tasks: 11/11\n- Task evidence manifest SHA-256: \`${tasks.manifestSha256}\`\n- Source manifest SHA-256: \`${source.manifestSha256}\`\n- Source tree SHA-256: \`${source.treeSha256}\`\n- Frozen HEAD: \`${source.baseHead}\`\n- Source files: ${source.files}; deletions: ${source.deletions}\n- Checks: canonical digests, sorted paths, modes, bytes, deletions, sanitization, required evidence, non-self-reported proof\n\n| Task | Verdict | Files | Bytes |\n| ---: | :---: | ---: | ---: |\n${rows}\n`;
}

export async function writeReceipt(path, body) {
  if (!isAbsolute(path)) fail("output_must_be_absolute");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body, { flag: "wx" });
}

export async function auditLegacyRoot(path) {
  const root = resolve(path);
  const stat = await lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail("evidence_root_invalid");
  const entries = await readdir(root);
  for (const entry of entries) {
    const match = /^task-(\d+)-/.exec(entry);
    if (match !== null && (Number(match[1]) < 1 || Number(match[1]) > 11)) fail("invalid_task_prefix", entry);
  }
  const files = await scanEvidencePaths([root]);
  for (const file of files) if ((await lstat(file)).size === 0) fail("empty_evidence", basename(file));
  return files.length;
}

export async function auditMissingTaskFixture(path) {
  const fixture = resolve(path);
  const stat = await lstat(fixture);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail("fixture_invalid");
  await scanEvidencePaths([fixture]);
  const match = /^evidence-missing-task-(\d+)$/.exec(basename(fixture));
  if (match === null || Number(match[1]) < 1 || Number(match[1]) > 11) fail("fixture_invalid");
  fail("missing_evidence", `task-${match[1]}`);
}
