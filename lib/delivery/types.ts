import type { DeliveryJob } from "@/app/generated/prisma/client";

export type DeliverySubmission = {
  id: string;
  data: unknown;
  subjectPreview: string | null;
  submitterEmail: string | null;
  origin: string | null;
  createdAt: Date;
  form: { id: string; name: string };
  site: { id: string; name: string };
  files: {
    id: string;
    fieldName: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    r2Key: string;
  }[];
};

export type DeliveryContext = {
  job: DeliveryJob;
  submission: DeliverySubmission;
};

/** Thrown by a handler when retrying could not possibly help. */
export class PermanentDeliveryError extends Error {}
