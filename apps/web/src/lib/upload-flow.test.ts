import { describe, expect, it } from "vitest";
import { extractExtension, MAX_UPLOAD_BYTES, normalizeMime, uploadSteps, validateUploadInput } from "./upload-flow";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const file = (type: string, size = 1024) => ({ name: "sample.bin", type, size });

describe("validateUploadInput — MIME", () => {
  it("accepts every allow-listed MIME and returns it", () => {
    const allowed = [
      "image/jpeg", "image/png", "image/gif", "image/webp",
      "application/pdf", "image/tiff", "application/dicom", DOCX, XLSX,
    ];
    for (const mime of allowed) {
      expect(validateUploadInput(file(mime))).toEqual({ ok: true, mime });
    }
  });

  it("rejects MIME types outside the allow-list", () => {
    for (const mime of ["text/html", "application/octet-stream", "image/svg+xml", "application/x-msdownload", ""]) {
      const r = validateUploadInput(file(mime));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/نوع فایل/);
    }
  });

  it("normalizes uppercase MIME with a charset parameter", () => {
    expect(normalizeMime("IMAGE/PNG; charset=utf-8")).toBe("image/png");
    expect(validateUploadInput(file("  APPLICATION/PDF ; charset=binary  "))).toEqual({ ok: true, mime: "application/pdf" });
    expect(validateUploadInput(file("IMAGE/JPEG;charset=UTF-8"))).toEqual({ ok: true, mime: "image/jpeg" });
  });

  it("accepts docx/xlsx by their full office MIME", () => {
    expect(validateUploadInput(file(DOCX))).toEqual({ ok: true, mime: DOCX });
    expect(validateUploadInput(file(XLSX))).toEqual({ ok: true, mime: XLSX });
  });
});

describe("validateUploadInput — size", () => {
  it("accepts exactly 20MB and rejects one byte more", () => {
    expect(validateUploadInput(file("image/png", MAX_UPLOAD_BYTES))).toEqual({ ok: true, mime: "image/png" });
    const r = validateUploadInput(file("image/png", MAX_UPLOAD_BYTES + 1));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/۲۰ مگابایت/);
  });

  it("rejects a negative or non-finite size", () => {
    expect(validateUploadInput(file("application/pdf", -1)).ok).toBe(false);
    expect(validateUploadInput(file("application/pdf", Number.NaN)).ok).toBe(false);
  });
});

describe("extractExtension", () => {
  it("returns a lowercase extension without the leading dot", () => {
    expect(extractExtension("Report.PDF")).toBe("pdf");
    expect(extractExtension("scan.v2.JPEG")).toBe("jpeg");
  });

  it("strips directories and Windows paths", () => {
    expect(extractExtension("folder/photo.png")).toBe("png");
    expect(extractExtension("C:\\tmp\\archive.XLSX")).toBe("xlsx");
  });

  it("returns an empty string when there is no usable extension", () => {
    expect(extractExtension("README")).toBe("");
    expect(extractExtension("trailing.")).toBe("");
  });

  it("caps the extension at 8 characters", () => {
    expect(extractExtension("x.abcdefghijk")).toBe("abcdefgh");
  });
});

describe("uploadSteps", () => {
  it("returns the token → put → finalize sequence", () => {
    expect(uploadSteps()).toEqual(["token", "put", "finalize"]);
  });

  it("returns a fresh array on each call", () => {
    expect(uploadSteps()).not.toBe(uploadSteps());
  });
});
