"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "./auth-context";
import { applyLive, mergeFirstPage, parseNotification } from "./notifications-state";
import type { NotificationsPage, NotificationsState } from "./notifications-state";
import { connectSse } from "./sse";

export type { Notification } from "./notifications-state";

/** SSE اعلان‌ها از همان مبدأ (Next rewrite → API). توکن در هدر Authorization می‌رود، نه در URL. */
const STREAM_URL = "/api/v1/notifications/stream";

export function useNotifications() {
  const { api, status } = useAuth();
  const [state, setState] = useState<NotificationsState>({
    items: [], unread: 0, hasMore: false, cursor: null, loading: false,
  });
  const cursorRef = useRef<string | null>(null);
  cursorRef.current = state.cursor;

  // صفحه‌ی بعدی (قدیمی‌تر)
  const load = useCallback(async (cursor?: string) => {
    if (status !== "authed") return;
    setState((s) => ({ ...s, loading: true }));
    try {
      const q = cursor ? `?cursor=${cursor}` : "";
      const r = await api.get<NotificationsPage>(`/notifications${q}`);
      setState((s) => cursor
        ? { items: [...s.items, ...r.items.filter((n) => !s.items.some((x) => x.id === n.id))], unread: r.unread, hasMore: r.hasMore, cursor: r.cursor, loading: false }
        : mergeFirstPage(s, r));
    } catch {
      setState((s) => ({ ...s, loading: false }));
    }
  }, [api, status]);

  // صفحه‌ی اول را بگیر و با آنچه SSE آورده ادغام کن (بدون تکرار و بدون گم‌شدن)
  const refreshFirstPage = useCallback(async () => {
    try {
      const r = await api.get<NotificationsPage>("/notifications");
      setState((s) => mergeFirstPage(s, r));
    } catch { /* بعدی: reconnect/resync */ }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  // SSE: اتصال به stream وقتی کاربر وارد است
  useEffect(() => {
    if (status !== "authed") return;

    const conn = connectSse({
      url: STREAM_URL,
      getToken: api.getToken,
      refreshAuth: api.refreshAfter401,
      onEvent: (m, { hadCursor }) => {
        switch (m.event) {
          case "notification": {
            const n = parseNotification(m.data);
            if (n) setState((s) => applyLive(s, n));
            break;
          }
          case "ready":
            // «ready» یعنی اشتراک Redis برقرار است ⇒ هر چه از پیش ساخته شده در REST است، هر چه بعد بسازد زنده می‌رسد.
            // بدون cursor (اولین اتصال) فاصله‌ی احتمالیِ بین بارگذاری اولیه و اتصال را با یک REST می‌بندیم؛
            // با cursor، سرور خودش از DB بازپخش می‌کند.
            if (!hadCursor) void refreshFirstPage();
            break;
          case "resync":
            // بازپخش ممکن نبود (cursor نامعتبر/فاصله‌ی زیاد/قطعی Redis)
            void refreshFirstPage();
            break;
        }
      },
    });
    return () => conn.close();
  }, [status, api, refreshFirstPage]);

  const markRead = useCallback(async (id: string) => {
    await api.patch(`/notifications/${id}/read`, {});
    setState((s) => {
      const was = s.items.find((n) => n.id === id);
      return {
        ...s,
        items:  s.items.map((n) => n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n),
        unread: was && !was.readAt ? Math.max(0, s.unread - 1) : s.unread,
      };
    });
  }, [api]);

  const markAllRead = useCallback(async () => {
    await api.patch("/notifications/read-all", {});
    setState((s) => ({
      ...s,
      items:  s.items.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
      unread: 0,
    }));
  }, [api]);

  const loadMore = useCallback(() => {
    if (cursorRef.current) void load(cursorRef.current);
  }, [load]);

  return { ...state, markRead, markAllRead, loadMore };
}

