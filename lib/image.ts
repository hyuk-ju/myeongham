/**
 * 업로드 전 클라이언트 리사이즈.
 *
 * 폰 카메라 원본은 4000px 이 넘는 경우가 많은데, 명함 판독에는 장변 1600px 이면
 * 충분하다. 업로드 시간과 이미지 토큰 사용량이 함께 줄어든다.
 */
const MAX_EDGE = 1600;
const QUALITY = 0.85;

export async function resizeForUpload(file: File): Promise<File> {
  // HEIC 등 브라우저가 디코드하지 못하는 포맷은 원본 그대로 올린다.
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  const { width, height } = bitmap;
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const targetW = Math.round(width * scale);
  const targetH = Math.round(height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITY),
  );
  if (!blob) return file;

  // 리사이즈 결과가 원본보다 크면 (이미 작은 이미지) 원본을 쓴다.
  if (blob.size >= file.size && scale === 1) return file;

  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
    type: "image/jpeg",
  });
}
