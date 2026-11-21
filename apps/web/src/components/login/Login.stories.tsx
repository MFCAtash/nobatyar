import type { Meta, StoryObj } from "@storybook/react";
import { noop } from "@/stories/fixtures";
import { LoginView } from "./LoginView";

const meta = {
  title: "Forms/Login", component: LoginView,
  args: { step: "phone", phone: "", code: "", busy: false, error: null, wait: 0, onPhone: noop, onCode: noop, onRequest: noop, onVerify: noop, onEditPhone: noop },
} satisfies Meta<typeof LoginView>;
export default meta;
type S = StoryObj<typeof meta>;
export const Phone: S = {};
export const PhoneInvalid: S = { args: { phone: "0912", error: "شماره‌ی موبایل معتبر نیست (مثال: ۰۹۱۲۱۲۳۴۵۶۷)." } };
export const PhoneBusy: S = { args: { phone: "09121234567", busy: true } };
export const CodeWaiting: S = { args: { step: "code", phone: "09121234567", wait: 47 } };
export const CodeResendReady: S = { args: { step: "code", phone: "09121234567", code: "482", wait: 0 } };
export const CodeWrong: S = { args: { step: "code", phone: "09121234567", error: "کد وارد‌شده درست نیست." } };
