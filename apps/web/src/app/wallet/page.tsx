"use client";
import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, EmptyState, FormField } from "@/components/design";
import { RequireAuth } from "@/components/RequireAuth";
import { ErrorBox, Loading } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/lib/auth-context";
import { formatDateTime, formatNumber } from "@/lib/format";
import { errorMessage } from "@/lib/messages";

interface WalletView { balanceRial: string; currency: string }
interface LedgerItem {
  id: string; direction: "DEBIT" | "CREDIT"; amountRial: string; createdAt: string;
  kind: string; description: string | null;
}
interface Payout { id: string; amountRial: string; status: string; requestedAt: string; processedAt: string | null }
interface Policy { id: string; insurer: string; coveragePercent: number; validUntil: string | null; createdAt: string }

function WalletContent() {
  const { api, me } = useAuth();
  const toast = useToast();
  const [wallet, setWallet] = useState<WalletView | null>(null);
  const [items, setItems] = useState<LedgerItem[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [amount, setAmount] = useState("100000");
  const [insurer, setInsurer] = useState("");
  const [coverage, setCoverage] = useState("70");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [w, h] = await Promise.all([
        api.get<WalletView>("/wallet"),
        api.get<{ items: LedgerItem[] }>("/wallet/history"),
      ]);
      setWallet(w); setItems(h.items);
      if (me?.role === "DOCTOR" || me?.role === "ADMIN") setPayouts(await api.get<Payout[]>("/wallet/payouts"));
      if (me?.role === "PATIENT") setPolicies(await api.get<Policy[]>("/wallet/insurance"));
    } catch (e) { setErr(errorMessage(e)); }
  }, [api, me?.role]);
  useEffect(() => { void load(); }, [load]);

  const topup = async () => {
    setBusy(true); setErr(null);
    try {
      await api.post("/wallet/topup", { amountRial: amount, idempotencyKey: crypto.randomUUID() });
      await load(); toast("کیف پول شارژ شد", "ok");
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  };

  const requestPayout = async () => {
    setBusy(true); setErr(null);
    try {
      await api.post("/wallet/payouts", { amountRial: amount });
      await load(); toast("درخواست تسویه ثبت شد", "ok");
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  };

  const addPolicy = async () => {
    setBusy(true); setErr(null);
    try {
      await api.post("/wallet/insurance", { insurer, coveragePercent: Number(coverage) });
      setInsurer(""); await load(); toast("بیمه ثبت شد", "ok");
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="stack">
      <header className="page-head"><div><h1>کیف پول و تسویه</h1><p className="muted">موجودی، تاریخچه تراکنشها و بیمه</p></div></header>
      <Alert tone="info" title="دفتر کل دوطرفه">هر تراکنش با دو قلم متوازن ثبت میشود و موجودی از روی دفتر کل محاسبه میگردد.</Alert>
      {err && <ErrorBox message={err} />}

      <section className="card stack">
        <div className="row between">
          <div><span className="muted small">موجودی</span><h2 className="fs-xl m-0 num">{wallet ? formatNumber(wallet.balanceRial) : "…"} <small className="muted">ریال</small></h2></div>
          <Badge tone="ok">{wallet?.currency ?? "IRR"}</Badge>
        </div>
        <FormField label="مبلغ (ریال)"><input className="input num" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} /></FormField>
        <div className="row gap-2 wrap">
          <button className="btn btn-primary" type="button" disabled={busy || !amount} onClick={() => void topup()}>شارژ کیف پول</button>
          {me?.role === "DOCTOR" && <button className="btn" type="button" disabled={busy || !amount} onClick={() => void requestPayout()}>درخواست تسویه</button>}
        </div>
      </section>

      <section className="card stack">
        <h2 className="fs-lg m-0">تاریخچه تراکنشها</h2>
        {items.length === 0 ? <EmptyState icon="🧾" title="تراکنشی ثبت نشده است" description="پس از نخستین شارژ، تراکنشها اینجا نمایش داده میشوند." /> : (
          <ul className="prop-chosen">
            {items.map((t) => (
              <li key={t.id}>
                <strong>{t.description ?? t.kind}</strong>
                <Badge tone={t.direction === "CREDIT" ? "ok" : "warn"}>{t.direction === "CREDIT" ? "+" : "−"}{formatNumber(t.amountRial)}</Badge>
                <span className="muted small">{formatDateTime(t.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {me?.role === "DOCTOR" && (
        <section className="card stack">
          <h2 className="fs-lg m-0">تسویهها</h2>
          {payouts.length === 0 ? <p className="muted">درخواست تسویهای وجود ندارد.</p> : (
            <ul className="prop-chosen">
              {payouts.map((p) => (
                <li key={p.id}>
                  <strong className="num">{formatNumber(p.amountRial)} ریال</strong>
                  <Badge tone={p.status === "PAID" ? "ok" : p.status === "REJECTED" ? "bad" : "info"}>{p.status}</Badge>
                  <span className="muted small">{formatDateTime(p.requestedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {me?.role === "PATIENT" && (
        <section className="card stack">
          <h2 className="fs-lg m-0">بیمه من</h2>
          <div className="row gap-2 wrap">
            <FormField label="بیمهگر"><input className="input" value={insurer} onChange={(e) => setInsurer(e.target.value)} placeholder="مثلاً بیمه سلامت" /></FormField>
            <FormField label="درصد پوشش"><input className="input num" inputMode="numeric" value={coverage} onChange={(e) => setCoverage(e.target.value.replace(/\D/g, ""))} /></FormField>
            <button className="btn btn-primary" type="button" disabled={busy || !insurer} onClick={() => void addPolicy()}>افزودن بیمه</button>
          </div>
          {policies.length === 0 ? <p className="muted">بیمهای ثبت نشده است.</p> : (
            <ul className="prop-chosen">
              {policies.map((p) => (
                <li key={p.id}><strong>{p.insurer}</strong><Badge tone="info">{p.coveragePercent}٪ پوشش</Badge><span className="muted small">{p.validUntil ? formatDateTime(p.validUntil) : "بدون تاریخ انقضا"}</span></li>
              ))}
            </ul>
          )}
        </section>
      )}
      {wallet === null && !err && <Loading />}
    </div>
  );
}

export default function WalletPage() {
  return <RequireAuth><WalletContent /></RequireAuth>;
}
