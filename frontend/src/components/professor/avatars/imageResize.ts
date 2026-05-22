/**
 * 프로필 사진 업로드 전 클라이언트 측 다운스케일·재인코딩.
 *
 * 배경: 고해상도·대용량 사진을 그대로 올리면 HeyGen Talking Photo 등록이
 * 실패하는 사례가 있었다(원본 수천만 픽셀). 업로드 전에 긴 변을 MAX_DIM 으로
 * 줄이고 JPEG 로 재인코딩해 용량을 백엔드 한도(8MB) 아래로 떨어뜨린다.
 * webp 등 비표준 입력도 JPEG 로 정규화해 백엔드 magic-byte 검증을 통과시킨다.
 *
 * 어떤 단계든 실패하면 원본 File 을 그대로 반환한다(업로드 자체를 막지 않음).
 */

const MAX_DIM = 1024;
const JPEG_QUALITY = 0.85;
// 이 용량 이하 + 충분히 작은 해상도 + 이미 jpeg/png 면 원본을 그대로 둔다.
const PASSTHROUGH_MAX_BYTES = 1.5 * 1024 * 1024;

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      // EXIF 회전 정보를 반영해 세로 사진이 눕지 않도록 한다.
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      /* 일부 브라우저는 옵션 미지원 — 아래 HTMLImageElement 폴백 */
    }
  }
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image decode failed"));
    };
    img.src = url;
  });
}

function dimsOf(src: ImageBitmap | HTMLImageElement): { w: number; h: number } {
  if ("width" in src && "height" in src) {
    const w = (src as { width: number }).width;
    const h = (src as { height: number }).height;
    // HTMLImageElement 는 naturalWidth 가 정확하다.
    const nat = src as HTMLImageElement;
    return {
      w: nat.naturalWidth || w,
      h: nat.naturalHeight || h,
    };
  }
  return { w: 0, h: 0 };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function downscaleImageFile(file: File): Promise<File> {
  if (typeof document === "undefined" || !file.type.startsWith("image/")) {
    return file;
  }

  const isStandard = file.type === "image/jpeg" || file.type === "image/png";
  let bitmap: ImageBitmap | HTMLImageElement | null = null;
  try {
    bitmap = await loadBitmap(file);
    const { w, h } = dimsOf(bitmap);
    if (!w || !h) return file;

    const scale = Math.min(1, MAX_DIM / Math.max(w, h));
    // 이미 작고 표준 포맷이며 용량도 작으면 손대지 않는다.
    if (scale >= 1 && isStandard && file.size <= PASSTHROUGH_MAX_BYTES) {
      return file;
    }

    const targetW = Math.max(1, Math.round(w * scale));
    const targetH = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, targetW, targetH);

    const blob = await canvasToBlob(canvas, "image/jpeg", JPEG_QUALITY);
    // 재인코딩 결과가 없거나 외려 더 크면(이미 잘 압축된 작은 jpeg) 원본 유지.
    if (!blob || (isStandard && blob.size >= file.size)) return file;

    const baseName = file.name.replace(/\.[^./\\]+$/, "") || "photo";
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  } finally {
    if (bitmap && "close" in bitmap && typeof bitmap.close === "function") {
      bitmap.close();
    }
  }
}
