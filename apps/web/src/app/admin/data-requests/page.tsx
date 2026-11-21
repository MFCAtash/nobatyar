"use client";
import { useCallback, useEffect, useState } from "react";
import { Alert, Badge } from "@/components/design";
import { RequireAuth } from "@/components/RequireAuth";
import { useToast } from "@/components/Toast";
import { ErrorBox, Loading } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { formatDateTime } from "@/lib/format";
import { errorMessage } from "@/lib/messages";

interface Review { adminId: string; decision: string; createdAt: string }
interface Item {
  id: string; userId: string; type: "EXPORT" | "DELETE"; status: string; note: string | null;
  requestedAt: string; executeAt: string | null; completedAt: string | null; reviews: Review[];
}

/** A6: صف انطباق — دو ادمین مستقل رأی میدهند؛job پس از ۳۰ روز اجرا میکند. */
function Queue() {
  const { api } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<Item[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setItems(await api.get<Item[]>("/admin/data-requests")); }
    catch (e) { setErr(errorMessage(e)); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);

  const vote = async (id: string, decision: "APPROVE" | "REJECT") => {
    setBusy(id + decision); setErr(null);
    try {
      await api.post(`/admin/data-requests/${id}/review`, { decision });
      toast(decision === "APPROVE" ? "رأی تأیید ثبت شد" : "درخواست رد شد", "ok");
      await load();
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(null); }
  };

  return (
    <div className="stack">
      <header className="page-head"><div><h1>درخواستهای حریم خصوصی</h1><p className="muted">تأیید دو نفرهٔ خروجی/حذف داده — اجرا پس از ۳۰ روز</p></div></header>
      <Alert tone="warn" title="مسئولیت حساس">هر رأی در زنجیره ممیزی ثبت میشود. تنها دو ادمین مستقل میتوانند اجرا را فعال کنند.</Alert>
      <ErrorBox message={err} />
      {!items ? <Loading /> : items.length === 0 ? <p className="muted">درخواستی در صف نیست.</p> : (
        <div className="stack gap-2">
          {items.map((it) => {
            const ok = it.reviews.filter((r) => r.decision === "APPROVE").length;
            return (
              <article key={it.id} className="card stack">
                <div className="row between">
                  <div><strong>{it.type === "EXPORT" ? "خروجی کامل" : "حذف داده"}</strong><span className="muted small"> — {formatDateTime(it.requestedAt)}</span></div>
                  <Badge tone={it.status === "COMPLETED" ? "ok" : it.status === "IN_PROGRESS" ? "warn" : "info"}>{it.status}</Badge>
                </div>
                <p className="muted small">تأییدها: {ok} / 2{it.executeAt ? ` — اجرا: ${formatDateTime(it.executeAt)}` : ""}</p>
                {it.status === "PENDING" && (
                  <div className="row gap-2 wrap">
                    <button className="btn btn-primary" disabled={busy !== null} type="button" onClick={() => void vote(it.id, "APPROVE")}>تأیید من</button>
                    <button className="btn ghost" disabled={busy !== null} type="button" onClick={() => void vote(it.id, "REJECT")}>رد درخواست</button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function DataRequestsPage() {
  return <RequireAuth roles={["ADMIN"]}><Queue /></RequireAuth>;
}
