#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const WRAPPER = resolve(ROOT, "scripts", "run-local-supabase.mjs");
const EVIDENCE = resolve(ROOT, ".omo", "evidence", "business-card-priority-fixes", "task-2-concurrency.txt");
const BARRIER = 9123456789n;
const OWNER = "task2_owner";
const CLAIM_A = "2a000000-0000-0000-0000-000000000001";
const CLAIM_B = "2a000000-0000-0000-0000-000000000002";
const FINALIZE_ID = "2a000000-0000-0000-0000-000000000003";

class GateError extends Error {
  constructor(gate, message) {
    super(message);
    this.name = "GateError";
    this.gate = gate;
  }
}

function parseScenario(argv) {
  const index = argv.indexOf("--scenario");
  const scenario = index < 0 ? "full" : argv[index + 1];
  if (scenario !== "full" && scenario !== "same-owner-stale-and-finalize") {
    throw new GateError("usage_gate", "scenario must be full or same-owner-stale-and-finalize");
  }
  return scenario;
}

function run(command, args, options = {}) {
  return new Promise((settle, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env: process.env,
      stdio: options.capture === false ? "inherit" : ["pipe", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    if (child.stdout !== null) child.stdout.on("data", (chunk) => stdout.push(chunk));
    if (child.stderr !== null) child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", reject);
    child.once("exit", (code, signal) => settle({
      code: code ?? 1,
      signal,
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8"),
    }));
  });
}

async function dockerAvailable() {
  try {
    const result = await run("docker", ["info"]);
    return result.code === 0;
  } catch {
    return false;
  }
}

async function localStatus() {
  const result = await run(process.execPath, [WRAPPER, "--", "npx", "supabase", "status", "-o", "env"]);
  if (result.code !== 0) {
    const details = `${result.stdout}\n${result.stderr}`;
    throw new GateError(/docker|daemon|container/i.test(details) ? "docker_gate" : "local_stack_gate", "local Supabase status failed");
  }
  const values = new Map();
  for (const line of result.stdout.split("\n")) {
    const match = /^([A-Z][A-Z0-9_]*)=(?:"([^"]*)"|(.*))$/.exec(line.trim());
    if (match !== null) values.set(match[1], match[2] ?? match[3] ?? "");
  }
  const databaseUrl = values.get("DB_URL") ?? values.get("DATABASE_URL") ?? values.get("POSTGRES_URL");
  if (databaseUrl === undefined || !/^postgres(?:ql)?:\/\/(?:[^@]+@)?(?:127\.0\.0\.1|localhost)(?::\d+)?\//i.test(databaseUrl)) {
    throw new GateError("local_stack_gate", "local Supabase status did not provide a local database URL");
  }
  return databaseUrl;
}

