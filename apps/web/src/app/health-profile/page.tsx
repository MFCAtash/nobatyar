"use client";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/RequireAuth";
import { useToast } from "@/components/Toast";
import { ErrorBox, Loading } from "@/components/ui";
import { splitLines } from "@/lib/clinical";
import { useAuth } from "@/lib/auth-context";
import { errorMessage } from "@/lib/messages";
import type { HealthProfile } from "@/lib/types";

const BLOOD = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

function Form() {
  const { api, me } = useAuth();
  const toast = useToast();
  const [p, setP] = useState<HealthProfile | null>(null);
  const [allergies, setAllergies] = useState(""); const [conds, setConds] = useState(""); const [meds, setMeds] = useState("");
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<HealthProfile>("/me/health-profile").then((x) => { setP(x); setAllergies(x.allergies.join("\n")); setConds(x.chronicConditions.join("\n")); setMeds(x.medications.join("\n")); }).catch((e) => setErr(errorMessage(e)));
  }, [api]);
  if (!p) return err ? <ErrorBox message={err} /> : <Loading />;

  async function save() {
    setBusy(true); setErr(null);
    try {
      const r = await api.put<HealthProfile>("/me/health-profile", { allergies: splitLines(allergies), chronicConditions: splitLines(conds), medications: splitLines(meds), bloodType: p!.bloodType, pregnancy: p!.pregnancy, notes: p!.notes });
      setP(r); toast("پروفایل سلامت ذخیره شد.", "ok");
    } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  }
  return (
    <div className="card stack mw-lg mx-auto">
      <h1 className="fs-xl m-0">پروفایل سلامت</h1>
      <p className="help">این اطلاعات رمزنگاری می‌شود. فقط پزشکِ دارای نوبت فعال/اخیر با شما می‌تواند برای ایمنی دارویی ببیند و هر مشاهده در سابقه‌ی دسترسی ثبت می‌شود. {me?.fullName}</p>
      <ErrorBox message={err} />
      <div className="field"><label className="label" htmlFor="al">حساسیت‌ها (دارو، غذا، …؛ هر مورد در یک خط)</label><textarea id="al" className="textarea" value={allergies} onChange={(e) => setAllergies(e.target.value)} /></div>
      <div className="field"><label className="label" htmlFor="cc">بیماری‌های زمینه‌ای</label><textarea id="cc" className="textarea" value={conds} onChange={(e) => setConds(e.target.value)} /></div>
      <div className="field"><label className="label" htmlFor="md">داروهای مصرفی فعلی</label><textarea id="md" className="textarea" value={meds} onChange={(e) => setMeds(e.target.value)} /></div>
      <div className="grid grid-2">
        <div className="field"><label className="label" htmlFor="bt">گروه خون</label>
          <select id="bt" className="input" value={p.bloodType ?? ""} onChange={(e) => setP({ ...p, bloodType: e.target.value || null })}><option value="">نامشخص</option>{BLOOD.map((b) => <option key={b}>{b}</option>)}</select></div>
        <div className="field"><label className="label" htmlFor="pr">بارداری</label>
          <select id="pr" className="input" value={p.pregnancy} onChange={(e) => setP({ ...p, pregnancy: e.target.value as HealthProfile["pregnancy"] })}><option value="UNKNOWN">نامشخص</option><option value="NO">خیر</option><option value="YES">بله</option></select></div>
      </div>
      <div className="field"><label className="label" htmlFor="nt">یادداشت</label><textarea id="nt" className="textarea" maxLength={1000} value={p.notes} onChange={(e) => setP({ ...p, notes: e.target.value })} /></div>
      <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>ذخیره</button>
    </div>
  );
}
export default function HealthProfilePage() { return <RequireAuth roles={["PATIENT"]}><Form /></RequireAuth>; }
