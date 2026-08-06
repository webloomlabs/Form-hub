import { buildFileKey, deleteFile, isR2Configured, putFile } from "@/lib/r2";
import { describeError } from "@/lib/errors";
import type { ParsedFile } from "./parse";

/**
 * Uploads happen before the submission transaction commits, because the file
 * rows need R2 keys. If R2 fails we still commit the text — losing an
 * attachment is recoverable (the submitter can be asked to resend it), losing
 * the enquiry is not.
 */

export type UploadOutcome = {
  stored: {
    fieldName: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    r2Key: string;
  }[];
  error: string | null;
};

export function validateFiles(
  files: ParsedFile[],
  form: { maxTotalUploadBytes: number; allowedMimeTypes: string[] },
): string | null {
  const total = files.reduce((sum, f) => sum + f.size, 0);
  if (total > form.maxTotalUploadBytes) {
    const limit = form.maxTotalUploadBytes;
    const readable =
      limit >= 1_000_000
        ? `${(limit / 1_000_000).toFixed(limit % 1_000_000 === 0 ? 0 : 1)}MB`
        : `${Math.max(1, Math.round(limit / 1000))}KB`;
    return `Attachments exceed the ${readable} limit`;
  }

  if (form.allowedMimeTypes.length > 0) {
    const allowed = new Set(form.allowedMimeTypes.map((m) => m.toLowerCase()));
    const rejected = files.find((f) => !allowed.has(f.mimeType.toLowerCase()));
    if (rejected) {
      return `File type not allowed: ${rejected.mimeType}`;
    }
  }

  return null;
}

/**
 * `submissionId` is generated ahead of the insert so the object key can embed
 * it — that keeps R2 objects traceable back to a row even if the commit fails.
 */
export async function storeFiles(
  files: ParsedFile[],
  agencyId: string,
  submissionId: string,
): Promise<UploadOutcome> {
  if (files.length === 0) return { stored: [], error: null };
  if (!isR2Configured()) {
    return { stored: [], error: "File storage is not configured" };
  }

  const stored: UploadOutcome["stored"] = [];

  try {
    for (const file of files) {
      const key = buildFileKey(agencyId, submissionId, file.fileName);
      await putFile(key, file.data, file.mimeType);
      stored.push({
        fieldName: file.fieldName,
        fileName: file.fileName,
        mimeType: file.mimeType,
        sizeBytes: file.size,
        r2Key: key,
      });
    }
    return { stored, error: null };
  } catch (error) {
    // Roll back whatever landed so a partial upload doesn't leave orphans.
    await Promise.allSettled(stored.map((s) => deleteFile(s.r2Key)));
    return { stored: [], error: describeError(error).slice(0, 400) };
  }
}
