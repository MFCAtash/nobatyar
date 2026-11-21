"use client";
import { useMemo, useState } from "react";
import { AppointmentList } from "@/components/AppointmentList";
import { RequireAuth } from "@/components/RequireAuth";

export default function MyAppointmentsPage() {
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  // «الان» هنگام تغییر تب ثابت می‌شود تا کوئری بی‌دلیل عوض نشود
  const query = useMemo(() => `${tab === "upcoming" ? "from" : "to"}=${encodeURIComponent(new Date().toISOString())}`, [tab]);
  return (
    <RequireAuth roles={["PATIENT"]}>
      <h1>نوبت‌های من</h1>
      <div className="tabs" role="tablist">
        <button role="tab" className="tab" aria-selected={tab === "upcoming"} onClick={() => setTab("upcoming")}>پیش‌رو</button>
        <button role="tab" className="tab" aria-selected={tab === "past"} onClick={() => setTab("past")}>گذشته</button>
      </div>
      <AppointmentList query={query} counterpart="doctor" />
    </RequireAuth>
  );
}
