"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import type { HealthProfile } from "@/lib/types";

/** وضعیت پروفایل سلامت بیمار برای پزشک: «ثبت نشده / بارگذاری نشد / بدون حساسیت ثبت‌شده / فهرست». همیشه یکی از این‌ها نمایش داده می‌شود. */
export function AllergyBanner({ appointmentId, showLists = true }: { appointmentId: string; showLists?: boolean }) {
  const { api } = useAuth();
  const [state, setState] = useState<{ kind: "loading" } | { kind: "failed" } | { kind: "ok"; hp: HealthProfile }>({ kind: "loading" });

  useEffect(() => {
    api.get<HealthProfile>(`/appointments/${appointmentId}/health-profile`)
      .then((hp) => setState({ kind: "ok", hp }))
      .catch(() => setState({ kind: "failed" }));
  }, [api, appointmentId]);

  if (state.kind === "loading") return null;
  if (state.kind === "failed")
    return <div className="note-box" role="alert"><strong>پروفایل سلامت بارگذاری نشد.</strong> حساسیت‌های بیمار نامشخص است؛ از خود بیمار بپرسید.</div>;

  const hp = state.hp;
  if (hp.exists === false)
    return <div className="note-box" role="alert"><strong>بیمار پروفایل سلامت ثبت نکرده است.</strong> حساسیت‌ها نامشخص است — این به معنای «بدون حساسیت» نیست؛ از بیمار بپرسید.</div>;

  const none = hp.allergies.length === 0 && hp.chronicConditions.length === 0 && hp.medications.length === 0;
  return (
    <div className="note-box">
      {hp.allergies.length === 0 ? <div><strong>حساسیت‌ها:</strong> حساسیتی ثبت نشده (طبق اظهار بیمار)</div> : <div><strong>حساسیت‌ها:</strong> {hp.allergies.join("، ")}</div>}
      {showLists && hp.chronicConditions.length > 0 && <div><strong>بیماری‌های زمینه‌ای:</strong> {hp.chronicConditions.join("، ")}</div>}
      {showLists && hp.medications.length > 0 && <div><strong>داروهای فعلی:</strong> {hp.medications.join("، ")}</div>}
      {showLists && none && <div className="muted small">بیماری زمینه‌ای و داروی مصرفی هم ثبت نشده است.</div>}
    </div>
  );
}
