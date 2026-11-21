import type { Meta, StoryObj } from "@storybook/react";
import { doctors, noop, slots } from "@/stories/fixtures";
import { BookingView } from "./BookingView";
import { DoctorProfileView } from "./DoctorProfileView";

const days = ["2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"];
const meta = {
  title: "Booking/BookingView", component: BookingView,
  args: {
    days, day: days[0], slots, slot: null, kind: "VIDEO", reason: "", step: 0, busy: false, error: null, authed: true, canBook: true, restored: false,
    onDay: noop, onSlot: noop, onKind: noop, onReason: noop, onStep: noop, onSubmit: noop, onDiscardDraft: noop,
  },
} satisfies Meta<typeof BookingView>;
export default meta;
type S = StoryObj<typeof meta>;
export const Step1PickTime: S = { args: { slot: slots[1].startsAt } };
export const Step1LoadingSlots: S = { args: { slots: undefined } };
export const Step1NoSlots: S = { args: { slots: [] } };
export const Step1SlotTaken: S = { args: { error: "این ساعت هم‌اکنون رزرو شد؛ ساعت دیگری انتخاب کنید." } };
export const Step2Details: S = { args: { step: 1, slot: slots[1].startsAt, reason: "سردرد مکرر از دو هفته‌ی پیش" } };
export const Step3Confirm: S = { args: { step: 2, slot: slots[1].startsAt, reason: "سردرد مکرر از دو هفته‌ی پیش" } };
export const Step3Busy: S = { args: { step: 2, slot: slots[1].startsAt, busy: true } };
export const DraftRestored: S = { args: { step: 1, slot: slots[2].startsAt, reason: "پیش‌نویس", restored: true } };
export const GuestMustLogin: S = { args: { step: 2, slot: slots[0].startsAt, authed: false } };
export const DoctorAccountCannotBook: S = { args: { canBook: false } };
export const Profile: StoryObj = { render: () => <DoctorProfileView doctor={doctors[0]} /> };
