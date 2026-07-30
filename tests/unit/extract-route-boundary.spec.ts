import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateDownloadedImage } from "@/lib/image-signature";

const fixture = (name: string) =>
  readFile(resolve(process.cwd(), "tests/fixtures/cards", name));

describe("downloaded extraction image boundary", () => {
  it("Given a stored JPEG path and matching bytes When revalidated Then the detected media is trusted", async () => {
    const bytes = await fixture("valid-jpeg.jpg");

    expect(validateDownloadedImage("owner/card.jpg", bytes, "image/jpeg")).toMatchObject({
      ok: true,
      value: { contentType: "image/jpeg", extension: "jpg" },
    });
  });

  it("Given a replaced object When bytes or metadata disagree Then AI input is rejected", async () => {
    const png = await fixture("valid-png.png");
    const truncated = await fixture("truncated-jpeg.jpg");

    expect(validateDownloadedImage("owner/card.jpg", png, "image/jpeg")).toEqual({
      ok: false,
      code: "unsupported_media",
    });
    expect(validateDownloadedImage("owner/card.jpg", truncated, "image/jpeg")).toEqual({
      ok: false,
      code: "unsupported_media",
    });
  });

  it("Given a replaced oversized object When revalidated Then the size error is stable", async () => {
    const bytes = await fixture("oversize.bin");

    expect(validateDownloadedImage("owner/card.jpg", bytes, "image/jpeg")).toEqual({
      ok: false,
      code: "payload_too_large",
    });
  });
});
