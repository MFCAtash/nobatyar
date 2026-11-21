import { Suspense } from "react";
import { MfaChallengeContainer } from "@/components/mfa/MfaChallengeContainer";
import { Loading } from "@/components/ui";

export default function MfaPage() {
  return <Suspense fallback={<Loading />}><MfaChallengeContainer /></Suspense>;
}
