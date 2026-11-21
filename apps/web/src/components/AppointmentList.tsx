"use client";
import Link from "next/link";
import { EmptyState, SkeletonList } from "@/components/kit";
import { formatDateTime, formatToman } from "@/lib/format";
import { errorMessage } from "@/lib/messages";
import { qk } from "@/lib/query/keys";
import { useApiInfinite } from "@/lib/query/hooks";
import type { AppointmentList as ListResp } from "@/lib/types";
import { AppointmentActions } from "./AppointmentActions";
import { ErrorBox, kindLabel, StatusBadge } from "./ui";

/** فهرست نوبت‌ها با فیلتر دلخواه (query)، صفحه‌بندی با cursor و (برای پزشک) اقدام‌های سریع. */
export function AppointmentList({ query, counterpart, quickActions = false }: { query: string; counterpart: "doctor" | "patient"; quickActions?: boolean }) {
  const q = useApiInfinite<ListResp, string | undefined>({
    key: qk.appointments(query),
    initialParam: undefined,
    path: (cursor) => `/appointments?${query}&limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    next: (last) => last.nextCursor,
  });
  const items = q.data?.pages.flatMap((pg) => pg.items);

  if (q.isError) return <ErrorBox message={errorMessage(q.error)} />;
  if (!items) return <SkeletonList rows={3} />;
  if (items.length === 0) return <EmptyState icon="🗓️" title="نوبتی وجود ندارد" description="نوبت‌های شما پس از رزرو اینجا نمایش داده می‌شود." action={counterpart === "doctor" ? undefined : { label: "جستجوی پزشک", href: "/" }} />;

  return (
    <div className="stack">
      {items.map((a) => (
        <div key={a.id} className="card stack gap-3">
          <Link href={`/appointments/${a.id}`} className="row between">
            <div>
              <h3 className="m-0">{counterpart === "doctor" ? a.doctor.fullName : a.patient.fullName || "بیمار"}</h3>
              <span className="muted small">{formatDateTime(a.startsAt)} · {kindLabel(a.kind)} · {formatToman(a.priceRial)}</span>
            </div>
            <StatusBadge status={a.status} />
          </Link>
          {quickActions && <AppointmentActions a={a} compact onDone={() => void q.refetch()} />}
        </div>
      ))}
      {q.hasNextPage && <div className="center"><button type="button" className="btn" disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>{q.isFetchingNextPage ? "در حال بارگذاری…" : "نمایش بیشتر"}</button></div>}
    </div>
  );
}
