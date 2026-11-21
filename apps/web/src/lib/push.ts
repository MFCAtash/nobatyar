/** کمک‌های Web Push سمت مرورگر. اشتراک فقط پس از «اقدام صریح کاربر» (کلیک) ساخته می‌شود. */

/** کلید VAPID (base64url) → Uint8Array برای applicationServerKey */
export function urlBase64ToUint8Array(b64url: string): Uint8Array {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob((b64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export type PushSupport = "unsupported" | "denied" | "available";

export function pushSupport(env: { hasSW: boolean; hasPush: boolean; hasNotification: boolean; permission?: string }): PushSupport {
  if (!env.hasSW || !env.hasPush || !env.hasNotification) return "unsupported";
  return env.permission === "denied" ? "denied" : "available";
}

interface Api {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
}

export async function currentSupport(): Promise<PushSupport> {
  if (typeof window === "undefined") return "unsupported";
  return pushSupport({
    hasSW: "serviceWorker" in navigator, hasPush: "PushManager" in window, hasNotification: "Notification" in window,
    permission: "Notification" in window ? Notification.permission : undefined,
  });
}

export async function isSubscribed(): Promise<boolean> {
  if ((await currentSupport()) === "unsupported") return false;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return !!(await reg?.pushManager.getSubscription());
}

/** باید مستقیماً از رویداد کلیک صدا زده شود (الزام مرورگرها برای درخواست مجوز). */
export async function enablePush(api: Api): Promise<"ok" | "denied" | "unavailable"> {
  if ((await currentSupport()) !== "available") return "unavailable";
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return "denied";
  const { publicKey } = await api.get<{ publicKey: string }>("/push/public-key"); // 503 اگر سرور پوش را فعال نکرده
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource });
  await api.post("/push/subscribe", sub.toJSON());
  return "ok";
}

export async function disablePush(api: Api): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api.post("/push/unsubscribe", { endpoint: sub.endpoint });
  await sub.unsubscribe();
}
