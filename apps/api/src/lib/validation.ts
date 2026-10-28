import { zValidator } from "@hono/zod-validator";
import type { ZodType } from "zod";
import { apiError, type ApiErrorBody } from "./error-handler.ts";

/**
 * Validator JSON yang mengembalikan 400 dengan bentuk error konsisten.
 * Dipakai semua endpoint yang menerima body agar input salah tidak pernah jadi 500.
 */
export function jsonBody<T extends ZodType>(schema: T) {
  return zValidator("json", schema, (result, c) => {
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));
      console.error("Validation error:", JSON.stringify({ input: result.data, issues: details }, null, 2));
      return c.json(apiError("VALIDATION_ERROR", "Input tidak valid.", details), 400);
    }
  });
}

/**
 * Validator query string dengan bentuk error yang sama.
 */
export function queryParams<T extends ZodType>(schema: T) {
  return zValidator("query", schema, (result, c) => {
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));
      return c.json(apiError("VALIDATION_ERROR", "Parameter tidak valid.", details), 400);
    }
  });
}

export type { ApiErrorBody };
