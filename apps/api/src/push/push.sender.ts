import type { PushConfig } from "./push.config";

export const PUSH_SENDER = Symbol("PUSH_SENDER");

export interface PushTarget { endpoint: string; p256dh: string; auth: string }
export type PushSendResult = { ok: true } | { ok: false; gone: boolean; status?: number };

export interface PushSender {
  send(target: PushTarget, payloadJson: string): Promise<PushSendResult>;
}

/** فرستنده‌ی واقعی (کتابخانه‌ی web-push). بارگذاری تنبل: وقتی پوش خاموش است وابستگی لازم نیست. */
export class WebPushSender implements PushSender {
  private lib?: typeof import("web-push");

  constructor(private readonly cfg: PushConfig) {
    if (!cfg.enabled) throw new Error("push is not configured");
  }

  private async init() {
    if (!this.lib) {
      const mod = await import("web-push");
      const lib = (mod as unknown as { default?: typeof import("web-push") }).default ?? mod;
      lib.setVapidDetails(this.cfg.subject!, this.cfg.publicKey!, this.cfg.privateKey!);
      this.lib = lib;
    }
    return this.lib;
  }

  async send(t: PushTarget, payloadJson: string): Promise<PushSendResult> {
    const lib = await this.init();
    try {
      await lib.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, payloadJson, { TTL: 3600, urgency: "normal", timeout: 8000 });
      return { ok: true };
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      return { ok: false, gone: status === 404 || status === 410, status }; // پیام خطا (حاوی endpoint) عمداً برنمی‌گردد
    }
  }
}
