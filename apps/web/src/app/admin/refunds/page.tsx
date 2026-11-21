"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RequireAuth } from "@/components/RequireAuth";
import { useToast } from "@/components/Toast";
import { ErrorBox, Loading, Modal } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { formatDateTime, formatToman, formatNumber } from "@/lib/format";
import { refundActions } from "@/lib/refund-actions";
import { createTypedApi } from "@/lib/typed-api";
import { useIntentKeys } from "@/lib/use-intent-keys";
import { errorMessage } from "@/lib/messages";
import type { FinanceSummary, RefundItem } from "@/lib/types";

const STATUS: Record<RefundItem["status"], { text: string; tone: string; hint: string }> = {
  PENDING: { text: "در انتظار اجرا", tone: "warn", hint: "بدهی به بیمار؛ هنوز به درگاه ارسال نشده." },
  PROCESSING: { text: "در حال ارسال", tone: "info", hint: "درخواست در حال ارسال به درگاه است." },
  PROCESSED: { text: "انجام شد", tone: "ok", hint: "نزد درگاه ثبت یا دستی تأیید شده (نهایی)." },
  FAILED: { text: "رد شد", tone: "bad", hint: "درگاه رد کرد؛ پولی جابه‌جا نشده. می‌توانید دوباره اجرا کنید." },
  MANUAL: { text: "نیازمند اقدام دستی", tone: "warn", hint: "درگاه API استرداد ندارد/تنظیم نشده. از پنل درگاه انجام دهید و مرجع را ثبت کنید." },
  REVIEW: { text: "نیازمند بررسی", tone: "bad", hint: "پاسخ درگاه مبهم بود؛ ممکن است ثبت شده باشد. ابتدا در پنل درگاه بررسی کنید؛ اجرای مجدد خودکار ممنوع است." },
};
const REASON: Record<string, string> = {
  DUPLICATE_PAYMENT: "پرداخت تکراری", PAID_AFTER_EXPIRY: "پرداخت پس از انقضای نوبت",
  CANCELLED_BY_PATIENT: "لغو توسط بیمار", CANCELLED_BY_DOCTOR: "لغو توسط پزشک", NO_SHOW_DOCTOR: "غیبت پزشک",
};
const FILTERS: (RefundItem["status"] | "ALL")[] = ["ALL", "PENDING", "MANUAL", "REVIEW", "FAILED", "PROCESSED"];

