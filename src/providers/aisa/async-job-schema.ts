import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";

export const aisaJobSubmissionProperties: Record<string, JsonSchema> = {
  maxPriceUsd: s.string("Optional AIsa admission authorization in USD; not a guarantee of the final charge.", {
    minLength: 1,
  }),
};

export const aisaJobTaskId: JsonSchema = s.string("Task ID returned by submission; use it with the same connection.", {
  minLength: 1,
});

export const aisaJobOutput: JsonSchema = s.looseObject(
  "The job state, output and authoritative final pricing when available.",
  {
    taskId: aisaJobTaskId,
    status: s.string("Job state: queued, running, completed, failed or cancelled."),
    output: s.unknown("Upstream task output; may be unavailable before completion or after expiry."),
    outputExpired: s.nullable(s.boolean("Whether the upstream output has expired.")),
    error: s.nullable(s.looseObject("Upstream job error details.")),
    pricing: s.nullable(
      s.looseObject(
        "AIsa pricing information, in micro-USD.",
        {
          authorizedMicrosUSD: s.nullable(s.integer("Initially authorized amount; not the final charge.")),
          finalMicrosUSD: s.nullable(s.integer("Final customer charge; null means unknown, zero means no charge.")),
          currency: s.nullable(s.string("Pricing currency.")),
          billingMode: s.nullable(s.string("AIsa billing mode.")),
        },
        { required: [] },
      ),
    ),
  },
  { required: [] },
);
