import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { env } from "../env.ts";
import {
  isUploadFilename,
  uploadMimeType,
  type ImageKind,
} from "./image-rules.ts";

export const uploadDir = resolve(env.UPLOAD_DIR);
export const maxUploadBytes = Math.floor(env.MAX_UPLOAD_MB * 1024 * 1024);

export async function storeUpload(
  bytes: Uint8Array,
  kind: ImageKind,
): Promise<string> {
  await mkdir(uploadDir, { recursive: true });

  const filename = `${randomUUID()}.${kind.extension}`;
  await writeFile(join(uploadDir, filename), bytes, { flag: "wx" });
  return filename;
}

export async function removeUpload(filename: string): Promise<void> {
  if (!isUploadFilename(filename)) return;

  try {
    await unlink(join(uploadDir, filename));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(`[uploads] Gagal menghapus ${filename}:`, error);
    }
  }
}

export async function removeUploadByUrl(imageUrl: string): Promise<void> {
  const filename = imageUrl.split("/").pop() ?? "";
  await removeUpload(filename);
}

export async function readUpload(
  filename: string,
): Promise<{ bytes: Uint8Array; mime: ImageKind["mime"] } | null> {
  const mime = uploadMimeType(filename);
  if (!mime) return null;

  try {
    const bytes = await readFile(join(uploadDir, filename));
    return { bytes, mime };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(`[uploads] Gagal membaca ${filename}:`, error);
    }
    return null;
  }
}
