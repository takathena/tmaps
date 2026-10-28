import { z } from "zod";

/**
 * Validasi UUID v4 untuk parameter route :id
 */
export const uuidSchema = z.string().uuid("ID tidak valid");

/**
 * Validasi UUID dari param dan lempar 400 jika tidak valid.
 * Gunakan di awal handler route.
 */
export function validateUuidParam(id: string): void {
  const result = uuidSchema.safeParse(id);
  if (!result.success) {
    throw new Error("ID tidak valid");
  }
}
