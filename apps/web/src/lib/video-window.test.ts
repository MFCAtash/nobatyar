import { describe, expect, it } from "vitest";
import { mediaErrorMessage, qualityLabel, videoUiState } from "./video-window";

const base = { status: "CONFIRMED" as const, kind: "VIDEO" as const, startsAt: "2026-10-20T10:00:00Z", endsAt: "2026-10-20T10:20:00Z" };
const t = (iso: string) => new Date(iso).getTime();

describe("videoUiState", () => {
  it("early → open → ended around the window (10 min before, 15 min after)", () => {
    expect(videoUiState(base, t("2026-10-20T09:49:59Z")).state).toBe("early");
    expect(videoUiState(base, t("2026-10-20T09:50:00Z")).state).toBe("open");
    expect(videoUiState(base, t("2026-10-20T10:34:59Z")).state).toBe("open");
    expect(videoUiState(base, t("2026-10-20T10:35:00Z")).state).toBe("ended");
  });
  it("only CONFIRMED / IN_PROGRESS VIDEO visits are joinable", () => {
    const now = t("2026-10-20T10:05:00Z");
    expect(videoUiState({ ...base, status: "IN_PROGRESS" }, now).state).toBe("open");
    expect(videoUiState({ ...base, status: "PENDING_CONFIRMATION" }, now).state).toBe("unavailable");
    expect(videoUiState({ ...base, status: "COMPLETED" }, now).state).toBe("unavailable");
    expect(videoUiState({ ...base, kind: "CHAT" }, now).state).toBe("not_video");
  });
  it("exposes the opening time for the countdown", () => {
    expect(videoUiState(base, t("2026-10-20T08:00:00Z")).opensAt.toISOString()).toBe("2026-10-20T09:50:00.000Z");
  });
});

describe("labels", () => {
  it("maps LiveKit quality names", () => {
    expect(qualityLabel("poor").tone).toBe("warn");
    expect(qualityLabel("lost").tone).toBe("bad");
    expect(qualityLabel(undefined).text).toBe("—");
  });
  it("explains getUserMedia failures", () => {
    expect(mediaErrorMessage("NotAllowedError")).toMatch(/اجازه/);
    expect(mediaErrorMessage("NotFoundError")).toMatch(/پیدا نشد/);
    expect(mediaErrorMessage("NotReadableError")).toMatch(/برنامه‌ی دیگری/);
    expect(mediaErrorMessage("Whatever")).toMatch(/ممکن نشد/);
  });
});