function Refunds() {
  const { api, me } = useAuth();
  const toast = useToast();
  const keys = useIntentKeys();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("PENDING");
  const [items, setItems] = useState<RefundItem[] | null>(null);
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [marking, setMarking] = useState<{ item: RefundItem; mode: "processed" | "not-refunded" | "request-mark" } | null>(null);
  const [rejecting, setRejecting] = useState<RefundItem | null>(null);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      const q = filter === "ALL" ? "" : `?status=${filter}`;
      const [list, sum] = await Promise.all([api.get<RefundItem[]>(`/admin/refunds${q}`), api.get<FinanceSummary>("/admin/finance/summary")]);
      setItems(list); setSummary(sum); setErr(null);
    } catch (e) { setErr(errorMessage(e)); }
  }, [api, filter]);
  useEffect(() => { setItems(null); void load(); }, [load]);

  /** client ی تایپ‌شده از OpenAPI: مسیر/بدنه/پاسخ در کامپایل بررسی می‌شود و endpoint ی مالی بدون idempotencyKey کامپایل نمی‌شود. */
  const typed = useMemo(() => createTypedApi(api), [api]);

  async function requestApproval(r: RefundItem, action: "EXECUTE" | "MARK_PROCESSED", reference?: string, noteText?: string) {
    setBusy(r.id); setErr(null);
    try {
      const intent = `req:${r.id}:${action}`;
      await typed.call("POST /admin/refunds/{id}/request-approval", { params: { id: r.id }, body: { action, ...(reference ? { reference } : {}), ...(noteText ? { note: noteText } : {}) }, idempotencyKey: keys.get(intent) });
      keys.done(intent);
      toast("درخواست تأیید ثبت شد؛ ادمین دیگری باید تأیید کند.", "ok");
      await load();
    } catch (e) { setErr(errorMessage(e)); await load(); } finally { setBusy(null); }
  }

  async function decide(r: RefundItem, approve: boolean, noteText?: string) {
    setBusy(r.id); setErr(null);
    try {
      const intent = `dec:${r.id}:${approve ? "ok" : "no"}`;
      if (approve) await typed.call("POST /admin/refunds/{id}/approval/approve", { params: { id: r.id }, body: noteText ? { note: noteText } : {}, idempotencyKey: keys.get(intent) });
      else await typed.call("POST /admin/refunds/{id}/approval/reject", { params: { id: r.id }, body: { note: noteText ?? "" }, idempotencyKey: keys.get(intent) });
      keys.done(intent);
      toast(approve ? "تأیید شد." : "رد شد.", approve ? "ok" : "info");
      setRejecting(null); setNote(""); await load();
    } catch (e) { setErr(errorMessage(e)); await load(); } finally { setBusy(null); }
  }

  async function execute(r: RefundItem) {
    if (!window.confirm(`استرداد ${formatToman(r.amountRial)} به درگاه ارسال شود؟ این اقدام قابل بازگشت نیست.`)) return;
    setBusy(r.id); setErr(null);
    try {
      const res = (await typed.call("POST /admin/refunds/{id}/execute", { params: { id: r.id }, idempotencyKey: keys.get(`exec:${r.id}`) })) as unknown as RefundItem;
      keys.done(`exec:${r.id}`);
      toast(STATUS[res.status].text, res.status === "PROCESSED" ? "ok" : "info");
      await load();
    } catch (e) { setErr(errorMessage(e)); await load(); } finally { setBusy(null); }
  }

  async function submitMark() {
    if (!marking) return;
    setBusy(marking.item.id); setErr(null);
    try {
      const id = marking.item.id;
      if (marking.mode === "request-mark") { await requestApproval(marking.item, "MARK_PROCESSED", reference, note || undefined); setMarking(null); setReference(""); setNote(""); return; }
      if (marking.mode === "processed") {
        const intent = `mark:${id}:${reference}`;
        await typed.call("POST /admin/refunds/{id}/mark-processed", { params: { id }, body: { reference, ...(note ? { note } : {}) }, idempotencyKey: keys.get(intent) });
        keys.done(intent);
      } else {
        await typed.call("POST /admin/refunds/{id}/mark-not-refunded", { params: { id }, body: { note }, idempotencyKey: keys.get(`notref:${id}`) });
        keys.done(`notref:${id}`);
      }
      toast("ثبت شد.", "ok");
      setMarking(null); setReference(""); setNote(""); await load();
    } catch (e) { setErr(errorMessage(e)); } finally { setBusy(null); }
  }

  const count = (s: string) => summary?.refunds[s]?.count ?? 0;
  return (
    <div className="stack">
      <div className="row between">
        <h1 className="m-0">استرداد وجه</h1>
        <Link href="/admin/payments" className="btn btn-ghost btn-sm">پرداخت‌ها</Link>
      </div>
      {summary && (
        <div className="card row gap-5 flex-wrap">
          <span>در انتظار اجرا: <b className="num">{formatNumber(count("PENDING"))}</b></span>
          <span>اقدام دستی: <b className="num">{formatNumber(count("MANUAL"))}</b></span>
          <span className={count("REVIEW") ? "text-danger" : undefined}>نیازمند بررسی: <b className="num">{formatNumber(count("REVIEW"))}</b></span>
          <span>رد شده: <b className="num">{formatNumber(count("FAILED"))}</b></span>
        </div>
      )}
      <div className="chips" role="group" aria-label="فیلتر وضعیت">
        {FILTERS.map((f) => (
          <button key={f} className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === "ALL" ? "همه" : STATUS[f].text}</button>
        ))}
      </div>
      <ErrorBox message={err} />
      {!items ? <Loading /> : items.length === 0 ? <div className="empty">موردی نیست.</div> : items.map((r) => (
        <div key={r.id} className="card stack gap-2">
          <div className="row between">
            <div>
              <b>{formatToman(r.amountRial)}</b>
              <span className="muted small"> · {REASON[r.reason ?? ""] ?? r.reason ?? "—"} · {r.patientName ?? "—"}</span>
            </div>
            <span className={`badge badge-${STATUS[r.status].tone}`}>{STATUS[r.status].text}</span>
          </div>
          <div className="muted small">{STATUS[r.status].hint}</div>
          <div className="muted small">
            ثبت: {formatDateTime(r.createdAt)} · درگاه: {r.gateway ?? "—"} · تلاش: <span className="num">{r.tryCount}</span>
            {r.lastErrorCode ? <> · کد: <span className="ltr">{r.lastErrorCode}</span></> : null}
            {r.externalRef ? <> · مرجع: <span className="ltr">{r.externalRef}</span></> : null}
          </div>
          <ApprovalLine r={r} meId={me?.id} />
          <div className="row gap-2 flex-wrap">
            <Link href={`/appointments/${r.appointmentId}`} className="btn btn-ghost btn-sm">نوبت</Link>
            {(() => {
              const act = refundActions(r, me?.id);
              const off = busy === r.id;
              return (
                <>
                  {act.canRequestExecute && <button className="btn btn-primary btn-sm" disabled={off} onClick={() => void requestApproval(r, "EXECUTE")}>درخواست تأیید اجرا</button>}
                  {act.canRequestMark && <button className="btn btn-ghost btn-sm" disabled={off} onClick={() => setMarking({ item: r, mode: "request-mark" })}>درخواست تأیید ثبت دستی</button>}
                  {act.canDecide && <>
                    <button className="btn btn-primary btn-sm" disabled={off} onClick={() => void decide(r, true)}>تأیید</button>
                    <button className="btn btn-danger btn-sm" disabled={off} onClick={() => { setNote(""); setRejecting(r); }}>رد</button>
                  </>}
                  {act.canExecute && <button className="btn btn-primary btn-sm" disabled={off} onClick={() => void execute(r)}>اجرای استرداد</button>}
                  {act.canMarkProcessed && <button className="btn btn-ghost btn-sm" disabled={off} onClick={() => { setReference(r.approval.reference ?? ""); setMarking({ item: r, mode: "processed" }); }}>ثبت انجام دستی</button>}
                  {r.status === "REVIEW" && <button className="btn btn-danger btn-sm" disabled={off} onClick={() => setMarking({ item: r, mode: "not-refunded" })}>بررسی شد؛ استرداد نشده</button>}
                </>
              );
            })()}
          </div>
        </div>
      ))}
      {marking && (
        <Modal title={marking.mode === "processed" ? "ثبت انجام دستی استرداد" : marking.mode === "request-mark" ? "درخواست تأیید ثبت دستی" : "تأیید: استرداد انجام نشده"} onClose={() => setMarking(null)}>
          {(marking.mode === "processed" || marking.mode === "request-mark") && (
            <div className="field"><label className="label" htmlFor="ref">مرجع (شماره پیگیری بانک/درگاه)</label>
              <input id="ref" className="input ltr" maxLength={100} value={reference} readOnly={marking.mode === "processed" && marking.item.approval.required} aria-describedby="ref-h" onChange={(e) => setReference(e.target.value)} />
              {marking.item.approval.required && <span id="ref-h" className="help">{marking.mode === "request-mark" ? "Checker دقیقاً همین مرجع را تأیید می‌کند." : "فقط همان مرجعِ تأییدشده قابل ثبت است."}</span>}</div>
          )}
          <div className="field"><label className="label" htmlFor="note">{marking.mode === "not-refunded" ? "توضیح بررسی (الزامی)" : "توضیح (اختیاری)"}</label>
            <textarea id="note" className="textarea" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <div className="row mt-3">
            <button className="btn btn-primary" disabled={busy !== null || (marking.mode === "not-refunded" ? note.trim().length < 5 : reference.trim().length < 3)} onClick={() => void submitMark()}>ثبت</button>
            <button className="btn btn-ghost" onClick={() => setMarking(null)}>انصراف</button>
          </div>
        </Modal>
      )}
      {rejecting && (
        <Modal title="رد درخواست تأیید" onClose={() => setRejecting(null)}>
          <div className="field"><label className="label" htmlFor="rn">دلیل رد (الزامی)</label>
            <textarea id="rn" className="textarea" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <div className="row mt-3">
            <button className="btn btn-danger" disabled={busy !== null || note.trim().length < 3} onClick={() => void decide(rejecting, false, note.trim())}>رد درخواست</button>
            <button className="btn btn-ghost" onClick={() => setRejecting(null)}>انصراف</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

const APPROVAL_TEXT = {
  checker: "درخواست شما ثبت شد؛ منتظر تأیید ادمین دیگر.",
  "you-are-checker": "درخواست تأیید اقدام از ادمین دیگری رسیده است؛ شما می‌توانید تأیید یا رد کنید.",
  "approved-execute": "تأیید شد؛ اجرا آزاد است (تأیید یک‌بارمصرف است).",
  "approved-mark": "تأیید شد؛ ثبت دستی با همان مرجع آزاد است.",
  rejected: "درخواست قبلی رد شد؛ می‌توانید دوباره درخواست دهید.",
} as const;

function ApprovalLine({ r, meId }: { r: RefundItem; meId: string | undefined }) {
  const w = refundActions(r, meId).waiting;
  if (!r.approval.required) return null;
  return (
    <div className="note-box small" role="status">
      <b>تأیید دو نفره:</b> {w ? APPROVAL_TEXT[w] : "برای اجرا ابتدا باید ادمین دیگری تأیید کند."}
      {r.approval.checkerNote && w === "rejected" ? <> دلیل: {r.approval.checkerNote}</> : null}
      {r.approval.reference ? <> · مرجع: <span className="ltr">{r.approval.reference}</span></> : null}
    </div>
  );
}

export default function RefundsPage() {
  return <RequireAuth roles={["ADMIN"]}><Refunds /></RequireAuth>;
}
