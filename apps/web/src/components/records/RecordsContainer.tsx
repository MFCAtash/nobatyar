"use client";
import { useState } from "react";
import { errorMessage } from "@/lib/messages";
import { qk } from "@/lib/query/keys";
import { useApiInfinite } from "@/lib/query/hooks";
import { NewRecordModal } from "./NewRecordModal";
import { RecordsListView } from "./RecordsListView";
import type { RecordsPage } from "./types";

export function RecordsContainer() {
  const [category, setCategory] = useState("");
  const [adding, setAdding] = useState(false);
  const q = useApiInfinite<RecordsPage, string | undefined>({
    key: qk.records(category),
    initialParam: undefined,
    path: (cursor) => {
      const sp = new URLSearchParams();
      if (category) sp.set("category", category);
      if (cursor) sp.set("cursor", cursor);
      return `/records?${sp}`;
    },
    next: (last) => (last.hasMore ? last.cursor : undefined),
  });
  return (
    <>
      <RecordsListView
        records={q.data?.pages.flatMap((pg) => pg.records) ?? []}
        loading={q.isPending} loadingMore={q.isFetchingNextPage}
        error={q.isError ? errorMessage(q.error) : null}
        category={category} hasMore={Boolean(q.hasNextPage)}
        onCategory={setCategory} onMore={() => void q.fetchNextPage()} onAdd={() => setAdding(true)}
      />
      {adding && <NewRecordModal onClose={() => setAdding(false)} />}
    </>
  );
}
