import { Avatar, EmptyState, Num, SkeletonList } from "@/components/kit";
import { ErrorBox } from "@/components/ui";
import { formatDigits } from "@/lib/format";

export interface Member { id: string; fullName: string; relation: string; birthYear?: number; nationalIdMasked?: string | null }

export interface FamilyViewProps {
  members: Member[] | undefined;
  loading: boolean;
  error: string | null;
  onAdd: () => void;
  onEdit: (m: Member) => void;
  onRemove: (m: Member) => void;
}

export function FamilyView(p: FamilyViewProps) {
  return (
    <div className="container mw-lg">
      <div className="row between mb-4">
        <h1 className="page-title">اعضای خانواده</h1>
        <button type="button" className="btn btn-primary btn-sm" onClick={p.onAdd}>+ افزودن عضو</button>
      </div>
      <p className="muted small mb-5">می‌توانید برای اعضای خانواده نوبت بگیرید. اطلاعات کد ملی رمزنگاری‌شده ذخیره می‌شود.</p>
      <ErrorBox message={p.error} />
      {p.loading && <SkeletonList rows={3} />}
      {!p.loading && !p.error && p.members?.length === 0 && (
        <EmptyState icon="👨‍👩‍👧" title="هنوز عضوی اضافه نکرده‌اید" description="با افزودن اعضای خانواده، برای آن‌ها هم نوبت بگیرید." action={{ label: "افزودن عضو", onClick: p.onAdd }} />
      )}
      <div className="stack gap-3">
        {p.members?.map((m) => (
          <div key={m.id} className="card row between">
            <div className="flex items-center gap-3">
              <Avatar name={m.fullName} size="md" />
              <div>
                <div className="fw-bold">{m.fullName}</div>
                <div className="muted small">{m.relation}{m.birthYear ? <> · متولد <span className="num">{formatDigits(m.birthYear)}</span></> : null}</div>
                {m.nationalIdMasked && <div className="muted small num ltr">کدملی: {m.nationalIdMasked}</div>}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => p.onEdit(m)}>ویرایش</button>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => p.onRemove(m)}>حذف</button>
            </div>
          </div>
        ))}
      </div>
      {p.members && p.members.length > 0 && <p className="muted fs-xs mt-3"><Num value={p.members.length} /> عضو</p>}
    </div>
  );
}
