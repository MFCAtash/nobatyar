import type { Meta, StoryObj } from "@storybook/react";
import { noop, recordDetail, recordSummaries } from "@/stories/fixtures";
import { RecordDetailView } from "./RecordDetailView";
import { RecordsListView } from "./RecordsListView";

const meta = {
  title: "Records/List", component: RecordsListView,
  args: { records: recordSummaries, loading: false, loadingMore: false, error: null, category: "", hasMore: true, onCategory: noop, onMore: noop, onAdd: noop },
} satisfies Meta<typeof RecordsListView>;
export default meta;
type S = StoryObj<typeof meta>;
export const Default: S = {};
export const Loading: S = { args: { records: [], loading: true } };
export const Empty: S = { args: { records: [], hasMore: false } };
export const Filtered: S = { args: { category: "LAB_RESULT", records: recordSummaries.slice(0, 1) } };
export const ErrorState: S = { args: { records: [], error: "دریافت پرونده‌ها ناموفق بود." } };

export const Detail: StoryObj = {
  render: () => <RecordDetailView rec={recordDetail} isOwner uploading={false} uploadError={null} onBack={noop} onPickFile={noop} onDownload={noop} onShare={noop} onRevoke={noop} />,
};
export const DetailDoctorView: StoryObj = {
  render: () => <RecordDetailView rec={recordDetail} isOwner={false} uploading={false} uploadError={null} onBack={noop} onPickFile={noop} onDownload={noop} onShare={noop} onRevoke={noop} />,
};
export const DetailUploading: StoryObj = {
  render: () => <RecordDetailView rec={{ ...recordDetail, attachments: [], shares: [] }} isOwner uploading uploadError="حداکثر ۲۰ مگابایت" onBack={noop} onPickFile={noop} onDownload={noop} onShare={noop} onRevoke={noop} />,
};
