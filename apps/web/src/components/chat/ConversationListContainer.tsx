"use client";
import { qk } from "@/lib/query/keys";
import { useApiQuery } from "@/lib/query/hooks";
import { errorMessage } from "@/lib/messages";
import { ConversationListView, type ConvSummary } from "./ConversationListView";

export function ConversationListContainer() {
  const q = useApiQuery<ConvSummary[]>(qk.conversations(), "/conversations");
  return <ConversationListView items={q.data} loading={q.isPending} error={q.isError ? errorMessage(q.error) : null} />;
}
