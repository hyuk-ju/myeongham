#!/usr/bin/env node

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";

const FIXTURE_FAPI = "todo1-fixture.clerk.accounts.dev";
const HOSTNAME = /^(?=.{1,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const LOCAL_COMMANDS = new Set(["init", "start", "stop", "status", "test"]);
const LOCAL_DB_COMMANDS = new Set(["reset", "test", "lint", "diff"]);
const LOCAL_MIGRATION_COMMANDS = new Set(["new", "list", "repair", "squash", "up"]);

class LocalSupabaseError extends Error {
  constructor(message, code = "local_supabase_guard") {
    super(message);
    this.name = "LocalSupabaseError";
    this.code = code;
  }
}

function parseInvocation(argv) {
  const separator = argv.indexOf("--");
  if (separator < 0 || separator === argv.length - 1) {
    throw new LocalSupabaseError("usage: run-local-supabase.mjs -- npx supabase <local command>");
  }
  const command = argv.slice(separator + 1);
  if (command[0] !== "npx" || command[1] !== "supabase") {
    throw new LocalSupabaseError("only the pinned `npx supabase` binary is permitted");
  }
  const cli = command.slice(2);
  if (cli.length === 0) throw new LocalSupabaseError("a Supabase CLI command is required");
  if (cli.some((arg) => /^(?:--project-ref|--linked|--db-url|--password)(?:=|$)/.test(arg))) {
    throw new LocalSupabaseError("remote or linked Supabase targets are forbidden");
  }
  const [group, subcommand] = cli;
  const allowed =
    (group !== undefined && LOCAL_COMMANDS.has(group)) ||
    (group === "db" && subcommand !== undefined && LOCAL_DB_COMMANDS.has(subcommand)) ||
    (group === "migration" &&
      subcommand !== undefined &&
      LOCAL_MIGRATION_COMMANDS.has(subcommand));
  if (!allowed || group === "link" || group === "unlink") {
    throw new LocalSupabaseError(`Supabase command is outside the local allowlist: ${cli.join(" ")}`);
  }
  return command;
}

function validateRoot(root) {
  const resolvedRoot = realpathSync(root);
  const config = resolve(resolvedRoot, "supabase", "config.toml");
  const linkedRef = resolve(resolvedRoot, "supabase", ".temp", "project-ref");
  if (existsSync(linkedRef)) {
    throw new LocalSupabaseError("linked Supabase state is forbidden; remove supabase/.temp/project-ref");
  }
  if (existsSync(config)) {
    const text = readFileSync(config, "utf8");
    if (!text.includes('[auth.third_party.clerk]') || !text.includes('domain = "env(CLERK_FAPI)"')) {
      throw new LocalSupabaseError("supabase/config.toml must bind Clerk through env(CLERK_FAPI)");
    }
  }
  return resolvedRoot;
}

function resolveFapi(environment) {
  const candidate = environment.CLERK_FAPI?.trim() || FIXTURE_FAPI;
  if (candidate.includes("://") || !HOSTNAME.test(candidate)) {
    throw new LocalSupabaseError("credential_gate: CLERK_FAPI must be a protocol-less hostname", "credential_gate");
  }
  return candidate;
}

async function main() {
  try {
    const command = parseInvocation(process.argv.slice(2));
    const cwd = validateRoot(process.cwd());
    const fapi = resolveFapi(process.env);
    const child = spawn(command[0], command.slice(1), {
      cwd,
      env: { ...process.env, CLERK_FAPI: fapi },
      stdio: "inherit",
    });
    const code = await new Promise((settle, reject) => {
      child.once("error", reject);
      child.once("exit", (exitCode, signal) => {
        if (signal !== null) reject(new LocalSupabaseError(`Supabase CLI terminated by ${signal}`));
        else settle(exitCode ?? 1);
      });
    });
    process.exitCode = code;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown local Supabase wrapper failure";
    console.error(message);
    process.exitCode = 1;
  }
}

await main();
