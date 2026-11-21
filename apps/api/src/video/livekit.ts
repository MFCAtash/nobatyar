import { createHash, timingSafeEqual } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";

/**
 * کلاینت سبک LiveKit — بدون livekit-server-sdk (کمتر وابستگی، سطح حمله‌ی کوچک‌تر).
 *  - توکن ورود = JWT با HS256: iss = API key، sub = identity، claim ی `video` (گرنت‌ها).
 *  - Webhook = JWT در هدر Authorization با claim ی `sha256` (base64 هش بدنه).
 *  - مدیریت اتاق = Twirp روی HTTP با توکن roomAdmin.
 */
export interface JoinGrantInput {
  apiKey: string;
  apiSecret: string;
  room: string;
  identity: string;
  name: string;
  metadata?: Record<string, string>;
  /** انقضا (Unix ثانیه) */
  expiresAtSec: number;
  now?: Date;
}

const enc = (s: string) => new TextEncoder().encode(s);

export async function mintJoinToken(i: JoinGrantInput): Promise<string> {
  const nowSec = Math.floor((i.now ?? new Date()).getTime() / 1000);
  return new SignJWT({
    name: i.name,
    metadata: i.metadata ? JSON.stringify(i.metadata) : undefined,
    video: {
      room: i.room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      canUpdateOwnMetadata: false,
    },
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(i.apiKey)
    .setSubject(i.identity)
    .setJti(i.identity)
    .setNotBefore(nowSec - 5)
    .setIssuedAt(nowSec)
    .setExpirationTime(i.expiresAtSec)
    .sign(enc(i.apiSecret));
}

async function mintAdminToken(apiKey: string, apiSecret: string, room: string): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  return new SignJWT({ video: { roomAdmin: true, room } })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(apiKey)
    .setNotBefore(nowSec - 5)
    .setExpirationTime(nowSec + 60)
    .sign(enc(apiSecret));
}

export interface WebhookEvent {
  event: string;
  id?: string;
  /** ثانیه‌ی Unix */
  createdAt?: number | string;
  room?: { name?: string };
  participant?: { identity?: string };
}

/**
 * اعتبارسنجی webhook: امضا با secret، issuer = API key و مطابقت هش بدنه‌ی «خام».
 * null اگر نامعتبر است (علت عمداً برگردانده نمی‌شود).
 */
export async function verifyWebhook(
  rawBody: string,
  authHeader: string | undefined,
  apiKey: string,
  apiSecret: string,
): Promise<WebhookEvent | null> {
  if (!authHeader || typeof rawBody !== "string" || rawBody.length === 0) return null;
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  try {
    const { payload } = await jwtVerify(token, enc(apiSecret), { algorithms: ["HS256"], issuer: apiKey, clockTolerance: 30 });
    const claimed = typeof payload.sha256 === "string" ? Buffer.from(payload.sha256, "base64") : null;
    if (!claimed) return null;
    const actual = createHash("sha256").update(rawBody, "utf8").digest();
    if (claimed.length !== actual.length || !timingSafeEqual(claimed, actual)) return null;
    const ev = JSON.parse(rawBody) as WebhookEvent;
    return typeof ev?.event === "string" ? ev : null;
  } catch {
    return null;
  }
}

export interface RoomAdmin {
  deleteRoom(room: string): Promise<void>;
  removeParticipant(room: string, identity: string): Promise<void>;
}

export const ROOM_ADMIN = Symbol("ROOM_ADMIN");

export class LiveKitRoomAdmin implements RoomAdmin {
  constructor(
    private readonly httpUrl: string,
    private readonly apiKey: string,
    private readonly apiSecret: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async call(method: string, room: string, body: Record<string, unknown>): Promise<void> {
    const token = await mintAdminToken(this.apiKey, this.apiSecret, room);
    const res = await this.fetchImpl(`${this.httpUrl}/twirp/livekit.RoomService/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5_000),
    });
    // 404 = اتاق/شرکت‌کننده از قبل وجود ندارد ⇒ هدف حاصل شده است
    if (!res.ok && res.status !== 404) throw new Error(`livekit ${method} failed: ${res.status}`);
  }

  deleteRoom(room: string) {
    return this.call("DeleteRoom", room, { room });
  }
  removeParticipant(room: string, identity: string) {
    return this.call("RemoveParticipant", room, { room, identity });
  }
}

/** پیاده‌سازی خالی برای وقتی LiveKit غیرفعال است. */
export class NoopRoomAdmin implements RoomAdmin {
  async deleteRoom(): Promise<void> {}
  async removeParticipant(): Promise<void> {}
}
