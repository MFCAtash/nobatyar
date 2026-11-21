"use client";
import { useParams } from "next/navigation";
import { RecordDetailContainer } from "@/components/records/RecordDetailContainer";

export default function RecordDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <RecordDetailContainer id={id} />;
}
