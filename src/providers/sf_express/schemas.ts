import { s } from "../../core/json-schema.ts";

/** The SF date-time format (yyyy-MM-dd HH:mm:ss) shared by SF Express endpoint schemas. */
export const dateTimeSchema = (description: string): ReturnType<typeof s.string> =>
  s.string(description, { pattern: "^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}$" });

export const waybillNoSchema: ReturnType<typeof s.nonEmptyString> = s.nonEmptyString(
  "The SF Express waybill number (顺丰运单号).",
);
