import { z } from "zod";

/** schema های ورودی پرونده‌ی سلامت (جدا از سرویس تا OpenAPI به DI/Prisma/MinIO وابسته نشود). */
export const CreateRecordSchema = z.object({
  title: z.string().trim().min(2).max(120),
  content: z.string().max(8000).default(""),
  category: z.enum(["NOTE", "LAB_RESULT", "IMAGING", "PRESCRIPTION", "DISCHARGE_SUMMARY", "REFERRAL", "VACCINATION", "OTHER"]).default("NOTE"),
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
}).strict();
export const UpdateRecordSchema = CreateRecordSchema.partial();
export const AddAttachmentSchema = z.object({
  objectKey: z.string().max(500), fileName: z.string().trim().min(1).max(255), mimeType: z.string().max(80), sizeBytes: z.number().int().min(1).max(20 * 1024 * 1024),
}).strict();
export const ShareSchema = z.object({ doctorId: z.string().uuid(), expiresAt: z.string().datetime().optional() }).strict();
export type CreateRecordInput = z.infer<typeof CreateRecordSchema>;
