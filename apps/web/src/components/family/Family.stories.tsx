import type { Meta, StoryObj } from "@storybook/react";
import { members, noop } from "@/stories/fixtures";
import { FamilyView } from "./FamilyView";

const meta = { title: "Family/List", component: FamilyView, args: { members, loading: false, error: null, onAdd: noop, onEdit: noop, onRemove: noop } } satisfies Meta<typeof FamilyView>;
export default meta;
type S = StoryObj<typeof meta>;
export const Default: S = {};
export const Loading: S = { args: { members: undefined, loading: true } };
export const Empty: S = { args: { members: [] } };
