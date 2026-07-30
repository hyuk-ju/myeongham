const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

const IMAGE_TYPES = {
  jpeg: { contentType: "image/jpeg", extension: "jpg" },
  png: { contentType: "image/png", extension: "png" },
  webp: { contentType: "image/webp", extension: "webp" },
} as const;

export type DetectedImage = {
  readonly contentType: (typeof IMAGE_TYPES)[keyof typeof IMAGE_TYPES]["contentType"];
  readonly extension: (typeof IMAGE_TYPES)[keyof typeof IMAGE_TYPES]["extension"];
};

export type ValidatedImage = DetectedImage & {
  readonly bytes: Uint8Array;
};

export type ImageBlob = {
  arrayBuffer(): Promise<ArrayBuffer>;
};

export type ImageValidation =
  | { readonly ok: true; readonly value: ValidatedImage }
  | { readonly ok: false; readonly code: "payload_too_large" | "unsupported_media" };

export { MAX_IMAGE_BYTES };

export function detectImageSignature(bytes: Uint8Array): DetectedImage | null {
  if (isCompleteJpeg(bytes)) return IMAGE_TYPES.jpeg;
  if (isPng(bytes)) return IMAGE_TYPES.png;
  if (isCompleteWebp(bytes)) return IMAGE_TYPES.webp;
  return null;
}

export function validateImageBytes(bytes: Uint8Array): ImageValidation {
  if (bytes.byteLength === 0) return { ok: false, code: "unsupported_media" };
  if (bytes.byteLength > MAX_IMAGE_BYTES) return { ok: false, code: "payload_too_large" };

  const detected = detectImageSignature(bytes);
  if (detected === null) return { ok: false, code: "unsupported_media" };
  return { ok: true, value: { ...detected, bytes } };
}

export async function validateImageBlob(blob: ImageBlob): Promise<ImageValidation> {
  return validateImageBytes(new Uint8Array(await blob.arrayBuffer()));
}

export function validateDownloadedImage(
  path: string,
  bytes: Uint8Array,
  declaredType: string,
): ImageValidation {
  const extension = path.toLowerCase().split(".").pop();
  const expectedType = extension === "png"
    ? "image/png"
    : extension === "webp"
      ? "image/webp"
      : extension === "jpg" || extension === "jpeg"
        ? "image/jpeg"
        : null;
  if (expectedType === null) return { ok: false, code: "unsupported_media" };

  const image = validateImageBytes(bytes);
  if (!image.ok) return image;
  if (image.value.contentType !== expectedType) return { ok: false, code: "unsupported_media" };
  if (declaredType !== "" && declaredType.toLowerCase() !== image.value.contentType) {
    return { ok: false, code: "unsupported_media" };
  }
  return image;
}

function isCompleteJpeg(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff &&
    bytes[bytes.byteLength - 2] === 0xff &&
    bytes[bytes.byteLength - 1] === 0xd9
  );
}

function isPng(bytes: Uint8Array): boolean {
  if (
    bytes.byteLength < 33 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47 ||
    bytes[4] !== 0x0d ||
    bytes[5] !== 0x0a ||
    bytes[6] !== 0x1a ||
    bytes[7] !== 0x0a
  ) {
    return false;
  }

  let offset = 8;
  let sawHeader = false;
  while (offset + 12 <= bytes.byteLength) {
    const chunkLength = readUint32(bytes, offset);
    const chunkEnd = offset + 12 + chunkLength;
    if (chunkEnd > bytes.byteLength) return false;

    const chunkType = String.fromCharCode(
      bytes[offset + 4] ?? 0,
      bytes[offset + 5] ?? 0,
      bytes[offset + 6] ?? 0,
      bytes[offset + 7] ?? 0,
    );
    if (chunkType === "IHDR") {
      if (sawHeader || offset !== 8 || chunkLength !== 13) return false;
      sawHeader = true;
    }
    if (chunkType === "IEND") {
      return sawHeader && chunkLength === 0 && chunkEnd === bytes.byteLength;
    }
    offset = chunkEnd;
  }
  return false;
}

function isCompleteWebp(bytes: Uint8Array): boolean {
  if (
    bytes.byteLength < 16 ||
    bytes[0] !== 0x52 ||
    bytes[1] !== 0x49 ||
    bytes[2] !== 0x46 ||
    bytes[3] !== 0x46 ||
    bytes[8] !== 0x57 ||
    bytes[9] !== 0x45 ||
    bytes[10] !== 0x42 ||
    bytes[11] !== 0x50
  ) {
    return false;
  }

  const declaredSize = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true);
  return declaredSize >= 8 && declaredSize + 8 === bytes.byteLength;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) << 24) |
    ((bytes[offset + 1] ?? 0) << 16) |
    ((bytes[offset + 2] ?? 0) << 8) |
    (bytes[offset + 3] ?? 0)
  ) >>> 0;
}
