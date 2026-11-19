import type { JsonSchema } from "../../../core/types.ts";

import { s } from "../../../core/json-schema.ts";

/** The jurisdictions R2 accepts in the `cf-r2-jurisdiction` header and in the S3 endpoint host. */
export const jurisdictions: readonly string[] = ["default", "eu", "fedramp", "us"];

export const readPermissions: readonly string[] = ["Workers R2 Storage Read"];

export const writePermissions: readonly string[] = ["Workers R2 Storage Write"];

export const bucketNameSchema: JsonSchema = s.string("The R2 bucket name.", {
  minLength: 3,
  maxLength: 64,
});

export const jurisdictionSchema: JsonSchema = s.stringEnum(
  "The jurisdiction where objects in the bucket are guaranteed to be stored.",
  jurisdictions,
);

export const storageClassSchema: JsonSchema = s.stringEnum("The default storage class for newly uploaded objects.", [
  "Standard",
  "InfrequentAccess",
]);

export const objectKeySchema: JsonSchema = s.nonEmptyString(
  "The complete R2 object key. Slashes are preserved as key delimiters.",
);

export const bucketJobStatuses: readonly string[] = ["ENQUEUED", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"];

export const bucketJobSchema: JsonSchema = s.object(
  "A background job running against an R2 bucket.",
  {
    jobId: s.string("The job identifier used to poll the job."),
    jobType: s.string("The job kind, currently always prefixDelete."),
    status: s.stringEnum("The job lifecycle status.", bucketJobStatuses),
    startTime: s.optional(s.string("When the job was created.")),
    endTime: s.optional(s.string("When the job finished. Absent while the job is still enqueued or running.")),
    prefix: s.optional(s.string("The key prefix matched by the job. An empty string means the entire bucket.")),
    deletedObjects: s.optional(s.integer("The number of objects deleted by the job so far.")),
    isBucketClear: s.optional(s.boolean("Whether the job was created to clear the entire bucket.")),
  },
  { optional: ["startTime", "endTime", "prefix", "deletedObjects", "isBucketClear"] },
);
