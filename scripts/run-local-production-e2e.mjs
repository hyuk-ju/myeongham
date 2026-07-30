#!/usr/bin/env node

import {
  mkdtemp,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import process from "node:process";

const REQUIRED_IDENTITY = [
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "CLERK_TESTING_TOKEN",
  "CLERK_FAPI",
  "DEV_LOGIN_USER_ID",
  "ALLOWED_USER_IDS",
];

class E2EGateError extends Error {
  constructor(gate, message) {
    super(message);
    this.name = "E2EGateError";
    this.gate = gate;
  }
}

function credentialGate(environment) {
  const missing = REQUIRED_IDENTITY.filter((name) => !environment[name]?.trim());
  if (missing.length > 0) {
    throw new E2EGateError("credential_gate", `missing:${missing.join(",")}`);
  }
  const publishableKey = environment.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const secretKey = environment.CLERK_SECRET_KEY;
  const fapi = environment.CLERK_FAPI;
  const userId = environment.DEV_LOGIN_USER_ID;
  if (!publishableKey.startsWith("pk_test_") || !secretKey.startsWith("sk_test_")) {
    throw new E2EGateError("credential_gate", "development Clerk keys required");
  }
  if (fapi.includes("://") || !/^[a-z0-9.-]+$/i.test(fapi)) {
    throw new E2EGateError("credential_gate", "CLERK_FAPI must be protocol-less");
  }
  const encodedFapi = publishableKey.slice("pk_test_".length);
  const decodedFapi = Buffer.from(encodedFapi, "base64").toString("utf8").replace(/\$$/, "");
  if (decodedFapi !== fapi) {
    throw new E2EGateError("credential_gate", "publishable key and CLERK_FAPI do not match");
  }
  if (!environment.ALLOWED_USER_IDS.split(",").map((value) => value.trim()).includes(userId)) {
    throw new E2EGateError("credential_gate", "DEV_LOGIN_USER_ID must be exactly allowlisted");
  }
}

function parsePlaywrightArgs(argv) {
  const separator = argv.indexOf("--");
  if (separator < 0) throw new E2EGateError("lifecycle_gate", "missing -- before Playwright arguments");
  return argv.slice(separator + 1);
}

async function rejectRemoteConfiguration(root, environment) {
  const configured = [environment.NEXT_PUBLIC_SUPABASE_URL];
  try {
    const localEnv = await readFile(resolve(root, ".env.local"), "utf8");
    const match = /^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m.exec(localEnv);
    configured.push(match?.[1]?.trim());
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  if (configured.some((value) => value !== undefined && /\.supabase\.co(?:\/|$)/i.test(value))) {
    throw new E2EGateError("remote_target_gate", "configured remote Supabase project is forbidden");
  }
  if (await pathExists(resolve(root, "supabase", ".temp", "project-ref"))) {
    throw new E2EGateError("remote_target_gate", "linked Supabase project state is forbidden");
  }
}

async function pathExists(path) {
  try {
    await readFile(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function run(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  const stdout = [];
  const stderr = [];
  if (child.stdout !== null) child.stdout.on("data", (chunk) => stdout.push(chunk));
  if (child.stderr !== null) child.stderr.on("data", (chunk) => stderr.push(chunk));
  const code = await new Promise((settle, reject) => {
    child.once("error", reject);
    child.once("exit", (exitCode, signal) => {
      if (signal !== null) reject(new Error(`${command} terminated by ${signal}`));
      else settle(exitCode ?? 1);
    });
  });
  return {
    code,
    stdout: Buffer.concat(stdout).toString("utf8"),
    stderr: Buffer.concat(stderr).toString("utf8"),
  };
}

async function runSupabase(root, args, environment) {
  const result = await run(
    process.execPath,
    [resolve(root, "scripts", "run-local-supabase.mjs"), "--", "npx", "supabase", ...args],
    { cwd: root, env: environment, capture: true },
  );
  if (result.code !== 0) {
    const combined = `${result.stdout}\n${result.stderr}`;
    const gate = /docker|daemon|container/i.test(combined) ? "docker_gate" : "local_stack_gate";
    throw new E2EGateError(gate, "local Supabase lifecycle failed");
  }
  return result.stdout;
}

function parseLocalStatus(raw) {
  const values = new Map();
  for (const line of raw.split("\n")) {
    const match = /^([A-Z][A-Z0-9_]*)=(?:"([^"]*)"|(.*))$/.exec(line.trim());
    if (match !== null) values.set(match[1], match[2] ?? match[3] ?? "");
  }
  const url = values.get("API_URL") ?? values.get("SUPABASE_URL");
  const key = values.get("ANON_KEY") ?? values.get("PUBLISHABLE_KEY");
  if (url === undefined || key === undefined) {
    throw new E2EGateError("local_stack_gate", "local Supabase status omitted API URL or key");
  }
  const parsed = new URL(url);
  if (!["127.0.0.1", "localhost"].includes(parsed.hostname)) {
    throw new E2EGateError("remote_target_gate", "Supabase status returned a non-local host");
  }
  return { url, key };
}

async function allocatePort() {
  const server = createServer();
  await new Promise((settle, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", settle);
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("unable to allocate port");
  const port = address.port;
  await new Promise((settle, reject) => {
    server.close((error) => (error === undefined ? settle() : reject(error)));
  });
  return port;
}

async function filesUnder(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

async function verifyBuild(root, localUrl, publishableKey) {
  const nextRoot = resolve(root, ".next");
  let hasUrl = false;
  let hasPublishableKey = false;
  let hasDevAudit = false;
  for (const file of await filesUnder(nextRoot)) {
    const bytes = await readFile(file);
    hasUrl ||= bytes.includes(Buffer.from(localUrl));
    hasPublishableKey ||= bytes.includes(Buffer.from(publishableKey));
    hasDevAudit ||= ["react-grab", "react-scan", "react-doctor"].some((name) =>
      bytes.includes(Buffer.from(name)),
    );
    if (bytes.includes(Buffer.from(".supabase.co"))) {
      throw new E2EGateError("remote_target_gate", "production build contains a remote Supabase host");
    }
  }
  if (!hasUrl || !hasPublishableKey) {
    throw new E2EGateError("lifecycle_gate", "local public values were not embedded in the build");
  }
  if (hasDevAudit) throw new E2EGateError("lifecycle_gate", "dev-audit tooling leaked into production");
}

async function waitForServer(url, child) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new E2EGateError("lifecycle_gate", "Next server exited early");
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status > 0) return;
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
    }
    await new Promise((settle) => setTimeout(settle, 100));
  }
  throw new E2EGateError("lifecycle_gate", "Next server readiness timed out");
}

async function terminate(child) {
  if (child === null || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((settle) => {
    child.once("exit", settle);
    setTimeout(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
      settle();
    }, 5_000);
  });
}

async function main() {
  const root = process.cwd();
  const playwrightArgs = parsePlaywrightArgs(process.argv.slice(2));
  let runRoot = null;
  let server = null;
  let stackStarted = false;
  try {
    credentialGate(process.env);
    await rejectRemoteConfiguration(root, process.env);
    runRoot = await mkdtemp(resolve(tmpdir(), "myeongham-e2e-"));
    const port = process.env.E2E_PORT === undefined ? await allocatePort() : Number(process.env.E2E_PORT);
    await runSupabase(root, ["stop", "--no-backup"], process.env);
    await runSupabase(root, ["start"], process.env);
    stackStarted = true;
    const local = parseLocalStatus(await runSupabase(root, ["status", "-o", "env"], process.env));
    await rm(resolve(root, ".next"), { recursive: true, force: true });
    const environment = {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: local.url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: local.key,
      ALLOWED_USER_IDS: process.env.DEV_LOGIN_USER_ID,
      E2E_RUN_ROOT: runRoot,
      PLAYWRIGHT_BASE_URL: `http://127.0.0.1:${port}`,
    };
    const build = await run("npx", ["next", "build"], { cwd: root, env: environment });
    if (build.code !== 0) throw new E2EGateError("lifecycle_gate", "next build failed");
    await verifyBuild(root, local.url, process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
    server = spawn("npx", ["next", "start", "-H", "127.0.0.1", "-p", String(port)], {
      cwd: root,
      env: environment,
      stdio: "inherit",
    });
    await waitForServer(environment.PLAYWRIGHT_BASE_URL, server);
    const result = await run("npx", ["playwright", "test", ...playwrightArgs], {
      cwd: root,
      env: environment,
    });
    if (result.code !== 0) throw new E2EGateError("credential_gate", "authenticated browser proof failed");
    console.log(JSON.stringify({ status: "ok", gate: "authenticated_local_e2e" }));
  } catch (error) {
    const gate = error instanceof E2EGateError ? error.gate : "lifecycle_gate";
    const detail = error instanceof Error ? error.message : "unknown failure";
    console.error(JSON.stringify({ status: "blocked", gate, detail }));
    process.exitCode = 1;
  } finally {
    await terminate(server);
    if (stackStarted) {
      try {
        await runSupabase(root, ["stop", "--no-backup"], process.env);
      } catch {
        process.exitCode = 1;
      }
    }
    if (runRoot !== null) await rm(runRoot, { recursive: true, force: true });
  }
}

await main();
