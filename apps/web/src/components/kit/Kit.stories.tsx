import type { Meta, StoryObj } from "@storybook/react";
import { Avatar, DateText, EmptyState, Field, JalaliPreview, Money, Num, OfflineBannerView, SkeletonGrid, SkeletonList, SkeletonText, Stepper } from ".";

const meta = { title: "Kit/Overview", parameters: { layout: "padded" } } satisfies Meta;
export default meta;
type S = StoryObj<typeof meta>;

export const SkeletonLists: S = { render: () => <SkeletonList rows={3} /> };
export const SkeletonDoctorGrid: S = { render: () => <SkeletonGrid count={3} /> };
export const SkeletonParagraph: S = { render: () => <SkeletonText lines={4} /> };

export const EmptyDefault: S = { render: () => <EmptyState icon="📋" title="هیچ پرونده‌ای ثبت نشده" description="نتیجه‌ی آزمایش و نسخه‌ها را یک‌جا نگه دارید." action={{ label: "ایجاد پرونده", onClick: () => undefined }} /> };
export const EmptyNoAction: S = { render: () => <EmptyState icon="🔔" title="هیچ اعلانی ندارید" /> };

export const StepperFirst: S = { render: () => <Stepper steps={[{ id: "a", label: "انتخاب زمان" }, { id: "b", label: "جزئیات" }, { id: "c", label: "تأیید" }]} current={0} /> };
export const StepperMiddle: S = { render: () => <Stepper steps={[{ id: "a", label: "انتخاب زمان" }, { id: "b", label: "جزئیات" }, { id: "c", label: "تأیید" }]} current={1} /> };

export const Avatars: S = { render: () => <div className="row"><Avatar name="دکتر مریم احمدی" size="sm" /><Avatar name="علی رضایی" size="md" /><Avatar name="سارا کریمی" size="lg" /></div> };
export const PersianFormatting: S = {
  render: () => (
    <div className="stack">
      <DateText value="2026-10-13T05:30:00Z" variant="datetime" />
      <DateText value="2026-10-13T05:30:00Z" variant="long" />
      <Money rial="3500000" />
      <Num value={1234567} />
    </div>
  ),
};
export const FormFieldStates: S = {
  render: () => (
    <div className="stack mw-sm">
      <Field label="عنوان" hint="کوتاه و گویا">{(f) => <input className="input" {...f} defaultValue="" />}</Field>
      <Field label="شماره‌ی موبایل" error="شماره‌ی موبایل معتبر نیست.">{(f) => <input className="input ltr" {...f} defaultValue="0912" />}</Field>
      <Field label="تاریخ ویزیت" hint={<JalaliPreview value="2026-10-13" />}>{(f) => <input className="input ltr" type="date" {...f} defaultValue="2026-10-13" />}</Field>
    </div>
  ),
};
export const OfflineBannerShown: S = { render: () => <OfflineBannerView online={false} />, parameters: { layout: "fullscreen" } };
