import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar, Money, Num } from "@/components/kit";

export interface DoctorCompare {
  id: string; fullName: string; bio: string | null;
  consultationFeeRial: string; slotMinutes: number;
  city: string | null; onlineVisit: boolean; inPersonVisit: boolean;
  specialties: { slug: string; nameFa: string }[];
  workDays: number[];
}

export const DAY_NAMES = ["یک‌شنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنج‌شنبه", "جمعه", "شنبه"];

const Flag = ({ yes }: { yes: boolean }) => (
  <span className={yes ? "cmp-yes" : "cmp-no"}><span aria-hidden="true">{yes ? "✓" : "✗"}</span><span className="sr-only">{yes ? "دارد" : "ندارد"}</span></span>
);

export function CompareTable({ doctors }: { doctors: DoctorCompare[] }) {
  const row = (label: string, render: (d: DoctorCompare) => ReactNode) => (
    <tr>
      <th scope="row" className="cmp-label">{label}</th>
      {doctors.map((d) => <td key={d.id} className="cmp-cell">{render(d)}</td>)}
    </tr>
  );
  return (
    <div className="overflow-x-auto">
      <table className="cmp-table">
        <caption className="sr-only">مقایسه‌ی پزشکان</caption>
        <thead>
          <tr>
            <td />
            {doctors.map((d) => (
              <th key={d.id} scope="col" className="cmp-head">
                <div className="flex items-center gap-2">
                  <Avatar name={d.fullName} size="sm" />
                  <div><div className="fw-bold fs-sm">{d.fullName}</div><div className="muted small">{d.city}</div></div>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {row("تخصص", (d) => <div className="chips">{d.specialties.map((s) => <span key={s.slug} className="badge badge-info fs-2xs">{s.nameFa}</span>)}</div>)}
          {row("هزینه ویزیت", (d) => <strong className="text-accent"><Money rial={d.consultationFeeRial} /></strong>)}
          {row("مدت ویزیت", (d) => <span><Num value={d.slotMinutes} /> دقیقه</span>)}
          {row("ویزیت آنلاین", (d) => <Flag yes={d.onlineVisit} />)}
          {row("ویزیت حضوری", (d) => <Flag yes={d.inPersonVisit} />)}
          {row("روزهای کاری", (d) => <div className="flex flex-wrap gap-1">{d.workDays.map((day) => <span key={day} className="chip chip-xs">{DAY_NAMES[day] ?? day}</span>)}</div>)}
          {row("بیوگرافی", (d) => <p className="muted small m-0 lh-tight">{d.bio ? d.bio.slice(0, 120) + (d.bio.length > 120 ? "…" : "") : "—"}</p>)}
          <tr>
            <td />
            {doctors.map((d) => <td key={d.id} className="cmp-cell"><Link className="btn btn-primary btn-sm btn-block" href={`/doctors/${d.id}`}>رزرو نوبت</Link></td>)}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
