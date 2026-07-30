import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type ExcludedScreenshot = {
  readonly path: string;
  readonly sha256: string;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly reasons: readonly string[];
};

function isExcludedScreenshot(value: unknown): value is ExcludedScreenshot {
  if (typeof value !== "object" || value === null) return false;
  return (
    typeof Reflect.get(value, "path") === "string" &&
    typeof Reflect.get(value, "sha256") === "string" &&
    typeof Reflect.get(value, "pixelWidth") === "number" &&
    typeof Reflect.get(value, "pixelHeight") === "number" &&
    Array.isArray(Reflect.get(value, "reasons"))
  );
}

describe("safe baseline manifest", () => {
  it("Given every inspected screenshot When verified Then no unsafe or unproven image is included", async () => {
    const directory = resolve(process.cwd(), ".omo/design-audit-screens");
    const raw = await readFile(resolve(directory, "safe-baseline-manifest.json"), "utf8");
    const manifest: unknown = JSON.parse(raw);
    expect(typeof manifest).toBe("object");
    expect(manifest).not.toBeNull();
    if (typeof manifest !== "object" || manifest === null) return;
    const included: unknown = Reflect.get(manifest, "included");
    const excluded: unknown = Reflect.get(manifest, "excluded");
    expect(included).toEqual([]);
    expect(Array.isArray(excluded)).toBe(true);
    if (!Array.isArray(excluded)) return;
    expect(excluded).toHaveLength(10);
    expect(raw).not.toMatch(/visibleText|extractedText|ocrText/);

    for (const record of excluded) {
      expect(isExcludedScreenshot(record)).toBe(true);
      if (!isExcludedScreenshot(record)) continue;
      const bytes = await readFile(resolve(directory, record.path));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(record.sha256);
      expect(bytes.readUInt32BE(16)).toBe(record.pixelWidth);
      expect(bytes.readUInt32BE(20)).toBe(record.pixelHeight);
      expect(record.reasons.length).toBeGreaterThan(0);
    }
  });
});
