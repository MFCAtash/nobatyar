export interface RecordDetail {
  id: string; title: string; content: string; category: string;
  visitDate: string | null; tags: string[]; createdAt: string; updatedAt: string;
  attachments: { id: string; fileName: string; mimeType: string; sizeBytes: number; createdAt: string }[];
  shares: { id: string; doctorId: string; grantedAt: string; expiresAt: string | null; doctor: { fullName: string } }[];
}
export interface RecordsPage { records: import("@/lib/record-categories").RecordSummary[]; hasMore: boolean; cursor: string | null }
