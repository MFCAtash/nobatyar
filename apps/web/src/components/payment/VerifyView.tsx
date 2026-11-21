"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { errorMessage } from "@/lib/messages";
import { Loading } from "@/components/ui";

/** مرحله‌ی ۲ پرداخت: تأیید پس از بازگشت از درگاه (وضعیت فقط از پاسخ سرور). */
export function VerifyView({
  appointmentId,
  authority,
}: {
  appointmentId: string;
  authority: string;
}) {
  const { api } = useAuth();
  const router   = useRouter();
  type State = "PAID" | "PENDING" | "FAILED" | "REVIEW";
  const [result, setResult] = useState<{ state: State; message: string } | null>(null);
  const [err, setErr]       = useState<string | null>(null);

  // وضعیت فقط از پاسخ سرور می‌آید؛ پارامتر Status مرورگر ارسال هم نمی‌شود (قابل جعل است).
  useEffect(() => {
    if (!authority) { setErr("اطلاعات بازگشت از درگاه ناقص است."); return; }
    let cancelled = false;
    let tries = 0;
    const run = () =>
      api.post<{ success: boolean; state: State; message: string }>("/payments/verify", { appointmentId, authority })
        .then((r) => {
          if (cancelled) return;
          setResult(r);
          // «در انتظار»: چند بار با فاصله دوباره بپرس (تأخیر درگاه)؛ سپس job ی سرور پیگیری می‌کند
          if (r.state === "PENDING" && ++tries < 4) setTimeout(run, 5000 * tries);
        })
        .catch((e) => !cancelled && setErr(errorMessage(e)));
    void run();
    return () => { cancelled = true; };
  }, [api, appointmentId, authority]);

  if (!result && !err) return <Loading rows={2} />;

  const icon = result?.state === "PAID" ? "✅" : result?.state === "PENDING" || result?.state === "REVIEW" ? "⏳" : "❌";
  const title =
    result?.state === "PAID" ? "پرداخت موفق"
    : result?.state === "PENDING" ? "در حال تأیید پرداخت"
    : result?.state === "REVIEW" ? "پرداخت در حال بررسی"
    : "پرداخت ناموفق";

  return (
    <div className="page">
      <div className="container mw-xs status-page">
        <div className="status-icon" aria-hidden="true">{icon}</div>
        <h2>{title}</h2>
        <p className="muted">{result?.message ?? err}</p>
        {result?.state === "PAID" ? (
          <button className="btn btn-primary mt-6" onClick={() => router.push(`/appointments/${appointmentId}`)}>
            مشاهده نوبت
          </button>
        ) : (
          <>
            {result?.state !== "REVIEW" && (
              <button className="btn btn-primary mt-6" onClick={() => router.push(`/payment?appointmentId=${appointmentId}`)}>
                {result?.state === "PENDING" ? "بررسی دوباره" : "تلاش مجدد"}
              </button>
            )}
            <button className="btn btn-ghost btn-block mt-2" onClick={() => router.push("/appointments")}>
              بازگشت به نوبت‌هایم
            </button>
          </>
        )}
      </div>
    </div>
  );
}
