import type { MessageKind } from "@prisma/client";

export interface SendMessageInput {
  conversationId: string;
  body?: string;
  kind: MessageKind;
  objectKey?: string;
  attachmentName?: string;
  attachmentMime?: string;
  attachmentBytes?: number;
}

export const PAGE_SIZE = 40;

export interface Attachment { key: string; mime: string; bytes: number }
