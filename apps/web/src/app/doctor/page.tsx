"use client";
import { useMemo, useState } from "react";
import { AppointmentList } from "@/components/AppointmentList";
import { ConsentPanel } from "@/components/ConsentPanel";
import { ReorderableCards } from "@/components/ReorderableCards";
import { RequireAuth } from "@/components/RequireAuth";

type Tab = "pending" | "upcoming" | "past";

export default function DoctorDashboardPage() {
  const [tab, setTab] = useState<Tab>("pending");
  const query = useMemo(() => {
    const now = Date.now();
    if (tab === "pending") return "status=PENDING_CONFIRMATION";
    // ۲ ساعت عقب‌تر تا نوبتِ در حال برگزاری هم دیده شود
    if (tab === "upcoming") return `from=${encodeURIComponent(new Date(now - 2 * 3_600_000).toISOString())}`;
    return `to=${encodeURIComponent(new Date(now - 2 * 3_600_000).toISOString())}`;
  }, [tab]);

  return (
    <RequireAuth roles={["DOCTOR"]}>
      <h1>پنل پزشک</h1>
      <ReorderableCards />
      <div className="tabs" role="tablist">
        <button role="tab" className="tab" aria-selected={tab === "pending"} onClick={() => setTab("pending")}>در انتظار تأیید</button>
        <button role="tab" className="tab" aria-selected={tab === "upcoming"} onClick={() => setTab("upcoming")}>پیش‌رو</button>
        <button role="tab" className="tab" aria-selected={tab === "past"} onClick={() => setTab("past")}>گذشته</button>
      </div>
      <AppointmentList key={tab} query={query} counterpart="patient" quickActions />
      <ConsentPanel />
    </RequireAuth>
  );
}
