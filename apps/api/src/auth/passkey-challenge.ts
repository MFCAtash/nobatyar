import { UnauthorizedException } from "@nestjs/common";

/** استخراج challenge از clientDataJSON (base64url) بدون اعتماد به ورودی کلاینت. */
export function readChallenge(clientDataJSON: string): string {
  try {
    const parsed = JSON.parse(Buffer.from(clientDataJSON, "base64url").toString("utf8")) as { challenge?: string };
    if (typeof parsed.challenge !== "string" || parsed.challenge.length < 16 || parsed.challenge.length > 512) {
      throw new Error("invalid challenge");
    }
    return parsed.challenge;
  } catch {
    throw new UnauthorizedException({ error: "invalid_client_data" });
  }
}

/** استنتاج دامنهٔ واقعی از متغیرهای محیطی (قابل تست مستقل). */
export function webauthnConfig(env: NodeJS.ProcessEnv = process.env): { origin: string; rpID: string } {
  const explicitOrigin = env.WEBAUTHN_ORIGIN?.replace(/\/$/, "");
  const configured = explicitOrigin ?? env.WEB_ORIGIN ?? env.CORS_ORIGINS?.split(",")[0]?.trim();
  const origin = configured && /^https?:\/\//.test(configured) ? configured.replace(/\/$/, "") : "http://localhost:3001";
  const explicitRp = env.WEBAUTHN_RP_ID?.replace(/^https?:\/\//, "").replace(/:\d+$/, "").replace(/\/$/, "");
  let rpID = explicitRp;
  if (!rpID) {
    try { rpID = new URL(origin).hostname; } catch { rpID = "localhost"; }
  }
  return { origin, rpID };
}

interface Pending {
  userId: string | null;
  expiresAt: number;
}

/** انبار چالش کوتاهعمر و یکبارمصرف (در استقرار چندنمونهای با Redis جایگزین شود). */
export class ChallengeStore {
  private readonly map = new Map<string, Pending>();

  constructor(private readonly ttlMs = 5 * 60_000, private readonly max = 5_000) {}

  remember(challenge: string, userId: string | null, now = Date.now()): void {
    if (this.map.size >= this.max) {
      for (const [k, v] of this.map) if (v.expiresAt <= now) this.map.delete(k);
      if (this.map.size >= this.max) this.map.clear();
    }
    this.map.set(challenge, { userId, expiresAt: now + this.ttlMs });
  }

  take(challenge: string, expectedUserId?: string, now = Date.now()): string | null {
    const row = this.map.get(challenge);
    if (!row || row.expiresAt <= now) {
      this.map.delete(challenge);
      throw new UnauthorizedException({ error: "challenge_expired" });
    }
    this.map.delete(challenge); // یکبارمصرف
    if (expectedUserId !== undefined && row.userId !== expectedUserId) {
      throw new UnauthorizedException({ error: "challenge_user_mismatch" });
    }
    return row.userId;
  }
}
