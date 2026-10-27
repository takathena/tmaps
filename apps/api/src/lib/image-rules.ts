export type ImageKind = {
  mime: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  extension: "jpg" | "png" | "webp" | "gif";
};

/**
 * Nama file upload selalu dibuat server dalam format UUID + ekstensi gambar.
 * Pola ini juga dipakai untuk menolak path traversal saat menyajikan file.
 */
const UPLOAD_FILENAME_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif)$/;

const MIME_BY_EXTENSION: Record<string, ImageKind["mime"]> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((value, index) => bytes[offset + index] === value);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  if (bytes.length < offset + length) return "";
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

/**
 * Tipe file ditentukan dari magic bytes, bukan hanya Content-Type dari
 * browser. File SVG sengaja tidak diterima karena dapat memuat skrip.
 */
export function detectImageKind(bytes: Uint8Array): ImageKind | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return { mime: "image/jpeg", extension: "jpg" };
  }

  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { mime: "image/png", extension: "png" };
  }

  const gifHeader = ascii(bytes, 0, 6);
  if (gifHeader === "GIF87a" || gifHeader === "GIF89a") {
    return { mime: "image/gif", extension: "gif" };
  }

  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return { mime: "image/webp", extension: "webp" };
  }

  return null;
}

export function isUploadFilename(value: string): boolean {
  return UPLOAD_FILENAME_PATTERN.test(value);
}

export function uploadMimeType(filename: string): ImageKind["mime"] | null {
  if (!isUploadFilename(filename)) return null;
  const extension = filename.slice(filename.lastIndexOf(".") + 1);
  return MIME_BY_EXTENSION[extension] ?? null;
}
