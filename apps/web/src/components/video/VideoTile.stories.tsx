import type { Meta, StoryObj } from "@storybook/react";
import { VideoTile } from "./VideoTile";

/** بدون LiveKit واقعی: فقط حالت «دوربین خاموش» (آواتار) و برچسب‌ها دیده می‌شود. */
const meta = { title: "Video/VideoTile", component: VideoTile, args: { track: undefined, label: "دکتر مریم احمدی" } } satisfies Meta<typeof VideoTile>;
export default meta;
type S = StoryObj<typeof meta>;
export const CameraOff: S = { args: { camOff: true } };
export const Speaking: S = { args: { speaking: true } };
export const MicMuted: S = { args: { micMuted: true } };
