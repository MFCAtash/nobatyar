"use client";
import { useState } from "react";
import { useToast } from "@/components/Toast";
import { errorMessage } from "@/lib/messages";
import { useApiMutation, useApiQuery } from "@/lib/query/hooks";
import { FamilyFormModal, familyKey } from "./FamilyFormModal";
import { FamilyView, type Member } from "./FamilyView";

export function FamilyContainer() {
  const toast = useToast();
  const [modal, setModal] = useState<{ editing: Member | null } | null>(null);
  const q = useApiQuery<Member[]>([...familyKey], "/me/family");
  const remove = useApiMutation<Member>({ run: (m, api) => api.delete(`/me/family/${m.id}`), invalidate: [[...familyKey]] });
  return (
    <>
      <FamilyView
        members={q.data} loading={q.isPending} error={q.isError ? errorMessage(q.error) : null}
        onAdd={() => setModal({ editing: null })} onEdit={(m) => setModal({ editing: m })}
        onRemove={(m) => { if (confirm("عضو خانواده حذف شود؟")) remove.mutate(m, { onError: (e) => toast(errorMessage(e), "bad") }); }}
      />
      {modal && <FamilyFormModal editing={modal.editing} onClose={() => setModal(null)} />}
    </>
  );
}
