import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Blob } from "node:buffer";
import { describe, expect, it } from "vitest";
import {
  detectImageSignature,
  validateImageBlob,
  validateImageBytes,
} from "@/lib/image-signature";

const fixture = (name: string) =>
  readFile(resolve(process.cwd(), "tests/fixtures/cards", name));

describe("image signature contracts", () => {
  it("Given Todo 1 image fixtures When their bytes are inspected Then JPEG PNG and WebP are detected", async () => {
    await expect(fixture("valid-jpeg.jpg").then(detectImageSignature)).resolves.toEqual({
      contentType: "image/jpeg",
      extension: "jpg",
    });
    await expect(fixture("valid-png.png").then(detectImageSignature)).resolves.toEqual({
      contentType: "image/png",
      extension: "png",
    });
    await expect(fixture("valid-webp.webp").then(detectImageSignature)).resolves.toEqual({
      contentType: "image/webp",
      extension: "webp",
    });
  });

  it("Given a truncated JPEG or arbitrary bytes When validated Then unsupported media is returned", async () => {
    const truncated = await fixture("truncated-jpeg.jpg");

    expect(validateImageBytes(truncated)).toEqual({
      ok: false,
      code: "unsupported_media",
    });
    expect(validateImageBytes(new Uint8Array([0, 1, 2, 3]))).toEqual({
      ok: false,
      code: "unsupported_media",
    });

    const png = await fixture("valid-png.png");
    const webp = await fixture("valid-webp.webp");
    expect(validateImageBytes(png.subarray(0, png.length - 12))).toEqual({
      ok: false,
      code: "unsupported_media",
    });
    const replacedLength = new Uint8Array(webp);
    replacedLength[4] = 0;
    replacedLength[5] = 0;
    replacedLength[6] = 0;
    replacedLength[7] = 0;
    expect(validateImageBytes(replacedLength)).toEqual({
      ok: false,
      code: "unsupported_media",
    });
  });

  it("Given a downloaded blob with a forged declared type When validated Then detected bytes determine its media type", async () => {
    const png = await fixture("valid-png.png");
    const blob = new Blob([png], { type: "image/jpeg" });

    await expect(validateImageBlob(blob)).resolves.toEqual({
      ok: true,
      value: {
        bytes: expect.any(Uint8Array),
        contentType: "image/png",
        extension: "png",
      },
    });
  });
});
