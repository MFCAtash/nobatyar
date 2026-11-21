"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { errorMessage } from "@/lib/messages";
import { currentSupport, disablePush, enablePush, isSubscribed } from "@/lib/push";
import type { PushSupport } from "@/lib/push";

/** فعال/غیرفعال‌سازی یادآوری نوبت روی همین دستگاه (Web Push). متن پوش‌ها عمومی است و داده‌ی سلامت ندارد. */
export function PushToggle() {
  const { api } = useAuth();
  const [support, setSupport] = useState<PushSupport>("unsupported");
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { void currentSupport().then(setSupport); void isSubscribed().then(setOn); }, []);

  if (support === "unsupported") return null;

  async function toggle() {
    setBusy(true); setMsg(null);
    try {
      if (on) { await disablePush(api); setOn(false); }
      else {
        const r = await enablePush(api);
        if (r === "ok") setOn(true);
        else setMsg(r === "denied" ? "اجازه‌ی اعلان در مرورگر داده نشد. از تنظیمات مرورگر می‌توانید آن را فعال کنید." : "اعلان در این دستگاه در دسترس نیست.");
      }
    } catch (e) {
      setMsg(errorMessage(e));
    } finally { setBusy(false); void currentSupport().then(setSupport); }
  }

  return (
    <div className="card row between mb-4 gap-3">
      <div>
        <strong>یادآوری نوبت روی این دستگاه</strong>
        <p className="muted small m-0 mt-1">
          {support === "denied" ? "اعلان‌ها در مرورگر مسدود شده‌اند." : "پیش از نوبت اعلان می‌گیرید. متن اعلان عمومی است و اطلاعات پزشکی ندارد."}
        </p>
        {msg && <p className="small text-danger m-0 mt-1" role="alert">{msg}</p>}
      </div>
      <button className={on ? "btn btn-ghost btn-sm" : "btn btn-primary btn-sm"} disabled={busy || support === "denied"} onClick={() => void toggle()} aria-pressed={on}>
        {on ? "غیرفعال‌سازی" : "فعال‌سازی"}
      </button>
    </div>
  );
}
