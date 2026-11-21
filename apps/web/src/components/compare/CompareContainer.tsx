"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { EmptyState, SkeletonList } from "@/components/kit";
import { ErrorBox } from "@/components/ui";
import { errorMessage } from "@/lib/messages";
import { useApiQuery } from "@/lib/query/hooks";
import { CompareTable, type DoctorCompare } from "./CompareView";

export function CompareContainer() {
  const router = useRouter();
  const ids = useSearchParams().get("ids") ?? "";
  const q = useApiQuery<DoctorCompare[]>(["compare", ids], ids ? `/doctors/compare?ids=${encodeURIComponent(ids)}` : null);

  if (!ids) return <EmptyState icon="⚖️" title="هیچ پزشکی برای مقایسه انتخاب نشده" action={{ label: "جستجوی پزشک", href: "/" }} />;
  return (
    <div className="container">
      <div className="row between mb-5">
        <h1 className="page-title">مقایسه پزشکان</h1>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => router.back()}>← بازگشت</button>
      </div>
      {q.isError && <ErrorBox message={errorMessage(q.error)} />}
      {q.isPending && !q.isError ? <SkeletonList rows={4} /> : q.data && q.data.length > 0
        ? <CompareTable doctors={q.data} />
        : !q.isError && <EmptyState icon="🔍" title="پزشکی یافت نشد" action={{ label: "جستجوی پزشک", href: "/" }} />}
    </div>
  );
}
