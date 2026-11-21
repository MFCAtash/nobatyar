import { useRef, useState } from "react";
import { EmptyState, Num, SkeletonGrid } from "@/components/kit";
import { ErrorBox } from "@/components/ui";
import type { DoctorCard, Specialty } from "@/lib/types";
import { CompareBar } from "./CompareBar";
import { DoctorCardView } from "./DoctorCardView";

export interface HomeViewProps {
  q: string;
  specialty: string;
  specialties: Specialty[];
  doctors: DoctorCard[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  compare: string[];
  hasMore: boolean;
  onQuery: (v: string) => void;
  onSpecialty: (v: string) => void;
  onMore: () => void;
  onToggleCompare: (id: string) => void;
  onClearCompare: () => void;
}

/** رابط حداقلی Web Speech API (فقط کروم/en و fa پشتیبانی میکند). */
interface SpeechRecLike {
  lang: string;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: { 0: { transcript: string } }[] }) => void) | null;
  onend: (() => void) | null;
}

export function HomeView(p: HomeViewProps) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecLike | null>(null);

  const voice = () => {
    const Ctor = (window as unknown as { SpeechRecognition?: new () => SpeechRecLike; webkitSpeechRecognition?: new () => SpeechRecLike }).SpeechRecognition
      ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecLike }).webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = recRef.current ?? new Ctor();
    rec.lang = "fa-IR"; rec.continuous = false;
    rec.onresult = (e) => p.onQuery(String(e.results[0]?.[0]?.transcript ?? ""));
    rec.onend = () => setListening(false);
    recRef.current = rec;
    if (listening) { rec.stop(); setListening(false); }
    else { rec.start(); setListening(true); }
  };

  return (
    <>
      <section className="hero">
        <h1>پزشک مناسب را پیدا کنید و همین امروز نوبت بگیرید</h1>
        <p className="muted">ویزیت آنلاین و حضوری با پزشکان تأییدشده</p>
        <div className="searchbar" role="search">
          <div className="voice-search-wrap">
            <input className="input" type="search" placeholder="نام پزشک…" aria-label="نام پزشک" value={p.q} onChange={(e) => p.onQuery(e.target.value)} />
            <button className={`btn btn-sm voice-btn ${listening ? "listening" : ""}`} type="button" onClick={voice} aria-label="جستجوی صوتی" aria-pressed={listening}>{listening ? "🎙️ در حال شنیدن" : "🎤 صوتی"}</button>
          </div>
          <select className="select" aria-label="تخصص" value={p.specialty} onChange={(e) => p.onSpecialty(e.target.value)}>
            <option value="">همه‌ی تخصص‌ها</option>
            {p.specialties.map((s) => <option key={s.slug} value={s.slug}>{s.nameFa}</option>)}
          </select>
        </div>
      </section>

      <ErrorBox message={p.error} />
      {p.loading ? <SkeletonGrid count={6} /> : p.doctors.length === 0 && !p.error ? (
        <EmptyState icon="🔍" title="پزشکی با این مشخصات پیدا نشد" description="نام را کوتاه‌تر بنویسید یا تخصص دیگری را امتحان کنید." />
      ) : (
        <>
          <p className="muted small" aria-live="polite"><Num value={p.total} /> پزشک</p>
          <div className="grid grid-3">
            {p.doctors.map((d) => <DoctorCardView key={d.id} doctor={d} compared={p.compare.includes(d.id)} onToggleCompare={p.onToggleCompare} />)}
          </div>
          {p.hasMore && (
            <div className="text-center mt-5">
              <button type="button" className="btn" disabled={p.loadingMore} onClick={p.onMore}>{p.loadingMore ? "در حال بارگذاری…" : "نمایش بیشتر"}</button>
            </div>
          )}
        </>
      )}
      <CompareBar ids={p.compare} onClear={p.onClearCompare} />
    </>
  );
}
