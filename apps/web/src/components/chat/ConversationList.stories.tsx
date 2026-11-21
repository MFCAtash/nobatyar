import type { Meta, StoryObj } from "@storybook/react";
import { convs } from "@/stories/fixtures";
import { ConversationListView } from "./ConversationListView";

const meta = { title: "Chat/ConversationList", component: ConversationListView, args: { items: convs, loading: false, error: null } } satisfies Meta<typeof ConversationListView>;
export default meta;
type S = StoryObj<typeof meta>;
export const Default: S = {};
export const Loading: S = { args: { items: undefined, loading: true } };
export const Empty: S = { args: { items: [] } };
export const ErrorState: S = { args: { items: undefined, error: "اتصال به سرور برقرار نشد." } };
