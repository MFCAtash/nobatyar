"use client";
import { useCallback, useEffect, useState } from "react";
import { PrescriptionCard } from "@/components/PrescriptionCard";
import { RequireAuth } from "@/components/RequireAuth";
import { ErrorBox, Loading } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { errorMessage } from "@/lib/messages";
import type { Prescription } from "@/lib/types";

function List() {
  const { api, me } = useAuth();
  const [rows, setRows] = useState<Prescription[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => api.get<Prescription[]>("/prescriptions").then(setRows).catch((e) => setErr(errorMessage(e))), [api]);
  useEffect(() => { void load(); }, [load]);
  if (!rows) return err ? <ErrorBox message={err} /> : <Loading />;
  return (
    <div className="stack mw-2xl mx-auto">
      <h1 className="fs-xl">{me?.role === "DOCTOR" ? "نسخه‌های صادرشده" : "نسخه‌های من"}</h1>
      {rows.length === 0 ? <div className="empty">نسخه‌ای وجود ندارد.</div> : rows.map((p) => <PrescriptionCard key={p.id} p={p} canCancel={me?.role === "DOCTOR"} onChanged={() => void load()} />)}
    </div>
  );
}
export default function PrescriptionsPage() { return <RequireAuth roles={["PATIENT", "DOCTOR"]}><List /></RequireAuth>; }
