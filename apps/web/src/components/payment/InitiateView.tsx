"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { idempotencyHeaders } from "@/lib/idempotency";
import { useIntentKeys } from "@/lib/use-intent-keys";
import type { AppointmentDetail } from "@/lib/types";
import { errorMessage } from "@/lib/messages";
import { formatToman } from "@/lib/format";
import { DateText } from "@/components/kit";
import { ErrorBox, Loading } from "@/components/ui";

/** مرحله‌ی ۱ پرداخت: شروع پرداخت و هدایت به درگاه. */
export function InitiateView({ appointmentId }: { appointmentId: string }) {
  const { api } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState<string | null>(null);
  const [appt, setAppt]       = useState<AppointmentDetail | null>(null);
  const keys = useIntentKeys();

  useEffect(() => {
    api.get<AppointmentDetail>(`/appointments/${appointmentId}`)
      .then(setAppt)
      .catch((e) => setErr(errorMessage(e)));
  }, [api, appointmentId]);

  const pay = async () => {
    setLoading(true); setErr(null);
    try {
      // فقط «مبدأ» فرستاده می‌شود؛ آدرس بازگشت را سرور می‌سازد و با لیست سفید می‌سنجد
      const res = await api.post<{ status: "REDIRECT" | "PAID"; paymentUrl: string | null }>("/payments/initiate", {
        appointmentId,
        callbackUrl: window.location.origin,
      }, { headers: idempotencyHeaders(keys.get(`pay:${appointmentId}`)) }); // کلیک دوباره/قطعی شبکه ⇒ همان پاسخ، نه تراکنش دوم
      if (res.status === "PAID" || !res.paymentUrl) {
        router.push(`/appointments/${appointmentId}`);
        return;
      }
      window.location.href = res.paymentUrl;
    } catch (e) {
      setErr(errorMessage(e));
      setLoading(false);
    }
  };

  if (!appt && !err) return <Loading rows={3} />;

  return (
    <div className="page">
      <div className="container mw-sm">
        <h2>پرداخت نوبت</h2>
        <ErrorBox message={err} />

        {appt && (
          <div className="card stack gap-3 mt-4">
            <div className="row between">
              <span className="muted small">پزشک</span>
              <strong>{appt.doctor?.fullName}</strong>
            </div>
            <div className="row between">
              <span className="muted small">زمان</span>
              <strong><DateText value={appt.startsAt} variant="long" /></strong>
            </div>
            <div className="row between">
              <span className="muted small">مبلغ</span>
              <strong className="num text-accent fs-md">
                {formatToman(appt.priceRial)}
              </strong>
            </div>
            <hr className="divider" />
            <p className="muted small m-0">
              با کلیک روی «پرداخت»، به درگاه امن پرداخت منتقل می‌شوید.
              اطلاعات کارت شما هرگز در اختیار نوبت‌یار قرار نمی‌گیرد.
            </p>
            <button
              className="btn btn-primary btn-block"
              disabled={loading}
              onClick={pay}
            >
              {loading ? "در حال انتقال به درگاه…" : `پرداخت ${formatToman(appt.priceRial)}`}
            </button>
            <button
              className="btn btn-ghost btn-sm btn-block"
              onClick={() => history.back()}
            >
              انصراف
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
