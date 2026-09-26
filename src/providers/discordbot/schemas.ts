import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";

export const noInputSchema: JsonSchema = s.object({}, { description: "No input parameters are required." });
export const rawObjectSchema: JsonSchema = s.looseObject({}, { description: "A raw Discord API object." });
export const snowflakeSchema: JsonSchema = s.string("A Discord snowflake identifier.", { minLength: 1 });
export const successSchema: JsonSchema = s.requiredObject("The success response returned by the action.", {
  success: s.literal(true, { description: "The success flag." }),
});
export const binaryFileSchema: JsonSchema = s.requiredObject("A binary file payload encoded for transport.", {
  filename: s.string("The file name."),
  mimeType: s.string("The MIME type."),
  sizeBytes: s.integer("The file size in bytes."),
  dataBase64: s.string("The file contents encoded as base64."),
});
export const auditLogReasonSchema: JsonSchema = s.string(
  "The reason recorded in the guild audit log for this change.",
  {
    minLength: 1,
    maxLength: 512,
  },
);
