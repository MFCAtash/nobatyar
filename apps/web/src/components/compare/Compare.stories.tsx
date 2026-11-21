import type { Meta, StoryObj } from "@storybook/react";
import { compareDoctors } from "@/stories/fixtures";
import { CompareTable } from "./CompareView";

const meta = { title: "Compare/Table", component: CompareTable, args: { doctors: compareDoctors } } satisfies Meta<typeof CompareTable>;
export default meta;
export const TwoDoctors: StoryObj<typeof meta> = {};
export const ThreeDoctors: StoryObj<typeof meta> = { args: { doctors: [...compareDoctors, { ...compareDoctors[0], id: "d3", fullName: "دکتر سارا کریمی", city: "شیراز" }] } };
