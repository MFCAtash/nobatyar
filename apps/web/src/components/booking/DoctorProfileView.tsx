import { Avatar, Money, Num } from "@/components/kit";
import type { DoctorCard } from "@/lib/types";

export function DoctorProfileView({ doctor }: { doctor: DoctorCard }) {
  return (
    <section className="card stack">
      <div className="row">
        <Avatar name={doctor.fullName} size="lg" />
        <div>
          <h1 className="fs-xl m-0">{doctor.fullName}</h1>
          <div className="chips">{doctor.specialties.map((s) => <span key={s.slug} className="badge badge-info">{s.nameFa}</span>)}</div>
        </div>
      </div>
      {doctor.bio && <p>{doctor.bio}</p>}
      {doctor.clinic && (
        <div className="note-box">
          <div><strong>{doctor.clinic.name ?? "مطب پزشک"}</strong></div>
          {doctor.clinic.address && <div className="muted small">{doctor.clinic.address}</div>}
          {doctor.clinic.phone && <div className="muted small">تلفن: {doctor.clinic.phone}</div>}
        </div>
      )}
      <p className="muted small">هزینه‌ی ویزیت: <strong><Money rial={doctor.consultationFeeRial} /></strong> · مدت هر نوبت <Num value={doctor.slotMinutes} /> دقیقه</p>
    </section>
  );
}
