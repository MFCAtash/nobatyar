"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ConsentDialog } from "@/components/ConsentDialog";
import { SkeletonList } from "@/components/kit";
import { useToast } from "@/components/Toast";
import { ErrorBox } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { clearDraft, loadDraft, saveDraft, sessionDraftStorage } from "@/lib/draft";
import { nextTehranDays } from "@/lib/format";
import { errorMessage } from "@/lib/messages";
import { useApiMutation, useApiQuery } from "@/lib/query/hooks";
import { qk, qkRoot } from "@/lib/query/keys";
import type { AppointmentDetail, AppointmentKind, DoctorCard, SlotsResponse } from "@/lib/types";
import { BookingView } from "./BookingView";
import { DoctorProfileView } from "./DoctorProfileView";

const DAYS_AHEAD = 7;
interface Draft { day: string; slot: string | null; kind: AppointmentKind; reason: string; step: 0 | 1 | 2 }

export function DoctorBookingContainer({ doctorId }: { doctorId: string }) {
  const { status, me } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const days = useMemo(() => nextTehranDays(DAYS_AHEAD), []);
  const draftKey = `book:${doctorId}`;

  const [day, setDay] = useState(days[0]);
  const [slot, setSlot] = useState<string | null>(null);
  const [kind, setKind] = useState<AppointmentKind>("VIDEO");
  const [reason, setReason] = useState("");
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [err, setErr] = useState<string | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [restored, setRestored] = useState(false);
  const wantedSlot = useRef<{ slot: string; step: 0 | 1 | 2 } | null>(null);
  const hydrated = useRef(false);

  const doctor = useApiQuery<DoctorCard>(qk.doctor(doctorId), `/doctors/${doctorId}`);
  const slots = useApiQuery<SlotsResponse>(qk.slots(doctorId, day), `/doctors/${doctorId}/slots?from=${day}&to=${day}`, { staleTime: 0 });

  // ── بازیابی پیش‌نویس (یک‌بار) ──
  useEffect(() => {
    const d = loadDraft<Draft>(sessionDraftStorage(), draftKey);
    hydrated.current = true;
    if (!d) return;
    if (days.includes(d.day)) setDay(d.day);
    setKind(d.kind); setReason(d.reason ?? "");
    if (d.slot) wantedSlot.current = { slot: d.slot, step: d.step };
    setRestored(Boolean(d.reason || d.slot));
  }, [draftKey, days]);

  // ساعت پیش‌نویس فقط اگر هنوز خالی است برگردانده می‌شود؛ وگرنه کاربر باخبر می‌شود
  useEffect(() => {
    const w = wantedSlot.current;
    if (!w || !slots.data) return;
    wantedSlot.current = null;
    if (slots.data.slots.some((s) => s.startsAt === w.slot)) { setSlot(w.slot); setStep(w.step); }
    else toast("ساعتی که قبلاً انتخاب کرده بودید دیگر خالی نیست.", "info");
  }, [slots.data, toast]);

  // ── ذخیره‌ی خودکار پیش‌نویس (debounce) ──
  useEffect(() => {
    if (!hydrated.current) return;
    const t = setTimeout(() => {
      if (!slot && !reason.trim()) clearDraft(sessionDraftStorage(), draftKey);
      else saveDraft<Draft>(sessionDraftStorage(), draftKey, { day, slot, kind, reason, step });
    }, 400);
    return () => clearTimeout(t);
  }, [day, slot, kind, reason, step, draftKey]);

  const book = useApiMutation<{ slot: string }, AppointmentDetail>({
    run: (v, api) => api.post<AppointmentDetail>("/appointments", { doctorId, startsAt: v.slot, kind, ...(reason.trim() ? { reason: reason.trim() } : {}) }),
    invalidate: [[...qkRoot.appointments], [...qkRoot.slots]],
    onSuccess: (a) => { clearDraft(sessionDraftStorage(), draftKey); toast("نوبت ثبت شد.", "ok"); router.push(`/appointments/${a.id}`); },
  });

  const submit = () => {
    if (!slot) return;
    if (status !== "authed") return router.push(`/login?next=${encodeURIComponent(`/doctors/${doctorId}`)}`);
    setErr(null);
    book.mutate({ slot }, {
      onError: (e) => {
        if (e instanceof ApiError && e.code === "consent_required") return setConsentOpen(true);
        setErr(errorMessage(e));
        if (e instanceof ApiError && (e.code === "slot_taken" || e.code === "invalid_slot")) { setSlot(null); setStep(0); void slots.refetch(); }
      },
    });
  };

  const onDay = (d: string) => { setDay(d); setSlot(null); setErr(null); };
  const discard = () => { clearDraft(sessionDraftStorage(), draftKey); setSlot(null); setKind("VIDEO"); setReason(""); setStep(0); setRestored(false); };

  if (doctor.isError) {
    return doctor.error instanceof ApiError && doctor.error.status === 404
      ? <div className="empty">پزشک پیدا نشد.</div> : <ErrorBox message={errorMessage(doctor.error)} />;
  }
  if (!doctor.data) return <SkeletonList rows={2} />;

  const canBook = status !== "authed" || me?.role === "PATIENT";
  return (
    <div className="grid grid-2 items-start">
      <DoctorProfileView doctor={doctor.data} />
      <BookingView
        days={days} day={day} slots={slots.isError ? [] : slots.data?.slots} slot={slot} kind={kind} reason={reason} step={step}
        busy={book.isPending} error={err ?? (slots.isError ? errorMessage(slots.error) : null)} authed={status === "authed"} canBook={canBook} restored={restored}
        onDay={onDay} onSlot={setSlot} onKind={setKind} onReason={setReason} onStep={setStep} onSubmit={submit} onDiscardDraft={discard}
      />
      {consentOpen && <ConsentDialog onClose={() => setConsentOpen(false)} onGranted={() => { setConsentOpen(false); submit(); }} />}
    </div>
  );
}
