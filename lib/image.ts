/**
 * 업로드 전 클라이언트 리사이즈 및 JPEG 변환.
 *
 * 폰 카메라/앨범 원본(HEIC 등)을 장변 1600px 이하 JPEG 로 변환하여 업로드한다.
 */
const MAX_EDGE = 1600;
const QUALITY = 0.85;

export async function resizeForUpload(file: File): Promise<File> {
  let width = 0;
  let height = 0;
  let drawSource: CanvasImageSource | null = null;

  try {
    const bitmap = await createImageBitmap(file);
    width = bitmap.width;
    height = bitmap.height;
    drawSource = bitmap;
  } catch {
    // createImageBitmap 디코딩 실패 시 <img> fallback (iOS Safari HEIC 대비)
    try {
      const img = await loadImageElement(file);
      width = img.width;
      height = img.height;
      drawSource = img;
    } catch {
      return file;
    }
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const targetW = Math.round(width * scale);
  const targetH = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx || !drawSource) {
    if (drawSource && "close" in drawSource && typeof drawSource.close === "function") {
      drawSource.close();
    }
    return file;
  }

  ctx.drawImage(drawSource, 0, 0, targetW, targetH);
  if ("close" in drawSource && typeof drawSource.close === "function") {
    drawSource.close();
  }

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITY),
  );
  if (!blob) return file;

  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
    type: "image/jpeg",
  });
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}
