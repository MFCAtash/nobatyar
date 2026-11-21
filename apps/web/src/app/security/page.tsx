"use client";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, EmptyState } from "@/components/design";
import { ErrorBox, Loading } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/lib/auth-context";
import { errorMessage } from "@/lib/messages";
import { formatDateTime } from "@/lib/format";

interface Credential {
  id: string;
  deviceType: string | null;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

function PasskeyLogin() {
  const { api, refreshMe } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const login = async () => {
    setBusy(true); setErr(null);
    try {
      const options = await api.post<Record<string, unknown>>("/auth/passkey/login/options");
      const response = await startAuthentication(options as never);
      const tokens = await api.post<{ accessToken: string }>("/auth/passkey/login/verify", response, { auth: false });
      api.setToken(tokens.accessToken);
      await refreshMe();
      toast("با موفقیت وارد شدید", "ok");
    } catch (e) {
      setErr(errorMessage(e));
    } finally { setBusy(false); }
  };

  return (
    <div className="card stack">
      <h2 className="fs-lg m-0">ورود با Passkey</h2>
      <p className="muted">بدون رمز و بدون نیاز به شماره تلفن — با اثر انگشت، چهره یا کلید امنیتی دستگاه.</p>
      {err && <ErrorBox message={err} />}
      <button className="btn btn-primary self-start" type="button" disabled={busy} onClick={() => void login()}>
        {busy ? "در حال تأیید…" : "🔐 ورود با Passkey"}
      </button>
    </div>
  );
}

function PasskeyManager() {
  const { api } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setItems(await api.get<Credential[]>("/auth/passkey/credentials")); }
    catch (e) { setErr(errorMessage(e)); }
    finally { setLoading(false); }
  }, [api]);
  useEffect(() => { void load(); }, [load]);

  const register = async () => {
    setBusy(true); setErr(null);
    try {
      const options = await api.post<Record<string, unknown>>("/auth/passkey/register/options");
      const response = await startRegistration(options as never);
      await api.post("/auth/passkey/register/verify", response);
      await load();
      toast("Passkey با موفقیت ثبت شد", "ok");
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    try {
      await api.delete(`/auth/passkey/credentials/${id}`);
      await load();
      toast("اعتبارنامه حذف شد", "ok");
    } catch (e) { setErr(errorMessage(e)); }
  };

  return (
    <div className="stack">
      <section className="card stack">
        <div className="row between">
          <h2 className="fs-lg m-0">اعتبارنامههای من</h2>
          <button className="btn btn-primary btn-sm" type="button" disabled={busy} onClick={() => void register()}>
            {busy ? "در حال ثبت…" : "+ افزودن Passkey"}
          </button>
        </div>
        <Alert tone="info" title="نکته امنیتی">یک Passkey روی دستگاه شما ذخیره میشود و کلید عمومی آن نزد ما نگهداری میشود. حذف آن یعنی از بین رفتن ورود با آن دستگاه.</Alert>
        {err && <ErrorBox message={err} />}
        {loading ? <Loading /> : items.length === 0 ? (
          <EmptyState icon="🔑" title="هنوز Passkeyای ثبت نکردهاید" description="برای ورود سریع و ایمن، یک کلید امنیتی بسازید." />
        ) : (
          <ul className="prop-chosen">
            {items.map((c) => (
              <li key={c.id}>
                <strong>{c.deviceType === "singleDevice" ? "کلید روی این دستگاه" : "Passkey ابری"}</strong>
                {c.backedUp && <Badge tone="ok">پشتیبانگیری شده</Badge>}
                <span className="muted small">ثبت: {formatDateTime(c.createdAt)}</span>
                {c.lastUsedAt && <span className="muted small">آخرین استفاده: {formatDateTime(c.lastUsedAt)}</span>}
                <button className="btn btn-sm ghost" type="button" onClick={() => void remove(c.id)}>حذف</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SecurityContent() {
  const { status } = useAuth();
  return (
    <div className="stack">
      <header className="page-head"><div><h1>امنیت حساب</h1><p className="muted">مدیریت روشهای ورود و کلیدهای امنیتی</p></div></header>
      {status === "authed" ? <PasskeyManager /> : <PasskeyLogin />}
    </div>
  );
}

export default function SecurityPage() {
  return <SecurityContent />;
}
