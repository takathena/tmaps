import { describe, expect, it } from "bun:test";
import {
  detectImageKind,
  isUploadFilename,
  uploadMimeType,
} from "./image-rules.ts";

function bytes(...values: number[]): Uint8Array {
  return Uint8Array.from(values);
}

function ascii(value: string): Uint8Array {
  return Uint8Array.from(value, (character) => character.charCodeAt(0));
}

describe("aturan upload gambar", () => {
  it("mengenali JPEG dari magic bytes", () => {
    expect(detectImageKind(bytes(0xff, 0xd8, 0xff, 0xe0))).toEqual({
      mime: "image/jpeg",
      extension: "jpg",
    });
  });

  it("mengenali PNG dari magic bytes", () => {
    expect(
      detectImageKind(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00)),
    ).toEqual({ mime: "image/png", extension: "png" });
  });

  it("mengenali GIF87a dan GIF89a", () => {
    expect(detectImageKind(ascii("GIF87a"))).toEqual({
      mime: "image/gif",
      extension: "gif",
    });
    expect(detectImageKind(ascii("GIF89a"))).toEqual({
      mime: "image/gif",
      extension: "gif",
    });
  });

  it("mengenali WebP dari header RIFF/WEBP", () => {
    const header = new Uint8Array(12);
    header.set(ascii("RIFF"), 0);
    header.set(ascii("WEBP"), 8);

    expect(detectImageKind(header)).toEqual({
      mime: "image/webp",
      extension: "webp",
    });
  });

  it("menolak teks, SVG, file kosong, dan header yang mirip", () => {
    expect(detectImageKind(ascii("hello world"))).toBeNull();
    expect(detectImageKind(ascii("<svg xmlns=\"http://www.w3.org/2000/svg\">"))).toBeNull();
    expect(detectImageKind(new Uint8Array())).toBeNull();
    expect(detectImageKind(ascii("RIFFxxxxWAVE"))).toBeNull();
    expect(detectImageKind(bytes(0xff, 0xd8))).toBeNull();
  });

  it("hanya menerima nama file UUID dengan ekstensi gambar", () => {
    expect(isUploadFilename("123e4567-e89b-12d3-a456-426614174000.png")).toBe(true);
    expect(isUploadFilename("123e4567-e89b-12d3-a456-426614174000.jpg")).toBe(true);
    expect(isUploadFilename("123e4567-e89b-12d3-a456-426614174000.webp")).toBe(true);
    expect(isUploadFilename("123e4567-e89b-12d3-a456-426614174000.gif")).toBe(true);

    expect(isUploadFilename("../123e4567-e89b-12d3-a456-426614174000.png")).toBe(false);
    expect(isUploadFilename("123e4567-e89b-12d3-a456-426614174000.svg")).toBe(false);
    expect(isUploadFilename("foto.png")).toBe(false);
    expect(isUploadFilename("123e4567-e89b-12d3-a456-426614174000.png.exe")).toBe(false);
  });

  it("memetakan ekstensi file ke MIME yang tepat", () => {
    expect(uploadMimeType("123e4567-e89b-12d3-a456-426614174000.jpg")).toBe(
      "image/jpeg",
    );
    expect(uploadMimeType("123e4567-e89b-12d3-a456-426614174000.png")).toBe(
      "image/png",
    );
    expect(uploadMimeType("123e4567-e89b-12d3-a456-426614174000.webp")).toBe(
      "image/webp",
    );
    expect(uploadMimeType("123e4567-e89b-12d3-a456-426614174000.gif")).toBe(
      "image/gif",
    );
    expect(uploadMimeType("foto.png")).toBeNull();
  });
});
