import { QueryClient } from "@tanstack/react-query";
import { retryDelay, shouldRetry } from "./retry-policy";

/**
 * ⚠️ cache فقط در حافظه است (نه localStorage/IndexedDB): داده‌ی سلامت روی دستگاه ماندگار نمی‌شود.
 * با خروج از حساب، AuthCacheGuard همه‌ی cache را پاک می‌کند.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, gcTime: 5 * 60_000, retry: shouldRetry, retryDelay, refetchOnWindowFocus: false, refetchOnReconnect: true },
      mutations: { retry: false },
    },
  });
}
