import type { Meta, StoryObj } from "@storybook/react";
import { Alert, Badge, DataTable, EmptyState, FormField, Sparkline, StatCard, Stepper, VitalCard } from ".";

const meta = { title: "Design System/Phase 20", parameters: { layout: "padded" } } satisfies Meta;
export default meta;
type S = StoryObj<typeof meta>;

export const Alerts: S = { render: () => (
  <div className="stack">
    <Alert tone="info" title="اطلاعات">پیشنویس آماده بازبینی است.</Alert>
    <Alert tone="ok" title="موفق">اندازهگیری ثبت شد.</Alert>
    <Alert tone="warn" title="هشدار">یکی از مقادیر خارج از بازه معمول است.</Alert>
    <Alert tone="bad" title="خطا">رضایت صریح بیمار ثبت نشده است.</Alert>
  </div>
) };

export const BadgesAndStats: S = { render: () => (
  <div className="stack">
    <div className="row"><Badge tone="ok">طبیعی</Badge><Badge tone="warn">نیاز به بررسی</Badge><Badge tone="bad">هشدار</Badge></div>
    <div className="grid grid-3">
      <StatCard label="نوبتهای امروز" value="۱۲" hint="۳ منتظر تأیید" tone="info" />
      <StatCard label="نرخ اشغال" value="۸۴٪" hint="هدف ۸۰٪" tone="ok" />
      <StatCard label="غیبتها" value="۲" hint="نیاز به یادآوری" tone="bad" />
    </div>
  </div>
) };

export const Steps: S = { render: () => <Stepper steps={["رضایت", "متن گفتار", "پیشنویس", "بازبینی پزشک"]} current={2} /> };

export const Trends: S = { render: () => (
  <div className="grid grid-2">
    <Sparkline values={[120, 125, 132, 128, 140, 138]} tone="warn" />
    <Sparkline values={[80, 78, 77, 75, 74, 72]} tone="ok" />
  </div>
) };

export const VitalCards: S = { render: () => (
  <div className="grid grid-3">
    <VitalCard label="فشار خون" value="145/92" unit="mmHg" flag="watch" reference="۹۰/۶۰ تا ۱۴۰/۹۰" />
    <VitalCard label="قند خون" value="110" unit="mg/dL" flag="normal" reference="۷۰ تا ۱۴۰" />
    <VitalCard label="اکسیژن" value="88" unit="%" flag="alert" reference="۹۵ تا ۱۰۰" />
  </div>
) };

export const FormsAndEmpty: S = { render: () => (
  <div className="stack">
    <FormField label="مقدار" help="بازه معقول: ۷۰ تا ۱۴۰" error="مقدار خارج از بازه است"><input className="input" /></FormField>
    <EmptyState icon="📭" title="اندازهای ثبت نشده است" description="اولین اندازهگیری را ثبت کنید." />
  </div>
) };

export const Table: S = { render: () => (
  <DataTable headers={["بیمار", "زمان", "وضعیت"]} rows={[["علی احمدی", "امروز ۱۰:۰۰", <Badge key="a" tone="ok">تأییدشده</Badge>], ["مریم رضایی", "فردا ۰۹:۳۰", <Badge key="b" tone="warn">منتظر</Badge>]]} />
) };
