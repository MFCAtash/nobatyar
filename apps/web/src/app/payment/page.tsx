"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ErrorBox, Loading } from "@/components/ui";
import { InitiateView } from "@/components/payment/InitiateView";
import { VerifyView } from "@/components/payment/VerifyView";

// ─── صفحه اصلی پرداخت ─────────────────────────────────────────────────────
function PaymentPageInner() {
  const params        = useSearchParams();
  const appointmentId = params.get("appointmentId") ?? "";
  const step          = params.get("step");
  // /payment/callback پارامتر هر درگاه را به «authority» یکدست می‌کند
  const authority     = params.get("authority") ?? params.get("Authority") ?? "";

  if (!appointmentId) {
    return (
      <div className="page">
        <div className="container">
          <ErrorBox message="شناسه نوبت یافت نشد" />
        </div>
      </div>
    );
  }

  if (step === "verify") {
    return (
      <VerifyView appointmentId={appointmentId} authority={authority} />
    );
  }

  return <InitiateView appointmentId={appointmentId} />;
}

export default function PaymentPage() {
  return (
    <Suspense fallback={<Loading rows={3} />}>
      <PaymentPageInner />
    </Suspense>
  );
}
