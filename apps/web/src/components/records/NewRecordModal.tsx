"use client";
import { useState } from "react";
import { Field, JalaliPreview } from "@/components/kit";
import { ErrorBox, Modal } from "@/components/ui";
import { useApiMutation } from "@/lib/query/hooks";
import { qkRoot } from "@/lib/query/keys";
import { errorMessage } from "@/lib/messages";
import { CATEGORY_ICON, CATEGORY_LABEL } from "@/lib/record-categories";

const EMPTY = { title: "", content: "", category: "NOTE", visitDate: "", tags: "" };

export function NewRecordModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState(EMPTY);
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const create = useApiMutation<typeof EMPTY>({
    run: (f, api) => api.post("/records", {
      title: f.title.trim(), content: f.content, category: f.category,
      ...(f.visitDate ? { visitDate: f.visitDate } : {}),
      tags: f.tags.split(/[,،]/).map((s) => s.trim()).filter(Boolean),
    }),
    invalidate: [[...qkRoot.records]],
    onSuccess: onClose,
  });

  return (
    <Modal title="پرونده سلامت جدید" onClose={onClose}>
      <div className="stack mt-3">
        <ErrorBox message={create.isError ? errorMessage(create.error) : null} />
        <Field label="عنوان *">{(f) => <input className="input" {...f} value={form.title} onChange={set("title")} placeholder="مثال: نتیجه آزمایش خون" />}</Field>
        <Field label="دسته‌بندی">
          {(f) => (
            <select className="select" {...f} value={form.category} onChange={set("category")}>
              {Object.entries(CATEGORY_LABEL).map(([v, l]) => <option key={v} value={v}>{CATEGORY_ICON[v]} {l}</option>)}
            </select>
          )}
        </Field>
        <Field label="توضیحات">{(f) => <textarea className="textarea" rows={4} {...f} value={form.content} onChange={set("content")} placeholder="یادداشت‌های پزشکی، نتایج، نکات مهم…" />}</Field>
        <Field label="تاریخ ویزیت (اختیاری)" hint={<JalaliPreview value={form.visitDate} />}>
          {(f) => <input className="input ltr" type="date" {...f} value={form.visitDate} onChange={set("visitDate")} />}
        </Field>
        <Field label="برچسب‌ها (با ویرگول جدا کنید)">{(f) => <input className="input" {...f} value={form.tags} onChange={set("tags")} placeholder="قلب، فشارخون، دیابت" />}</Field>
        <div className="row mt-1">
          <button type="button" className="btn btn-primary flex-1" disabled={create.isPending || !form.title.trim()} onClick={() => create.mutate(form)}>
            {create.isPending ? "در حال ذخیره…" : "ذخیره پرونده"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>انصراف</button>
        </div>
      </div>
    </Modal>
  );
}
