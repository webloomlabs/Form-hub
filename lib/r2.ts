import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Cloudflare R2 via the S3 API. Objects are always private; access is granted
 * through short-lived presigned URLs, never a public bucket.
 */

let client: S3Client | null = null;

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME,
  );
}

function getClient(): S3Client {
  if (client) return client;
  if (!isR2Configured()) throw new Error("R2 is not configured");
  client = new S3Client({
    region: "auto",
    // R2_ENDPOINT lets local dev point at MinIO (or any S3-compatible store)
    // instead of Cloudflare. Unset in production.
    endpoint:
      process.env.R2_ENDPOINT ||
      `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    // MinIO needs path-style addressing; R2 accepts it too.
    forcePathStyle: Boolean(process.env.R2_ENDPOINT),
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  return client;
}

function bucket(): string {
  return process.env.R2_BUCKET_NAME!;
}

export async function putFile(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

/** Presigned GET. `expiresIn` is seconds; defaults to 24 hours. */
export async function signedFileUrl(
  key: string,
  expiresIn = 86400,
): Promise<string> {
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: bucket(), Key: key }),
    { expiresIn },
  );
}

export async function deleteFile(key: string): Promise<void> {
  await getClient().send(
    new DeleteObjectCommand({ Bucket: bucket(), Key: key }),
  );
}

/** Object key layout: agency/<agencyId>/sub/<submissionId>/<random>-<name> */
export function buildFileKey(
  agencyId: string,
  submissionId: string,
  fileName: string,
): string {
  const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, "_").slice(-100);
  const nonce = crypto.randomUUID();
  return `agency/${agencyId}/sub/${submissionId}/${nonce}-${safeName}`;
}
