import Link from "next/link";
import { Avatar, Money, Num } from "@/components/kit";
import type { DoctorCard } from "@/lib/types";

export function DoctorCardView({ doctor: d, compared, onToggleCompare }: { doctor: DoctorCard; compared: boolean; onToggleCompare: (id: string) => void }) {
  return (
    <div className="card hover doctor-card stack gap-3">
      <label className="compare-toggle">
        <input type="checkbox" checked={compared} onChange={() => onToggleCompare(d.id)} aria-label={`${d.fullName} را به مقایسه اضافه کن`} />
        مقایسه
      </label>
      <Link href={`/doctors/${d.id}`} className="doctor-card-link">
        <div className="row">
          <Avatar name={d.fullName} size="lg" />
          <div>
            <h3 className="m-0">{d.fullName}</h3>
            <span className="muted small"><Money rial={d.consultationFeeRial} /> · <Num value={d.slotMinutes} /> دقیقه</span>
          </div>
        </div>
        <div className="chips">{d.specialties.map((s) => <span key={s.slug} className="badge badge-info">{s.nameFa}</span>)}</div>
        {d.clinic?.name && <p className="muted small m-0">محل ویزیت: {d.clinic.name}{d.clinic.address ? ` — ${d.clinic.address}` : ""}</p>}
        {d.bio && <p className="muted small m-0">{d.bio.slice(0, 110)}{d.bio.length > 110 ? "…" : ""}</p>}
      </Link>
    </div>
  );
}
