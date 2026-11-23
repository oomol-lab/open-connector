import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
export const marketplace: JsonSchema = s.stringEnum("Amazon marketplace code.", [
  "AE",
  "AU",
  "BR",
  "CA",
  "DE",
  "ES",
  "FR",
  "IN",
  "IT",
  "JP",
  "MX",
  "UK",
  "US",
]);

export function range(description: string): JsonSchema {
  return s.object(
    description,
    {
      min: s.number("Minimum value."),
      max: s.number("Maximum value."),
    },
    { required: [] },
  );
}

export const researchOutputSchema: JsonSchema = s.requiredObject(
  "Research result returned by the SellerSprite V2 tool.",
  {
    result: s.unknown("Structured upstream research data. Fields vary by tool; new fields are preserved."),
  },
);
