import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "semrush" as const;

const semrushDatabaseSchema = s.string("The Semrush regional database code, such as us, uk, de, or mobile-us.", {
  minLength: 1,
});

const domainSchema = s.string("The domain name to analyze, such as example.com.", {
  minLength: 1,
});

const displayLimitSchema = s.integer("The maximum number of Semrush rows to request.", {
  minimum: 1,
  maximum: 10000,
});

const displayOffsetSchema = s.integer("The one-based Semrush row offset to start from.", {
  minimum: 1,
});

const displayDateSchema = s.string(
  "The Semrush historical snapshot date in YYYYMM15 format when the report supports it.",
  { minLength: 8, maxLength: 8 },
);

const csvValueSchema = s.anyOf("One parsed Semrush CSV field value.", [
  s.string("A text Semrush CSV field value."),
  s.number("A numeric Semrush CSV field value."),
  { type: "null", description: "A blank Semrush CSV field value." },
]);

const csvRowSchema = s.record("One normalized Semrush CSV row keyed by Semrush column name.", csvValueSchema);

const semrushCsvReportOutputSchema = s.object("The normalized Semrush CSV report response.", {
  rows: s.array("The report rows returned by Semrush.", csvRowSchema),
  totalRows: s.integer("The number of rows returned by Semrush."),
  rawHeader: s.array("The raw Semrush CSV header columns.", s.string("One Semrush CSV column.")),
  rawText: s.string("The raw Semrush response text."),
});

const domainRankAction = defineProviderAction(service, {
  name: "get_domain_overview",
  description: "Get Semrush domain overview metrics from a regional SEO database.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for requesting a Semrush domain overview report.", {
    domain: domainSchema,
    database: semrushDatabaseSchema,
  }),
  outputSchema: semrushCsvReportOutputSchema,
});

const domainOrganicKeywordsAction = defineProviderAction(service, {
  name: "list_domain_organic_keywords",
  description: "List organic search keywords for a domain from a Semrush regional database.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for requesting Semrush domain organic keyword rows.",
    {
      domain: domainSchema,
      database: semrushDatabaseSchema,
      display_limit: displayLimitSchema,
      display_offset: displayOffsetSchema,
      display_date: displayDateSchema,
    },
    { optional: ["display_limit", "display_offset", "display_date"] },
  ),
  outputSchema: semrushCsvReportOutputSchema,
});

const organicCompetitorsAction = defineProviderAction(service, {
  name: "list_organic_competitors",
  description: "List organic search competitors for a domain from a Semrush regional database.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for requesting Semrush organic competitor rows.",
    {
      domain: domainSchema,
      database: semrushDatabaseSchema,
      display_limit: displayLimitSchema,
      display_offset: displayOffsetSchema,
      display_date: displayDateSchema,
    },
    { optional: ["display_limit", "display_offset", "display_date"] },
  ),
  outputSchema: semrushCsvReportOutputSchema,
});

export const semrushActions: ActionDefinition[] = [
  domainRankAction,
  domainOrganicKeywordsAction,
  organicCompetitorsAction,
];
