"use client";
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryKey, type UseQueryOptions } from "@tanstack/react-query";
import type { Api, ApiError } from "../api";
import { useAuth } from "../auth-context";

type QueryOpts<T> = Omit<UseQueryOptions<T, ApiError>, "queryKey" | "queryFn">;

/** GET با cache/retry یکدست. path=null ⇒ غیرفعال (وابستگی به ورودی دیگر). */
export function useApiQuery<T>(key: QueryKey, path: string | null, opts: QueryOpts<T> = {}) {
  const { api } = useAuth();
  return useQuery<T, ApiError>({
    ...opts,
    queryKey: key,
    queryFn: () => api.get<T>(path as string),
    enabled: path !== null && (opts.enabled ?? true),
  });
}

/** فهرست صفحه‌بندی‌شده (cursor یا شماره‌ی صفحه). */
export function useApiInfinite<Page, Param = string | undefined>(o: {
  key: QueryKey;
  initialParam: Param;
  path: (param: Param) => string;
  next: (last: Page, all: Page[]) => Param | undefined | null;
  enabled?: boolean;
}) {
  const { api } = useAuth();
  return useInfiniteQuery({
    queryKey: o.key,
    queryFn: ({ pageParam }) => api.get<Page>(o.path(pageParam as Param)),
    initialPageParam: o.initialParam,
    getNextPageParam: (last: Page, all: Page[]) => o.next(last, all) ?? undefined,
    enabled: o.enabled ?? true,
    placeholderData: keepPreviousData, // تغییر فیلتر/جستجو ⇒ فهرست قبلی تا رسیدن نتیجه‌ی جدید می‌ماند (بدون چشمک)
  });
}

/** نوشتن (POST/PUT/DELETE) با invalidate خودکار کلیدهای وابسته پس از موفقیت. */
export function useApiMutation<Vars, Res = unknown>(o: {
  run: (vars: Vars, api: Api) => Promise<Res>;
  invalidate?: QueryKey[];
  onSuccess?: (res: Res, vars: Vars) => void;
}) {
  const { api } = useAuth();
  const qc = useQueryClient();
  return useMutation<Res, ApiError, Vars>({
    mutationFn: (vars) => o.run(vars, api),
    onSuccess: async (res, vars) => {
      await Promise.all((o.invalidate ?? []).map((k) => qc.invalidateQueries({ queryKey: k })));
      o.onSuccess?.(res, vars);
    },
  });
}
