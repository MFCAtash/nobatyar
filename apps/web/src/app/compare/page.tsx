import { Suspense } from "react";
import { CompareContainer } from "@/components/compare/CompareContainer";
import { SkeletonList } from "@/components/kit";

export default function ComparePage() {
  return <Suspense fallback={<SkeletonList rows={4} />}><CompareContainer /></Suspense>;
}
