/**
 * پیکربندی object storage (MinIO/S3) — fail-closed در production، مثل بقیه‌ی loader ها (auth/payment/video…).
 *
 * دو آدرس لازم است (چون آپلود/دانلود مستقیم بین «مرورگر» و MinIO انجام می‌شود، نه از API):
 *   endpoint        آدرس «داخلی» (http://minio:9000) برای HEAD/DELETE از سمت API
 *   publicEndpoint  آدرس «عمومی» (https://<STORAGE_DOMAIN>) که داخل presigned URL ها می‌رود و مرورگر به آن وصل می‌شود
 * امضای SigV4 به Host وابسته است ⇒ presign باید با publicEndpoint ساخته شود و پروکسی (Caddy) Host را دست‌نخورده بدهد.
 */
export interface StorageConfig {
  endpoint: string;
  publicEndpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

type Env = Record<string, string | undefined>;
const v = (e: Env, k: string): string | undefined => (e[k] === undefined || e[k] === "" ? undefined : e[k]);

function parseUrl(name: string, value: string, opts: { https: boolean }): string {
  let u: URL;
  try { u = new URL(value); } catch { throw new Error(`${name} must be a valid URL`); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error(`${name} must be http(s)`);
  if (opts.https && u.protocol !== "https:") throw new Error(`${name} must be https in production`);
  if (u.pathname !== "/" || u.search || u.hash || u.username) throw new Error(`${name} must be an origin only (no path, query or credentials)`);
  return u.origin;
}

export function loadStorageConfig(env: Env = process.env): StorageConfig {
  const prod = env.NODE_ENV === "production";
  const bucket = v(env, "MINIO_BUCKET") ?? "nobatyar-private";
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error("MINIO_BUCKET must be 3-63 chars of [a-z0-9.-]");

  if (prod) {
    for (const k of ["MINIO_ENDPOINT", "MINIO_PUBLIC_ENDPOINT", "MINIO_ACCESS_KEY", "MINIO_SECRET_KEY"]) {
      if (!v(env, k)) throw new Error(`${k} is required in production (object storage)`);
    }
  }
  const endpoint = parseUrl("MINIO_ENDPOINT", v(env, "MINIO_ENDPOINT") ?? "http://127.0.0.1:9000", { https: false });
  const publicEndpoint = parseUrl("MINIO_PUBLIC_ENDPOINT", v(env, "MINIO_PUBLIC_ENDPOINT") ?? endpoint, { https: prod });

  // توسعه: سازگاری با docker-compose.yml ی dev که فقط MINIO_ROOT_USER/PASSWORD دارد
  const accessKeyId = v(env, "MINIO_ACCESS_KEY") ?? (prod ? undefined : v(env, "MINIO_ROOT_USER"));
  const secretAccessKey = v(env, "MINIO_SECRET_KEY") ?? (prod ? undefined : v(env, "MINIO_ROOT_PASSWORD"));
  if (!accessKeyId || !secretAccessKey) throw new Error("MINIO_ACCESS_KEY and MINIO_SECRET_KEY are required for object storage");

  if (prod) {
    if (accessKeyId === v(env, "MINIO_ROOT_USER")) throw new Error("MINIO_ACCESS_KEY must be a scoped service user, not MINIO_ROOT_USER");
    if (secretAccessKey.length < 20) throw new Error("MINIO_SECRET_KEY must be at least 20 characters");
    if (/^(change-?me|changeme|nobatyar_secret|minioadmin)/i.test(secretAccessKey) || accessKeyId === "minioadmin") throw new Error("MINIO credentials are placeholders/defaults");
  }
  return { endpoint, publicEndpoint, region: v(env, "MINIO_REGION") ?? "us-east-1", bucket, accessKeyId, secretAccessKey };
}