async function psql(databaseUrl, sql) {
  const child = spawn("psql", [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "-qAt"], {
    cwd: ROOT,
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  child.stdin.end(sql);
  const result = await new Promise((settle, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => settle({ code: code ?? 1, signal }));
  });
  return { ...result, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") };
}

async function prepare(databaseUrl) {
  const sql = `
delete from public.cards where source_draft_id in ('${CLAIM_A}', '${CLAIM_B}', '${FINALIZE_ID}');
delete from public.card_drafts where id in ('${CLAIM_A}', '${CLAIM_B}', '${FINALIZE_ID}');
insert into public.card_drafts (id, owner_id, image_path) values
  ('${CLAIM_A}', '${OWNER}', '${OWNER}/a.jpg'),
  ('${CLAIM_B}', '${OWNER}', '${OWNER}/b.jpg'),
  ('${FINALIZE_ID}', '${OWNER}', '${OWNER}/finalize.jpg');
update public.card_drafts set status = 'extracted', extracted = '{"company":"Concurrency Co"}' where id = '${FINALIZE_ID}';
`;
  const result = await psql(databaseUrl, sql);
  if (result.code !== 0) throw new GateError("local_stack_gate", "concurrency fixtures could not be prepared");
}

async function markStale(databaseUrl) {
  const result = await psql(databaseUrl, `
update public.card_drafts
set processing_started_at = clock_timestamp() - interval '181 seconds'
where id = '${CLAIM_A}';
update public.card_drafts
set status = 'pending', processing_started_at = null, processing_token = null
where id = '${CLAIM_B}';
`);
  if (result.code !== 0) throw new GateError("local_stack_gate", "stale claim fixture could not be prepared");
}

function workerSql(action) {
  return `
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"${OWNER}","role":"authenticated"}';
select 'READY';
select pg_advisory_lock(${BARRIER});
${action}
commit;
select pg_advisory_unlock(${BARRIER});
`;
}

async function concurrent(databaseUrl, action) {
  const coordinator = spawn("psql", [databaseUrl, "-X", "-qAt"], {
    cwd: ROOT,
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const coordinatorOutput = [];
  coordinator.stdout.on("data", (chunk) => coordinatorOutput.push(chunk));
  coordinator.stderr.resume();
  coordinator.stdin.write(`select pg_advisory_lock(${BARRIER}), 'COORDINATOR_READY';\n`);

  const workers = [action[0], action[1]].map(() => spawn("psql", [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "-qAt"], {
    cwd: ROOT,
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
  }));
  const outputs = workers.map(() => []);
  const errors = workers.map(() => []);
  workers.forEach((worker, index) => {
    worker.stdout.on("data", (chunk) => outputs[index].push(chunk));
    worker.stderr.on("data", (chunk) => errors[index].push(chunk));
    worker.stdin.end(workerSql(action[index]));
  });

  const started = Date.now();
  while (Date.now() - started < 10_000) {
    const ready = outputs.every((chunks) => Buffer.concat(chunks).toString("utf8").includes("READY"));
    if (ready && Buffer.concat(coordinatorOutput).toString("utf8").includes("COORDINATOR_READY")) break;
    await new Promise((settle) => setTimeout(settle, 25));
  }
  const ready = outputs.every((chunks) => Buffer.concat(chunks).toString("utf8").includes("READY"));
  if (!ready) {
    workers.forEach((worker) => worker.kill("SIGTERM"));
    coordinator.kill("SIGTERM");
    throw new GateError("local_stack_gate", "concurrency barrier did not observe both sessions");
  }
  coordinator.stdin.write(`select pg_advisory_unlock(${BARRIER});\n`);
  coordinator.stdin.end();
  const results = await Promise.all(workers.map((worker) => new Promise((settle, reject) => {
    worker.once("error", reject);
    worker.once("exit", (code, signal) => settle({ code: code ?? 1, signal }));
  })));
  await new Promise((settle) => coordinator.once("exit", settle));
  return results.map((result, index) => ({
    ...result,
    stdout: Buffer.concat(outputs[index]).toString("utf8"),
    stderr: Buffer.concat(errors[index]).toString("utf8"),
  }));
}

function firstCodes(results) {
  return results.map((result) => result.stdout.split("\n").map((line) => line.split("|")[0]).filter((line) => line !== "" && line !== "READY")[0] ?? "");
}

async function main() {
  const scenario = parseScenario(process.argv.slice(2));
  let receipt;
  try {
    if (!(await dockerAvailable())) throw new GateError("docker_gate", "Docker executable or daemon is unavailable");
    const databaseUrl = await localStatus();
    await prepare(databaseUrl);
    const claimResults = await concurrent(databaseUrl, [
      `select code, status from public.claim_card_draft('${CLAIM_A}');`,
      `select code, status from public.claim_card_draft('${CLAIM_B}');`,
    ]);
    const claimCodes = firstCodes(claimResults);
    if (claimResults.some((result) => result.code !== 0) || claimCodes.filter((code) => code === "claimed").length !== 1 || claimCodes.filter((code) => code === "busy").length !== 1) {
      throw new GateError("local_stack_gate", "same-owner claim serialization assertion failed");
    }
    if (scenario === "same-owner-stale-and-finalize") {
      await markStale(databaseUrl);
      const stale = await psql(databaseUrl, `
set role authenticated;
set request.jwt.claims = '{"sub":"${OWNER}","role":"authenticated"}';
select code from public.claim_card_draft('${CLAIM_B}');
`);
      if (stale.code !== 0 || !stale.stdout.split("\n").some((line) => line.trim() === "claimed")) {
        throw new GateError("local_stack_gate", "stale claim recovery assertion failed");
      }
    }
    const finalizeResults = await concurrent(databaseUrl, [
      `select code, created from public.finalize_card_draft('${FINALIZE_ID}', '{"name":"Concurrent"}'::jsonb, null);`,
      `select code, created from public.finalize_card_draft('${FINALIZE_ID}', '{"name":"Concurrent"}'::jsonb, null);`,
    ]);
    const finalizeCodes = firstCodes(finalizeResults);
    if (finalizeResults.some((result) => result.code !== 0) || finalizeCodes.filter((code) => code === "finalized").length !== 2) {
      throw new GateError("local_stack_gate", "idempotent finalization assertion failed");
    }
    receipt = { status: "ok", gate: "local_db_concurrency", scenario, claimCodes, finalizeCodes };
  } catch (error) {
    const gate = error instanceof GateError ? error.gate : "local_stack_gate";
    receipt = { status: "blocked", gate, scenario, reason: error instanceof Error ? error.message : "unknown failure" };
    process.exitCode = gate === "docker_gate" ? 0 : 1;
  }
  await mkdir(resolve(EVIDENCE, ".."), { recursive: true });
  await writeFile(EVIDENCE, `${JSON.stringify(receipt)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

await main();
