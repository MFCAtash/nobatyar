"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/design";
import { ErrorBox, Loading } from "@/components/ui";
import { ModuleGate } from "@/components/system/ModuleGate";
import { useAuth } from "@/lib/auth-context";
import { errorMessage } from "@/lib/messages";

interface QuickReply {
  id: string;
  textFa: string;
}
interface Summary {
  bullets: string[];
  redactions: number;
  generatedAt: string;
}

function AssistContent() {
  const { api, me } = useAuth();
  const [replies, setReplies] = useState<QuickReply[] | null>(null);
  const [text, setText] = useState("");
  const [convId, setConvId] = useState("");
  const [consentId, setConsentId] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (me?.role !== "DOCTOR") {
      setReplies([]);
      return;
    }
    try {
      setReplies(await api.get<QuickReply[]>("/me/quick-replies"));
    } catch (e) {
      setErr(errorMessage(e));
    }
  }, [api, me?.role]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    setErr(null);
    setNotice(null);
    try {
      await api.post("/me/quick-replies", { text });
      setText("");
      setNotice("پاسخ سریع اضافه شد.");
      await load();
    } catch (e) {
      setErr(errorMessage(e));
    }
  };

  const remove = async (id: string) => {
    setErr(null);
    try {
      await api.delete(`/me/quick-replies/${id}`);
      await load();
    } catch (e) {
      setErr(errorMessage(e));
    }
  };

  const summarize = async () => {
    setErr(null);
    setNotice(null);
    try {
      setSummary(await api.post<Summary>(`/conversations/${convId}/summarize`, { consentId }));
      setNotice("خلاصهٔ استخراجی ایجاد شد (بدون ادعای تشخیصی).");
    } catch (e) {
      setErr(errorMessage(e));
    }
  };

  if (!replies) return err ? <ErrorBox message={err} /> : <Loading />;

  return (
    <div className="stack">
      {err && <ErrorBox message={err} />}
      {notice && <div className="card">{notice}</div>}

      {me?.role === "DOCTOR" && (
        <section className="card stack">
          <h2 className="fs-lg m-0">پاسخ‌های سریع</h2>
          <div className="row gap-2">
            <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="پاسخ پرتکرار (فارسی)" aria-label="پاسخ سریع" />
            <button className="btn btn-primary" type="button" disabled={text.trim().length < 2} onClick={() => void add()}>افزودن</button>
          </div>
          {replies.length === 0 ? (
            <EmptyState title="پاسخ سریعی وجود ندارد" />
          ) : (
            <ul className="prop-chosen">
              {replies.map((r) => (
                <li key={r.id}>
                  <span>{r.textFa}</span>
                  <button className="btn btn-sm ghost" type="button" onClick={() => void remove(r.id)}>حذف</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="card stack">
        <h2 className="fs-lg m-0">خلاصهٔ مکالمه</h2>
        <p className="muted small m-0">خلاصه تنها با رضایت معتبر بیمار ساخته می‌شود و شناسه‌های حساس را حذف می‌کند.</p>
        <div className="row gap-2 wrap">
          <input className="input" value={convId} onChange={(e) => setConvId(e.target.value)} placeholder="شناسهٔ مکالمه (UUID)" aria-label="شناسهٔ مکالمه" />
          <input className="input" value={consentId} onChange={(e) => setConsentId(e.target.value)} placeholder="شناسهٔ رضایت (UUID)" aria-label="شناسهٔ رضایت" />
          <button className="btn btn-primary" type="button" disabled={!convId || !consentId} onClick={() => void summarize()}>ساخت خلاصه</button>
        </div>
        {summary && (
          <ul className="prop-chosen">
            {summary.bullets.map((b, i) => <li key={`${i}-${b}`}>{b}</li>)}
          </ul>
        )}
        {summary && <p className="muted small m-0">identifiers حذف‌شده: {summary.redactions}</p>}
      </section>
    </div>
  );
}

export default function ChatAssistPage() {
  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <h1>دستیار چت</h1>
          <p className="muted">پاسخ‌های سریع و خلاصهٔ توضیحپذیر مکالمه</p>
        </div>
      </header>
      <ModuleGate flag="FF_M7_CHAT_ASSIST">
        <AssistContent />
      </ModuleGate>
    </div>
  );
}
