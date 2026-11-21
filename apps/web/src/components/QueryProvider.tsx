"use client";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { clearAllDrafts, sessionDraftStorage } from "@/lib/draft";
import { makeQueryClient } from "@/lib/query/client";

/** با خروج از حساب (یا ابطال نشست) cache و پیش‌نویس‌ها پاک می‌شوند؛ داده‌ی یک کاربر هرگز به کاربر بعدی نمی‌رسد. */
function AuthCacheGuard() {
  const qc = useQueryClient();
  const { status } = useAuth();
  useEffect(() => {
    if (status === "anon") {
      qc.clear();
      clearAllDrafts(sessionDraftStorage());
    }
  }, [status, qc]);
  return null;
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={client}>
      <AuthCacheGuard />
      {children}
    </QueryClientProvider>
  );
}
