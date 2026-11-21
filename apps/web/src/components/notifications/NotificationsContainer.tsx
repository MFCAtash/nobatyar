"use client";
import { PushToggle } from "@/components/PushToggle";
import { useNotifications } from "@/lib/use-notifications";
import { NotificationsView } from "./NotificationsView";

export function NotificationsContainer() {
  const n = useNotifications();
  return (
    <div className="container mw-lg">
      <PushToggle />
      <NotificationsView items={n.items} unread={n.unread} loading={n.loading} hasMore={n.hasMore} onRead={n.markRead} onReadAll={n.markAllRead} onMore={n.loadMore} />
    </div>
  );
}
