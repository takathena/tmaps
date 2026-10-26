import type { ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: Array<{ path: string; message: string }>;
  };
};

export function apiError(
  code: string,
  message: string,
  details?: Array<{ path: string; message: string }>,
): ApiErrorBody {
  return {
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  };
}

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof HTTPException) {
    const status = err.status;

    if (status === 400 && err.message.toLowerCase().includes("malformed json")) {
      return c.json(apiError("VALIDATION_ERROR", "Body request bukan JSON yang valid."), 400);
    }

    return c.json(apiError(httpStatusToCode(status), err.message || "Permintaan gagal."), status);
  }

  // Jangan pernah mengirim detail internal/stack ke client.
  console.error(
    `[error] ${c.req.method} ${c.req.path} ->`,
    err instanceof Error ? err.stack ?? err.message : err,
  );

  return c.json(apiError("INTERNAL_ERROR", "Terjadi kesalahan pada server."), 500);
};

export const notFoundHandler: NotFoundHandler = (c) =>
  c.json(apiError("NOT_FOUND", `Endpoint ${c.req.method} ${c.req.path} tidak ditemukan.`), 404);

function httpStatusToCode(status: number): string {
  switch (status) {
    case 400:
      return "BAD_REQUEST";
    case 401:
      return "UNAUTHORIZED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 409:
      return "CONFLICT";
    case 423:
      return "ACCOUNT_LOCKED";
    case 429:
      return "TOO_MANY_REQUESTS";
    default:
      return status >= 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR";
  }
}
