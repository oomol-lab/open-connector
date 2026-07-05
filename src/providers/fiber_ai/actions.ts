import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "fiber_ai";

const enumTypeValues = [
  "accelerators",
  "flight_regions",
  "industries",
  "languages",
  "metro_areas",
  "naics_codes",
  "regions",
  "skills",
  "tags",
  "technologies",
  "time_zones",
];

const rawObjectSchema = s.looseObject("Raw object returned by the Fiber AI API.");
const chargeInfoSchema = s.looseObject("Fiber AI charge reconciliation object returned by the API.");
const warningSchema = s.looseObject("A warning object returned by the Fiber AI API.");

const commonFiberOutputSchema = s.object("A normalized Fiber AI API response.", {
  output: rawObjectSchema,
  chargeInfo: chargeInfoSchema,
  warnings: s.nullable(s.array("Warnings returned by Fiber AI, when present.", warningSchema)),
  advice: s.array("Advice strings returned by Fiber AI.", s.string("A Fiber AI advice string.")),
  raw: rawObjectSchema,
});

const emptyInputSchema = s.object("No input parameters are required for this Fiber AI action.", {});

const listEnumValuesInputSchema = s.oneOf(
  [
    s.object("Input parameters for listing country subdivisions.", {
      enumType: s.literal("subdivisions", { description: "Retrieve the Fiber AI subdivisions dataset." }),
      countryCode: s.string({
        description: "ISO 3166-1 alpha-2 or alpha-3 country code required for subdivisions.",
        minLength: 2,
        maxLength: 3,
      }),
    }),
    s.object("Input parameters for listing a Fiber AI enum dataset.", {
      enumType: s.stringEnum("The Fiber AI enum dataset to retrieve.", enumTypeValues),
    }),
  ],
  { description: "Input parameters for listing a Fiber AI enum or reference dataset." },
);

export const fiberAiActions: Array<ProviderActionDefinition<FiberAiActionName>> = [
  defineProviderAction(service, {
    name: "get_org_credits",
    description: "Get Fiber AI organization credit balance and per-operation pricing metadata.",
    inputSchema: emptyInputSchema,
    outputSchema: commonFiberOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_rate_limits",
    description: "Get Fiber AI rate limits for the current organization.",
    inputSchema: emptyInputSchema,
    outputSchema: commonFiberOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_enum_values",
    description: "List a free Fiber AI enum or reference dataset such as regions or industries.",
    inputSchema: listEnumValuesInputSchema,
    outputSchema: commonFiberOutputSchema,
  }),
];

export type FiberAiActionName = "get_org_credits" | "get_rate_limits" | "list_enum_values";
