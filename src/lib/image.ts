// Сжатие фото на устройстве: перерисовка через canvas убирает EXIF (в том числе геометки) и уменьшает размер.
export async function compressImage(file: File, maxSide = 1280, maxBytes = 700_000): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k));
  const h = Math.max(1, Math.round(bmp.height * k));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  for (const q of [0.84, 0.75, 0.65, 0.55, 0.45]) {
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", q));
    if (blob && blob.size <= maxBytes) return blob;
  }
  throw new Error("Фото слишком большое. Выберите другое.");
}
