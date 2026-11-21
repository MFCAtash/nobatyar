import { Suspense } from "react";
import { LoginContainer } from "@/components/login/LoginContainer";

export default function LoginPage() {
  return <Suspense fallback={null}><LoginContainer /></Suspense>;
}
