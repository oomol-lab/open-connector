import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "predictleads";
const companyInputSchema = s.requiredObject("A company identified by its website domain.", {
  domain: s.nonEmptyString("The company website domain, such as example.com."),
});
const pageInputSchema = s.object(
  "A company domain and native PredictLeads pagination controls.",
  {
    domain: s.nonEmptyString("The company website domain, such as example.com."),
    page: s.positiveInteger("The one-based page number to return."),
    limit: s.integer("The maximum number of records to return per page.", { minimum: 1, maximum: 1000 }),
  },
  { optional: ["page", "limit"] },
);
const resourceSchema = s.looseRequiredObject("A PredictLeads JSON:API resource object.", {
  id: s.string("The stable PredictLeads resource identifier."),
  type: s.string("The PredictLeads resource type."),
});
const datasetOutputSchema = s.object(
  "A PredictLeads JSON:API dataset response.",
  {
    data: s.array("The primary resources returned by PredictLeads.", resourceSchema),
    included: s.array(
      "Related resources referenced by the primary resources.",
      s.looseRequiredObject("A related PredictLeads JSON:API resource object.", {}),
    ),
    meta: s.looseRequiredObject("Pagination and dataset metadata returned by PredictLeads.", {}),
  },
  { optional: ["included", "meta"] },
);

export const predictleadsActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "lookup_company",
    operationType: "read",
    description: "Retrieve PredictLeads company firmographic data for a website domain.",
    inputSchema: companyInputSchema,
    outputSchema: datasetOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_job_openings",
    operationType: "read",
    description: "List job openings detected for a company domain.",
    inputSchema: pageInputSchema,
    outputSchema: datasetOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_news_events",
    operationType: "read",
    description: "List news events detected for a company domain.",
    inputSchema: pageInputSchema,
    outputSchema: datasetOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_technology_detections",
    operationType: "read",
    description: "List technologies detected on or associated with a company domain.",
    inputSchema: pageInputSchema,
    outputSchema: datasetOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_financing_events",
    operationType: "read",
    description: "List financing events detected for a company domain.",
    inputSchema: pageInputSchema,
    outputSchema: datasetOutputSchema,
  }),
];
