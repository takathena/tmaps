import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { z } from "zod";
import { errorHandler } from "./error-handler.ts";
import { jsonBody } from "./validation.ts";

describe("validasi input", () => {
  it("mengembalikan 400 dengan pesan jelas untuk body tidak valid", async () => {
    const app = new Hono();
    app.onError(errorHandler);
    app.post(
      "/contoh",
      jsonBody(z.object({ name: z.string().min(3, "Nama minimal 3 karakter.") })),
      (c) => c.json(c.req.valid("json")),
    );

    const response = await app.request("/contoh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "ab" }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      error: { code: string; message: string; details: Array<{ path: string; message: string }> };
    };
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toBe("Input tidak valid.");
    expect(body.error.details[0]).toEqual({ path: "name", message: "Nama minimal 3 karakter." });
  });

  it("mengembalikan 400 saat JSON rusak", async () => {
    const app = new Hono();
    app.onError(errorHandler);
    app.post("/contoh", jsonBody(z.object({ name: z.string() })), (c) => c.json(c.req.valid("json")));

    const response = await app.request("/contoh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{bukan-json",
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});
