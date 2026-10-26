import type { ActionDefinition } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const inputSchema = s.requiredObject("The target domain and historical snapshot date.", {
  target: s.string("The target domain, for example ahrefs.com.", { minLength: 1 }),
  date: s.string("The snapshot date in YYYY-MM-DD format.", { format: "date" }),
});

export const ahrefsActions: readonly ActionDefinition[] = [
  defineProviderAction("aisa", {
    name: "get_ahrefs_domain_rating",
    description: "Get Ahrefs Domain Rating and Ahrefs Rank for a domain on a specified date.",
    operationType: "read",
    requiredScopes: [],
    inputSchema,
    outputSchema: s.looseObject("The domain authority snapshot returned by Ahrefs.", {
      domain_rating: s.looseObject("The domain authority measurements.", {
        ahrefs_rank: s.integer("The global Ahrefs Rank."),
        domain_rating: s.number("The Ahrefs Domain Rating from 0 to 100."),
      }),
    }),
  }),
  defineProviderAction("aisa", {
    name: "get_ahrefs_site_metrics",
    description: "Get Ahrefs organic and paid keyword counts, traffic, and traffic value for a domain.",
    operationType: "read",
    requiredScopes: [],
    inputSchema,
    outputSchema: s.looseObject("The site metrics snapshot returned by Ahrefs.", {
      metrics: s.looseObject("The site's keyword and traffic metrics.", {
        org_cost: s.integer("The estimated organic traffic value."),
        org_keywords: s.integer("The organic keyword count."),
        org_keywords_1_3: s.integer("The number of organic keywords ranking in the top three."),
        org_traffic: s.integer("The estimated monthly organic traffic."),
        paid_keywords: s.integer("The paid keyword count."),
      }),
    }),
  }),
];
