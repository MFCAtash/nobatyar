"use client";
import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth-context";
import { QueryProvider } from "./QueryProvider";
import { ToastProvider } from "./Toast";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AuthProvider>
        <QueryProvider>{children}</QueryProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
