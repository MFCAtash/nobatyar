import type { Meta, StoryObj } from "@storybook/react";
import { doctors, noop, specialties } from "@/stories/fixtures";
import { HomeView } from "./HomeView";

const meta = {
  title: "Home/Search", component: HomeView, parameters: { layout: "padded" },
  args: { q: "", specialty: "", specialties, doctors, total: 3, loading: false, loadingMore: false, error: null, compare: [], hasMore: true, onQuery: noop, onSpecialty: noop, onMore: noop, onToggleCompare: noop, onClearCompare: noop },
} satisfies Meta<typeof HomeView>;
export default meta;
type S = StoryObj<typeof meta>;
export const Default: S = {};
export const Loading: S = { args: { loading: true, doctors: [] } };
export const NoResults: S = { args: { q: "ززز", doctors: [], total: 0, hasMore: false } };
export const ComparingTwo: S = { args: { compare: ["d1", "d2"] } };
export const ErrorState: S = { args: { doctors: [], error: "اتصال به سرور برقرار نشد." } };
