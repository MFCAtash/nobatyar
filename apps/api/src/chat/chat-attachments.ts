import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { ALLOWED_MIME, MAX_FILE_BYTES } from "../storage/storage.service";
import type { StorageService } from "../storage/storage.service";
import { isOwnChatObjectKey, verifyAttachment } from "./chat-policy";
import type { Attachment, SendMessageInput } from "./chat-types";

/**
 * اعتبارسنجی نوع/محتوای پیام پیش از درج. پیوست: کلید باید مال خودِ فرستنده باشد؛ نوع و حجم «از MinIO» می‌آید نه از ادعای کلاینت.
 * ⇒ null برای پیام متنی؛ Attachment برای FILE/IMAGE؛ در غیر این صورت استثنا.
 */
export async function validateOutgoing(storage: Pick<StorageService, "headObject">, userId: string, dto: SendMessageInput): Promise<Attachment | null> {
  let attachment: Attachment | null = null;
  if (dto.kind === "FILE" || dto.kind === "IMAGE") {
    if (!dto.objectKey) throw new BadRequestException("objectKey برای پیام فایل الزامی است");
    if (!isOwnChatObjectKey(userId, dto.objectKey)) throw new ForbiddenException("کلید فایل نامعتبر است");
    const head = await storage.headObject("chat", dto.objectKey);
    if (!head) throw new ForbiddenException("فایل هنوز آپلود نشده است");
    const v = verifyAttachment(head, { mime: dto.attachmentMime, bytes: dto.attachmentBytes }, ALLOWED_MIME.chat ?? [], MAX_FILE_BYTES);
    if (!v.ok) throw new ForbiddenException(`پیوست نامعتبر: ${v.error}`);
    if (dto.kind === "IMAGE" && !v.value.mime.startsWith("image/")) throw new ForbiddenException("پیوست نامعتبر: kind_mime_mismatch");
    attachment = { key: dto.objectKey, ...v.value };
  } else if (dto.objectKey) {
    throw new BadRequestException("پیام متنی نباید objectKey داشته باشد");
  }
  if (dto.kind === "TEXT" && !(dto.body ?? "").trim()) throw new BadRequestException("پیام خالی است");
  if (dto.kind === "SYSTEM") throw new ForbiddenException("پیام سیستمی از طرف کاربر مجاز نیست");
  return attachment;
}
