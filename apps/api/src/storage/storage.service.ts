import type { S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import { loadStorageConfig, type StorageConfig } from "./storage.config";
import { moduleEnabled } from "../common/feature-flags";
import { PrismaService } from "../prisma/prisma.service";
import { analyzeFile, assertServable, initialState, normalizeMime, SECURE_ALLOWED_MIME, transition, verdictToEvent, type FileBucket, type QuarantineState } from "./file-security";
import { loadScanProviderFromEnv } from "./scan-provider";

/** حداکثر اندازه فایل — ۲۰ مگابایت */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** انواع MIME مجاز */
export const ALLOWED_MIME: Record<string, string[]> = {
  chat: [
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "application/pdf",
    "text/plain",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  records: [
    "image/jpeg", "image/png", "image/dicom", "image/tiff",
    "application/pdf",
    "text/plain",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
};

export interface UploadToken {
  uploadId:  string;
  objectKey: string;
  /** URL برای PUT مستقیم از browser — اعتبار ۵ دقیقه */
  presignedPut: string;
}

export interface DownloadUrl {
  url:      string;
  fileName: string;
  /** زمان انقضا (Unix ms) */
  expiresAt: number;
}

/**
 * StorageService — لایه انتزاعی بالای MinIO/S3.
 *
 * در فاز ۶ از @aws-sdk/client-s3 + presigned URL استفاده می‌شود.
 * MinIO با S3 API سازگار است — فقط endpoint فرق دارد.
 *
 * جریان آپلود امن (browser نمی‌تواند objectKey را جعل کند):
 *   ۱. client → POST /storage/upload-token  { bucket, mime, bytes }
 *   ۲. سرور اعتبارسنجی MIME و اندازه → presigned PUT URL می‌سازد
 *   ۳. client → PUT presignedUrl (مستقیم به MinIO، از سرور ما رد نمی‌شود)
 *   ۴. client → POST /chat/:id/messages  { objectKey, ... }
 *   ۵. سرور objectKey را در DB ثبت می‌کند
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /* sdk و تنظیمات به‌صورت lazy (start-up در توسعه/تست بدون MinIO هم کار کند؛ در production main.ts پیش‌تر loadStorageConfig را fail-closed اجرا می‌کند) */
  private cfg: StorageConfig | null = null;
  /** HEAD/DELETE: از مسیر «داخلی» شبکه‌ی docker */
  private s3Client: S3Client | null = null;
  /** presign (محاسبه‌ی آفلاین امضا): با آدرس «عمومی»، چون Host داخل امضا است و مرورگر به همان وصل می‌شود */
  private presignClient: S3Client | null = null;

  private get config(): StorageConfig {
    return (this.cfg ??= loadStorageConfig());
  }

  private get bucketName(): string {
    return this.config.bucket;
  }

  private async makeClient(endpoint: string): Promise<S3Client> {
    const { S3Client } = await import("@aws-sdk/client-s3");
    const c = this.config;
    return new S3Client({
      endpoint,
      region:         c.region,
      forcePathStyle: true,
      credentials:    { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
    });
  }

  private async getClient() {
    return (this.s3Client ??= await this.makeClient(this.config.endpoint));
  }

  private async getPresignClient() {
    return (this.presignClient ??= await this.makeClient(this.config.publicEndpoint));
  }

  /**
   * مرحله ۱: ساخت presigned PUT URL
   */
  async createUploadToken(
    bucket: "chat" | "records",
    mime:   string,
    bytes:  number,
    userId: string,
  ): Promise<UploadToken> {
    if (bytes > MAX_FILE_BYTES)
      throw new BadRequestException(`حداکثر اندازه فایل ${MAX_FILE_BYTES / 1024 / 1024} مگابایت است`);

    const secure = moduleEnabled("FF_M6_SMART_FILES");
    const normalized = secure ? normalizeMime(mime) : mime;
    const allowed = secure ? SECURE_ALLOWED_MIME[bucket] : (ALLOWED_MIME[bucket] ?? []);
    if (!allowed.includes(normalized))
      throw new BadRequestException(`نوع فایل ${mime} مجاز نیست`);

    const ext       = normalized.split("/")[1]?.replace("vnd.openxmlformats-officedocument.wordprocessingml.document","docx")
                          .replace("vnd.openxmlformats-officedocument.spreadsheetml.sheet","xlsx") ?? "bin";
    const uploadId  = randomUUID();
    const objectKey = `${bucket}/${userId}/${uploadId}.${ext}`;

    const client    = await this.getPresignClient();
    const { getSignedUrl }   = await import("@aws-sdk/s3-request-presigner");
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");

    const presignedPut = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket:      this.bucketName,
        Key:         objectKey,
        ContentType: mime,
        ContentLength: bytes,
        Metadata:    { "x-uploader": userId, "x-upload-id": uploadId },
      }),
      { expiresIn: 300 }, // ۵ دقیقه
    );

    return { uploadId, objectKey, presignedPut };
  }

  /**
   * مرحله ۳: ساخت presigned GET URL برای دانلود موقت
   */
  async createDownloadUrl(
    bucket:    "chat" | "records",
    objectKey: string,
    fileName:  string,
    ttlSec     = 60,
  ): Promise<DownloadUrl> {
    await this.assertServable(objectKey);
    const client = await this.getPresignClient();
    const { getSignedUrl }    = await import("@aws-sdk/s3-request-presigner");
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");

    const url = await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket:                     this.bucketName,
        Key:                        objectKey,
        ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      }),
      { expiresIn: ttlSec },
    );

    return { url, fileName, expiresAt: Date.now() + ttlSec * 1000 };
  }

  /** A6: نوشتن شیء خروجی توسط سرویس (فقط مسیرهای ادمین/انطباق، با رمزنگاری سمتسرور). */
  async putTextObject(bucket: "chat" | "records", objectKey: string, body: string, contentType = "application/json"): Promise<void> {
    const client = await this.getClient();
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: objectKey,
      Body: Buffer.from(body, "utf8"),
      ContentType: contentType,
      ServerSideEncryption: "AES256",
    }));
  }

  /**
   * حذف آبجکت (مثلاً وقتی پیام حذف می‌شود)
   */
  /** بدون اسکن تأییدشده، هیچ لینک دانلودی صادر نمی‌شود (fail-closed). */
  private async assertServable(objectKey: string): Promise<void> {
    if (!moduleEnabled("FF_M6_SMART_FILES")) return;
    const row = await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.fileAnalysis.findFirst({ where: { objectKey }, select: { state: true }, orderBy: { createdAt: "desc" } }),
    );
    if (!row) throw new BadRequestException({ error: "file_not_scanned" });
    assertServable(row.state as QuarantineState);
  }

  /** مرحله ۴ (M6): تحلیل محتوا + قرنطینه + اسکن + تعیین وضعیت نهایی. */
  async finalizeUpload(
    bucket: FileBucket,
    objectKey: string,
    declaredMime: string,
    size: number,
  ): Promise<{ objectKey: string; state: QuarantineState; detectedMime: string }> {
    if (!moduleEnabled("FF_M6_SMART_FILES")) throw new BadRequestException({ error: "module_disabled" });
    if (!objectKey.startsWith(`${bucket}/`)) throw new BadRequestException({ error: "invalid_object_key" });

    const client = await this.getClient();
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const obj = await client.send(new GetObjectCommand({ Bucket: this.bucketName, Key: objectKey }));
    const body = obj.Body;
    if (!body || typeof body.transformToByteArray !== "function") {
      throw new BadRequestException({ error: "file_unreadable" });
    }
    const bytes = new Uint8Array(await body.transformToByteArray());

    const decision = analyzeFile({ bytes, size, bucket, declaredMime });
    let state: QuarantineState = initialState(decision);
    const row = await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.fileAnalysis.create({
        data: {
          objectKey,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          mime: decision.detectedMime,
          bytes: BigInt(size),
          state,
        },
      }),
    );

    let rejectReason: string | null = null;
    if (!decision.ok) {
      rejectReason = decision.code;
    } else {
      state = transition(state, "START_SCAN");
      const result = await loadScanProviderFromEnv().scan({
        objectKey,
        bucket,
        bytes,
        detectedMime: decision.detectedMime,
      });
      state = transition(state, verdictToEvent(result.verdict));
      if (state === "REJECTED") rejectReason = result.signature ?? result.detail;
    }

    await this.prisma.withContext({ role: "SYSTEM" }, (tx) =>
      tx.fileAnalysis.update({ where: { id: row.id }, data: { state } }),
    );

    if (state === "REJECTED") {
      await this.deleteObject(bucket, objectKey);
      throw new BadRequestException({ error: "file_rejected", reason: rejectReason });
    }
    return { objectKey, state, detectedMime: decision.detectedMime };
  }

  async deleteObject(bucket: "chat" | "records", objectKey: string): Promise<void> {
    try {
      const client = await this.getClient();
      const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
      await client.send(new DeleteObjectCommand({ Bucket: this.bucketName, Key: objectKey }));
    } catch (err) {
      this.logger.warn(`deleteObject failed: ${objectKey}`, err);
    }
  }

  /**
   * بررسی وجود آبجکت (بعد از آپلود client — تأیید می‌کنیم فایل واقعاً آپلود شده)
   */
  async headObject(
    bucket:    "chat" | "records",
    objectKey: string,
  ): Promise<{ size: number; mime: string } | null> {
    try {
      const client = await this.getClient();
      const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
      const r = await client.send(new HeadObjectCommand({ Bucket: this.bucketName, Key: objectKey }));
      return { size: r.ContentLength ?? 0, mime: r.ContentType ?? "application/octet-stream" };
    } catch {
      return null;
    }
  }
}
