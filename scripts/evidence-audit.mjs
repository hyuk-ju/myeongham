#!/usr/bin/env node

import process from "node:process";
import {
  EvidenceAuditError,
  auditLegacyRoot,
  auditMissingTaskFixture,
  auditSourceManifest,
  auditTaskManifest,
  createReceipt,
  writeReceipt,
} from "./evidence-audit-lib.mjs";

function parsePositiveArgs(argv) {
  if (argv.length !== 6) throw new EvidenceAuditError("invalid_arguments");
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (value === undefined || !["--manifest", "--source-manifest", "--output"].includes(key) || values.has(key)) {
      throw new EvidenceAuditError("invalid_arguments");
    }
    values.set(key, value);
  }
  const manifest = values.get("--manifest");
  const sourceManifest = values.get("--source-manifest");
  const output = values.get("--output");
  if (manifest === undefined || sourceManifest === undefined || output === undefined) {
    throw new EvidenceAuditError("invalid_arguments");
  }
  return { manifest, sourceManifest, output };
}

async function main() {
  try {
    const argv = process.argv.slice(2);
    if (argv.length === 2 && argv[0] === "--root") {
      const files = await auditLegacyRoot(argv[1]);
      console.log(JSON.stringify({ status: "ok", files }));
      return;
    }
    if (argv.length === 3 && argv[0] === "--fixture" && argv[2] === "--expect-failure") {
      await auditMissingTaskFixture(argv[1]);
      throw new EvidenceAuditError("expected_failure_missing");
    }
    const args = parsePositiveArgs(argv);
    const tasks = await auditTaskManifest(args.manifest);
    const source = await auditSourceManifest(args.sourceManifest);
    await writeReceipt(args.output, createReceipt(tasks, source));
    console.log(JSON.stringify({ status: "ok", taskEvidenceManifestSha256: tasks.manifestSha256, sourceManifestSha256: source.manifestSha256 }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "evidence_audit_failed");
    process.exitCode = 1;
  }
}

await main();
