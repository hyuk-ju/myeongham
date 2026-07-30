import { createHash } from "node:crypto";

export function createSupportCode(userId: string): string {
  const digest = createHash("sha256")
    .update("myeongham-support-code:v1:")
    .update(userId)
    .digest("hex")
    .slice(0, 12)
    .toUpperCase();
  return `${digest.slice(0, 4)}-${digest.slice(4, 8)}-${digest.slice(8)}`;
}

export function maskEmail(email: string | null): string | null {
  if (email === null) return null;
  const separatorIndex = email.lastIndexOf("@");
  if (separatorIndex < 1) return null;

  const local = email.slice(0, separatorIndex);
  const domain = email.slice(separatorIndex + 1);
  const visibleLocal = local.slice(0, 1);
  return `${visibleLocal}${"*".repeat(Math.min(Math.max(local.length - 1, 3), 8))}@${domain}`;
}
