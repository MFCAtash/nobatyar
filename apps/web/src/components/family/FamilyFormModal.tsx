"use client";
import { useState } from "react";
import { Field } from "@/components/kit";
import { ErrorBox, Modal } from "@/components/ui";
import { toAsciiDigits } from "@/lib/format";
import { errorMessage } from "@/lib/messages";
import { useApiMutation } from "@/lib/query/hooks";
import type { Member } from "./FamilyView";

export const RELATIONS = ["فرزند", "والد", "همسر", "برادر", "خواهر", "سایر"];
const KEY = ["family"] as const;
export const familyKey = KEY;

interface Form { fullName: string; relation: string; birthYear: string; nationalId: string }

export function FamilyFormModal({ editing, onClose }: { editing: Member | null; onClose: () => void }) {
  const [form, setForm] = useState<Form>({ fullName: editing?.fullName ?? "", relation: editing?.relation ?? RELATIONS[0], birthYear: editing?.birthYear?.toString() ?? "", nationalId: "" });
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const save = useApiMutation<Form, Member>({
    run: (f, api) => {
      const body = {
        fullName: f.fullName.trim(), relation: f.relation,
        ...(f.birthYear ? { birthYear: parseInt(toAsciiDigits(f.birthYear), 10) } : {}),
        ...(f.nationalId ? { nationalId: toAsciiDigits(f.nationalId) } : {}),
      };
      return editing ? api.patch<Member>(`/me/family/${editing.id}`, body) : api.post<Member>("/me/family", body);
    },
    invalidate: [[...KEY]],
    onSuccess: onClose,
  });
  return (
    <Modal title={editing ? "ویرایش عضو" : "افزودن عضو خانواده"} onClose={onClose}>
      <div className="stack mt-4">
        <ErrorBox message={save.isError ? errorMessage(save.error) : null} />
        <Field label="نام و نام‌خانوادگی *">{(f) => <input className="input" placeholder="مثال: علی رضایی" {...f} value={form.fullName} onChange={set("fullName")} />}</Field>
        <Field label="نسبت *">{(f) => <select className="select" {...f} value={form.relation} onChange={set("relation")}>{RELATIONS.map((r) => <option key={r}>{r}</option>)}</select>}</Field>
        <Field label="سال تولد (شمسی)">{(f) => <input className="input ltr" inputMode="numeric" placeholder="مثال: ۱۳۷۰" {...f} value={form.birthYear} onChange={set("birthYear")} />}</Field>
        <Field label="کد ملی" hint="رمزنگاری‌شده ذخیره می‌شود">{(f) => <input className="input ltr" inputMode="numeric" placeholder="۱۰ رقم" maxLength={10} {...f} value={form.nationalId} onChange={set("nationalId")} />}</Field>
        <div className="row mt-1">
          <button type="button" className="btn btn-primary flex-1" disabled={save.isPending || !form.fullName.trim()} onClick={() => save.mutate(form)}>{save.isPending ? "در حال ذخیره…" : "ذخیره"}</button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>انصراف</button>
        </div>
      </div>
    </Modal>
  );
}
