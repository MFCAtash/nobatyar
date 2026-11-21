"use client";
import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { errorMessage } from "@/lib/messages";
import { safeNext } from "@/lib/format";
import { normalizeMfaInput } from "./mfa-input";
import { MfaChallengeView } from "./MfaChallengeView";

export function MfaChallengeContainer() {
  const { completeMfa, cancelMfa } = useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"), "/");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = normalizeMfaInput(code);
    if (!parsed) { setError("کد باید ۶ رقم یا کد پشتیبان ۱۲ کاراکتری باشد."); return; }
    setBusy(true); setError(null);
    try {
      await completeMfa(parsed.value);
      router.replace(next);
    } catch (e2) {
      setError(errorMessage(e2));
      setCode("");
    } finally { setBusy(false); }
  }

  return (
    <MfaChallengeView
      code={code} busy={busy} error={error}
      onCode={(v) => { setCode(v); setError(null); }}
      onSubmit={(e) => void onSubmit(e)}
      onCancel={() => void cancelMfa().then(() => router.replace("/login"))}
    />
  );
}
