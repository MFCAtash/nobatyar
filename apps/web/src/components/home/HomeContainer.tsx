"use client";
import { useState } from "react";
import { errorMessage } from "@/lib/messages";
import { qk } from "@/lib/query/keys";
import { useApiInfinite, useApiQuery } from "@/lib/query/hooks";
import type { DoctorSearch, Specialty } from "@/lib/types";
import { useDebounced } from "@/lib/use-debounced";
import { HomeView } from "./HomeView";

const LIMIT = 12;
export const MAX_COMPARE = 3;

export function HomeContainer() {
  const [q, setQ] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [compare, setCompare] = useState<string[]>([]);
  const term = useDebounced(q.trim().length >= 2 ? q.trim() : "", 300);

  const specialties = useApiQuery<Specialty[]>(qk.specialties(), "/specialties", { staleTime: 10 * 60_000 });
  const search = useApiInfinite<DoctorSearch, number>({
    key: qk.doctors({ q: term, specialty }),
    initialParam: 1,
    path: (page) => {
      const sp = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (term) sp.set("q", term);
      if (specialty) sp.set("specialty", specialty);
      return `/doctors?${sp}`;
    },
    next: (last, all) => (all.reduce((n, pg) => n + pg.items.length, 0) < last.total ? last.page + 1 : undefined),
  });

  const doctors = search.data?.pages.flatMap((pg) => pg.items) ?? [];
  const toggle = (id: string) => setCompare((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < MAX_COMPARE ? [...p, id] : p));

  return (
    <HomeView
      q={q} specialty={specialty} specialties={specialties.data ?? []}
      doctors={doctors} total={search.data?.pages[0]?.total ?? 0}
      loading={search.isPending} loadingMore={search.isFetchingNextPage}
      error={search.isError ? errorMessage(search.error) : null}
      compare={compare} hasMore={Boolean(search.hasNextPage)}
      onQuery={setQ} onSpecialty={setSpecialty} onMore={() => void search.fetchNextPage()}
      onToggleCompare={toggle} onClearCompare={() => setCompare([])}
    />
  );
}
