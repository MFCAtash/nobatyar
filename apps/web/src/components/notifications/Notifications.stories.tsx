import type { Meta, StoryObj } from "@storybook/react";
import { noop, notifications } from "@/stories/fixtures";
import { NotificationsView } from "./NotificationsView";

const meta = { title: "Notifications/List", component: NotificationsView, args: { items: notifications, unread: 1, loading: false, hasMore: false, onRead: noop, onReadAll: noop, onMore: noop } } satisfies Meta<typeof NotificationsView>;
export default meta;
type S = StoryObj<typeof meta>;
export const Default: S = {};
export const Loading: S = { args: { items: [], unread: 0, loading: true } };
export const Empty: S = { args: { items: [], unread: 0 } };
