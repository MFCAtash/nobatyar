"use client";
import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { useToast } from "@/components/Toast";
import { ErrorBox, Loading } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { formatDateTime, tehranLocalToIso, toAsciiDigits, formatNumber } from "@/lib/format";
import { errorMessage, WEEKDAYS_FA } from "@/lib/messages";
import type { AvailabilityResponse, DoctorCard, Specialty, TimeOff, WeeklyRule } from "@/lib/types";

type Rules = Record<number, { startTime: string; endTime: string }[]>;
const toMap = (rules: WeeklyRule[]): Rules => {
  const m: Rules = {};
  for (const r of rules) (m[r.weekday] ??= []).push({ startTime: r.startTime, endTime: r.endTime });
  return m;
};

function Schedule() {
  const { api, me } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<AvailabilityResponse | null>(null);
  const [rules, setRules] = useState<Rules>({});
  const [slotMinutes, setSlotMinutes] = useState(20);
  const [autoConfirm, setAutoConfirm] = useState(false);
  const [feeToman, setFeeToman] = useState("0");
  const [bio, setBio] = useState("");
  const [clinicName, setClinicName] = useState("");
  const [clinicAddress, setClinicAddress] = useState("");
  const [clinicPhone, setClinicPhone] = useState("");
  const [offs, setOffs] = useState<TimeOff[]>([]);
  const [offFrom, setOffFrom] = useState("");
  const [offTo, setOffTo] = useState("");
  const [allSpecs, setAllSpecs] = useState<Specialty[]>([]);
  const [mySpecs, setMySpecs] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [av, to, specs, mine] = await Promise.all([
        api.get<AvailabilityResponse>("/doctors/me/availability"),
        api.get<TimeOff[]>("/doctors/me/time-off"),
        api.get<Specialty[]>("/specialties"),
        me ? api.get<DoctorCard>(`/doctors/${me.id}`).catch(() => null) : Promise.resolve(null),
      ]);
      setData(av); setRules(toMap(av.rules)); setSlotMinutes(av.settings.slotMinutes); setAutoConfirm(av.settings.autoConfirm);
      setFeeToman((BigInt(av.settings.consultationFeeRial) / 10n).toString()); setBio(av.settings.bio ?? "");
      setClinicName(av.settings.clinicName ?? ""); setClinicAddress(av.settings.clinicAddress ?? ""); setClinicPhone(av.settings.clinicPhone ?? "");
      setOffs(to); setAllSpecs(specs); setMySpecs(mine?.specialties.map((s) => s.slug) ?? []);
    } catch (e) { setErr(errorMessage(e)); }
  }, [api, me]);
  useEffect(() => { void load(); }, [load]);

  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key); setErr(null);
    try { await fn(); toast(ok, "ok"); await load(); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(null); }
  }

  const saveSettings = () => run("settings", () => {
    const toman = toAsciiDigits(feeToman).replace(/[^\d]/g, "") || "0";
    return api.patch("/doctors/me/settings", {
      slotMinutes, autoConfirm, consultationFeeRial: (BigInt(toman) * 10n).toString(), bio,
      ...(clinicName.trim() ? { clinicName: clinicName.trim() } : {}),
      ...(clinicAddress.trim() ? { clinicAddress: clinicAddress.trim() } : {}),
      ...(clinicPhone.trim() ? { clinicPhone: clinicPhone.trim() } : {}),
    });
  }, "تنظیمات ذخیره شد.");

  const saveRules = () => run("rules", () => api.put("/doctors/me/availability", {
    rules: Object.entries(rules).flatMap(([wd, list]) => list.map((r) => ({ weekday: Number(wd), ...r }))),
  }), "برنامه‌ی هفتگی ذخیره شد.");

  const saveSpecs = () => run("specs", () => api.put("/doctors/me/specialties", { slugs: mySpecs }), "تخصص‌ها ذخیره شد.");

  const addOff = () => {
    const a = tehranLocalToIso(offFrom), b = tehranLocalToIso(offTo);
    if (!a || !b) return setErr("بازه‌ی مرخصی را کامل وارد کنید.");
    return run("off", () => api.post("/doctors/me/time-off", { startsAt: a, endsAt: b }), "مرخصی ثبت شد.");
  };

  const setRow = (wd: number, i: number, patch: Partial<{ startTime: string; endTime: string }>) =>
    setRules((m) => ({ ...m, [wd]: m[wd].map((r, k) => (k === i ? { ...r, ...patch } : r)) }));

  if (!data) return err ? <ErrorBox message={err} /> : <Loading />;

  return (
    <div className="stack">
      <h1>برنامه‌ی کاری</h1>
      <ErrorBox message={err} />

      <section className="card stack" aria-labelledby="s1">
        <h2 className="fs-md" id="s1">تنظیمات نوبت‌دهی</h2>
        <div className="grid grid-2">
          <div className="field"><label className="label" htmlFor="sm">طول هر نوبت (دقیقه)</label>
            <select id="sm" className="select" value={slotMinutes} onChange={(e) => setSlotMinutes(Number(e.target.value))}>
              {[10, 15, 20, 30, 40, 45, 60].map((n) => <option key={n} value={n}>{formatNumber(n)}</option>)}</select></div>
          <div className="field"><label className="label" htmlFor="fee">هزینه‌ی ویزیت (تومان؛ ۰ = رایگان)</label>
            <input id="fee" className="input ltr" inputMode="numeric" value={feeToman} onChange={(e) => setFeeToman(e.target.value)} /></div>
        </div>
        <div className="field"><label className="label" htmlFor="bio">درباره‌ی شما</label><textarea id="bio" className="textarea" maxLength={2000} value={bio} onChange={(e) => setBio(e.target.value)} /></div>
        <h3 className="fs-md m-0">محل ویزیت حضوری</h3>
        <p className="help m-0">این اطلاعات عمومیاند و فقط برای نوبتهای حضوری نمایش داده میشوند.</p>
        <div className="grid grid-2">
          <div className="field"><label className="label" htmlFor="clinic-name">نام مطب</label>
            <input id="clinic-name" className="input" maxLength={120} value={clinicName} onChange={(e) => setClinicName(e.target.value)} /></div>
          <div className="field"><label className="label" htmlFor="clinic-phone">تلفن مطب</label>
            <input id="clinic-phone" className="input ltr" maxLength={20} value={clinicPhone} onChange={(e) => setClinicPhone(e.target.value)} /></div>
        </div>
        <div className="field"><label className="label" htmlFor="clinic-addr">آدرس مطب</label>
          <input id="clinic-addr" className="input" maxLength={500} value={clinicAddress} onChange={(e) => setClinicAddress(e.target.value)} /></div>
        <label className="check"><input type="checkbox" checked={autoConfirm} onChange={(e) => setAutoConfirm(e.target.checked)} /> نوبت‌ها پس از پرداخت/ثبت خودکار تأیید شوند</label>
        <div><button className="btn btn-primary" disabled={busy === "settings"} onClick={() => void saveSettings()}>ذخیره‌ی تنظیمات</button></div>
      </section>

      <section className="card stack" aria-labelledby="s2">
        <h2 className="fs-md" id="s2">برنامه‌ی هفتگی (وقت تهران)</h2>
        {WEEKDAYS_FA.map((name, wd) => (
          <div key={wd} className="stack gap-2">
            <div className="row between"><strong>{name}</strong>
              <button className="btn btn-ghost btn-sm" onClick={() => setRules((m) => ({ ...m, [wd]: [...(m[wd] ?? []), { startTime: "09:00", endTime: "12:00" }] }))}>+ بازه</button></div>
            {(rules[wd] ?? []).map((r, i) => (
              <div key={i} className="rule-row">
                <input aria-label={`شروع ${name}`} type="time" className="input ltr" value={r.startTime} onChange={(e) => setRow(wd, i, { startTime: e.target.value })} />
                <input aria-label={`پایان ${name}`} type="time" className="input ltr" value={r.endTime} onChange={(e) => setRow(wd, i, { endTime: e.target.value })} />
                <button className="btn btn-danger btn-sm" aria-label="حذف بازه" onClick={() => setRules((m) => ({ ...m, [wd]: m[wd].filter((_, k) => k !== i) }))}>حذف</button>
              </div>
            ))}
          </div>
        ))}
        <p className="help">تغییر برنامه روی نوبت‌های ثبت‌شده اثری ندارد؛ فقط وقت‌های جدید را می‌سازد.</p>
        <div><button className="btn btn-primary" disabled={busy === "rules"} onClick={() => void saveRules()}>ذخیره‌ی برنامه</button></div>
      </section>

      <section className="card stack" aria-labelledby="s3">
        <h2 className="fs-md" id="s3">تخصص‌ها (حداکثر ۳)</h2>
        <div className="chips">
          {allSpecs.map((s) => {
            const on = mySpecs.includes(s.slug);
            return <button key={s.slug} className="chip" aria-pressed={on} onClick={() => setMySpecs((xs) => on ? xs.filter((x) => x !== s.slug) : xs.length < 3 ? [...xs, s.slug] : xs)}>{s.nameFa}</button>;
          })}
        </div>
        <div><button className="btn btn-primary" disabled={busy === "specs" || mySpecs.length === 0} onClick={() => void saveSpecs()}>ذخیره‌ی تخصص‌ها</button></div>
      </section>

      <section className="card stack" aria-labelledby="s4">
        <h2 className="fs-md" id="s4">مرخصی</h2>
        <div className="grid grid-2">
          <div className="field"><label className="label" htmlFor="of">از</label><input id="of" type="datetime-local" className="input ltr" value={offFrom} onChange={(e) => setOffFrom(e.target.value)} /></div>
          <div className="field"><label className="label" htmlFor="ot">تا</label><input id="ot" type="datetime-local" className="input ltr" value={offTo} onChange={(e) => setOffTo(e.target.value)} /></div>
        </div>
        <p className="help">اگر در بازه نوبت فعال دارید، ابتدا باید آن‌ها را لغو کنید.</p>
        <div><button className="btn" disabled={busy === "off"} onClick={() => void addOff()}>ثبت مرخصی</button></div>
        {offs.map((o) => (
          <div key={o.id} className="row between"><span>{formatDateTime(o.startsAt)} ← {formatDateTime(o.endsAt)}</span>
            <button className="btn btn-danger btn-sm" onClick={() => void run("del" + o.id, () => api.delete(`/doctors/me/time-off/${o.id}`), "مرخصی حذف شد.")}>حذف</button></div>
        ))}
      </section>
    </div>
  );
}

export default function SchedulePage() {
  return <RequireAuth roles={["DOCTOR"]}><Schedule /></RequireAuth>;
}
