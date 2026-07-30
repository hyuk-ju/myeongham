import { readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";

const tokenReferenceSchema = z.object({
  id: z.string().min(1),
  consumed: z.boolean(),
});

const jwtClaimsSchema = z.object({
  sub: z.string().min(1),
  role: z.literal("authenticated"),
});

export class CredentialGateError extends Error {
  constructor(message: string) {
    super(`credential_gate: ${message}`);
    this.name = "CredentialGateError";
  }
}

export function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new CredentialGateError(`missing ${name}`);
  return value;
}

export function e2ePaths(): {
  readonly root: string;
  readonly storageState: string;
  readonly ticketReference: string;
} {
  const root = requiredEnvironment("E2E_RUN_ROOT");
  return {
    root,
    storageState: resolve(root, "storage-state.json"),
    ticketReference: resolve(root, "ticket-reference.json"),
  };
}

export function parseAuthenticatedClaims(token: string): {
  readonly sub: string;
  readonly role: "authenticated";
} {
  const payload = token.split(".")[1];
  if (payload === undefined) throw new CredentialGateError("Clerk session is not a JWT");
  const decoded: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  return jwtClaimsSchema.parse(decoded);
}

export async function writeTicketReference(id: string, consumed: boolean): Promise<void> {
  await writeFile(e2ePaths().ticketReference, JSON.stringify({ id, consumed }), {
    mode: 0o600,
  });
}

export async function readTicketReference(): Promise<{
  readonly id: string;
  readonly consumed: boolean;
} | null> {
  try {
    const raw = await readFile(e2ePaths().ticketReference, "utf8");
    return tokenReferenceSchema.parse(JSON.parse(raw));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

export async function cleanupAuthArtifacts(
  options: Readonly<{ removeRunRoot?: boolean }> = {},
): Promise<void> {
  const paths = e2ePaths();
  await rm(paths.storageState, { force: true });
  await rm(paths.ticketReference, { force: true });
  if (options.removeRunRoot === true) {
    await rm(paths.root, { recursive: true, force: true });
  }
}
