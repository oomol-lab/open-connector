import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { patsnapResultSchema } from "./schemas.ts";

// Sourced from the official MCP service page. JSON arrays with undocumented element shapes remain permissive.
const landscapeQueryInput = s.requiredObject("Patsnap MCP tool arguments.", {
  collapse_order_authority: s.optional(
    s.array("Patent dedup sort rules | JSON array", s.unknown("One item in this list.")),
  ),
  sort: s.optional(s.array("Field sort | JSON array", s.unknown("One item in this list."))),
  collapse_order: s.optional(s.string("Patent dedup sort rules")),
  query_text: s.string("Analytics query | max 12000 characters", { maxLength: 12000 }),
  collapse_type: s.optional(s.string("Patent dedup condition")),
  collapse_by: s.optional(s.string("Patent dedup sort field")),
});

const lifeCycleInput = s.requiredObject("Patsnap MCP tool arguments.", {
  collapse_order_authority: s.optional(
    s.array("Patent dedup sort rules | JSON array", s.unknown("One item in this list.")),
  ),
  sort: s.optional(s.array("Field sort | JSON array", s.unknown("One item in this list."))),
  collapse_order: s.optional(s.string("Patent dedup sort rules")),
  query_text: s.string("Analytics query | max 800 characters", { maxLength: 800 }),
  collapse_type: s.optional(s.string("Patent dedup condition")),
  collapse_by: s.optional(s.string("Patent dedup sort field")),
});

const detailSearchInput = s.requiredObject("Patsnap MCP tool arguments.", {
  patent_id: s.optional(s.string("Patent ID")),
  offset: s.optional(s.integer("<=20000", { minimum: 0, maximum: 20000 })),
  replace_by_related: s.optional(
    s.integer("Replace with patent family when full text unavailable | 1 yes, 0 no", {
      minimum: 0,
      maximum: 1,
    }),
  ),
  stemming: s.optional(s.integer("Truncation feature | 1 enable, 0 disable", { minimum: 0, maximum: 1 })),
  sort: s.optional(s.array("Field sort | JSON array", s.unknown("One item in this list."))),
  lang: s.string("cn/en/jp"),
  query_text: s.string("Analytics query | max 1500 characters", { maxLength: 1500 }),
  pn: s.optional(s.string("Patent publication number")),
  collapse_type: s.optional(s.string("Patent dedup condition")),
  collapse_by: s.optional(s.array("Patent dedup sort rules | JSON array", s.unknown("One item in this list."))),
  posiofpat: s.optional(s.string("first/last")),
});

const searchV3Input = s.requiredObject("Patsnap MCP tool arguments.", {
  offset: s.optional(s.integer("<=20000", { minimum: 0, maximum: 20000 })),
  stemming: s.optional(s.integer("Truncation feature | 1 enable, 0 disable", { minimum: 0, maximum: 1 })),
  sort: s.optional(s.array("Field sort | JSON array", s.unknown("One item in this list."))),
  query_text: s.string("Analytics query | max 1500 characters", { maxLength: 1500 }),
  collapse_type: s.optional(s.string("Patent dedup condition")),
  collapse_by: s.optional(s.array("Patent dedup sort rules | JSON array", s.unknown("One item in this list."))),
});

const statisticsInput = s.requiredObject("Patsnap MCP tool arguments.", {
  field: s.string("Filter field dimensions | max 5 fields"),
  limit: s.optional(s.integer("Return stats count | 1-100, default 50", { minimum: 1, maximum: 100 })),
  stemming: s.optional(s.integer("Truncation feature | 1 enable, 0 disable", { minimum: 0, maximum: 1 })),
  lang: s.optional(s.string("Language | cn/en, default cn")),
  query_text: s.string("Analytics query | max 1500 characters", { maxLength: 1500 }),
  collapse_type: s.optional(s.string("Patent dedup condition")),
  collapse_by: s.optional(s.array("Patent dedup sort rules | JSON array", s.unknown("One item in this list."))),
});

const facetInput = s.requiredObject("Patsnap MCP tool arguments.", {
  field: s.string("Filter field dimensions | max 5 fields"),
  offset: s.optional(s.integer("<=20000", { minimum: 0, maximum: 20000 })),
  limit: s.optional(s.integer("Return stats count | 1-100, default 50", { minimum: 1, maximum: 100 })),
  stemming: s.optional(s.integer("Truncation feature | 1 enable, 0 disable", { minimum: 0, maximum: 1 })),
  sort: s.optional(s.array("Field sort | JSON array", s.unknown("One item in this list."))),
  lang: s.optional(s.string("Language | cn/en, default cn")),
  query_text: s.string("Analytics query | max 1500 characters", { maxLength: 1500 }),
  collapse_type: s.optional(s.string("Patent dedup condition")),
  collapse_by: s.optional(s.array("Patent dedup sort rules | JSON array", s.unknown("One item in this list."))),
});

const patentListInput = s.requiredObject("Patsnap MCP tool arguments.", {
  collapse_order_authority: s.optional(
    s.array("Patent dedup sort rules | JSON array", s.unknown("One item in this list.")),
  ),
  offset: s.optional(s.integer("limit+offset<=20000", { minimum: 0, maximum: 20000 })),
  limit: s.optional(s.integer("Return patent count | max 100", { minimum: 1, maximum: 100 })),
  sort: s.optional(s.array("Field sort | JSON array", s.unknown("One item in this list."))),
  collapse_order: s.optional(s.string("Patent dedup sort rules")),
  query_text: s.string("Analytics query | max 12000 characters", { maxLength: 12000 }),
  collapse_type: s.optional(s.string("Patent dedup condition")),
  collapse_by: s.optional(s.string("Patent dedup sort field")),
});

const patentInfoInput = s.requiredObject("Patsnap MCP tool arguments.", {
  patent_number: s.array(
    "Publication number list | supports batch, max 100",
    s.string("A patent publication number."),
    { maxItems: 100 },
  ),
});

const patentPdfInput = {
  ...s.requiredObject("Patsnap MCP tool arguments.", {
    patent_id: s.optional(s.string("Patent ID | supports batch comma-separated, max 3")),
    replace_by_related: s.optional(
      s.integer("Replace with patent family when PDF unavailable | 1 yes, 0 no, default 0", {
        minimum: 0,
        maximum: 1,
      }),
    ),
    patent_number: s.optional(s.string("Publication number | supports batch comma-separated, max 3")),
  }),
  anyOf: [{ required: ["patent_id"] }, { required: ["patent_number"] }],
};

const patentTextInput = {
  ...s.requiredObject("Patsnap MCP tool arguments.", {
    patent_id: s.optional(s.string("Patent ID")),
    patent_number: s.optional(s.string("Publication number")),
  }),
  anyOf: [{ required: ["patent_id"] }, { required: ["patent_number"] }],
};

const patentAggregationInput = {
  ...s.requiredObject("Patsnap MCP tool arguments.", {
    patent_id: s.optional(s.string("Patent ID | supports batch comma-separated, max 100")),
    patent_number: s.optional(s.string("Publication number | supports batch comma-separated, max 100")),
  }),
  anyOf: [{ required: ["patent_id"] }, { required: ["patent_number"] }],
};

const patentDetailInput = {
  ...s.requiredObject("Patsnap MCP tool arguments.", {
    patent_id: s.optional(s.string("Patent ID")),
    replace_by_related: s.optional(
      s.integer("Replace with patent family when full text unavailable | 1 yes, 0 no, default 0", {
        minimum: 0,
        maximum: 1,
      }),
    ),
    patent_number: s.optional(s.string("Publication number")),
    lang: s.optional(s.string("Translation language | cn/en/jp, default en")),
  }),
  anyOf: [{ required: ["patent_id"] }, { required: ["patent_number"] }],
};

export const patsnapLandscapeActions: ProviderActionDefinition[] = [
  defineProviderAction("patsnap_mcp", {
    name: "landscape_trend",
    operationType: "read",
    description: "Analyzes Patent Trend to show activity changes, leading entities, and directional signals.",
    inputSchema: landscapeQueryInput,
    outputSchema: patsnapResultSchema,
  }),
  defineProviderAction("patsnap_mcp", {
    name: "landscape_tech_applicant_dist",
    operationType: "read",
    description:
      "Analyzes Key Technology Branch Applicant Distribution to show structure, distribution, hotspots, and the overall landscape.",
    inputSchema: landscapeQueryInput,
    outputSchema: patsnapResultSchema,
  }),
  defineProviderAction("patsnap_mcp", {
    name: "landscape_technology_life_cycle",
    operationType: "read",
    description: "Analyzes Technology Life Cycle to show structure, distribution, hotspots, and the overall landscape.",
    inputSchema: lifeCycleInput,
    outputSchema: patsnapResultSchema,
  }),
  defineProviderAction("patsnap_mcp", {
    name: "landscape_technology_constitute",
    operationType: "read",
    description:
      "Analyzes Technology Composition to show structure, distribution, hotspots, and the overall landscape.",
    inputSchema: landscapeQueryInput,
    outputSchema: patsnapResultSchema,
  }),
  defineProviderAction("patsnap_mcp", {
    name: "landscape_search_patents_with_detail",
    operationType: "read",
    description:
      "Searches Patent Search With Details based on input criteria and returns matching results for screening, comparison, and follow-up analysis.",
    inputSchema: detailSearchInput,
    outputSchema: patsnapResultSchema,
  }),
  defineProviderAction("patsnap_mcp", {
    name: "landscape_search_patents_v3",
    operationType: "read",
    description:
      "Searches Patent Search based on input criteria and returns matching results for screening, comparison, and follow-up analysis.",
    inputSchema: searchV3Input,
    outputSchema: patsnapResultSchema,
  }),
  defineProviderAction("patsnap_mcp", {
    name: "landscape_search_patents_statistics",
    operationType: "read",
    description: "Analyzes Patent Statistics to show activity changes, leading entities, and directional signals.",
    inputSchema: statisticsInput,
    outputSchema: patsnapResultSchema,
  }),
  defineProviderAction("patsnap_mcp", {
    name: "landscape_search_patents_facet",
    operationType: "read",
    description:
      "Searches Patent Search Facets based on input criteria and returns matching results for screening, comparison, and follow-up analysis.",
    inputSchema: facetInput,
    outputSchema: patsnapResultSchema,
  }),
  defineProviderAction("patsnap_mcp", {
    name: "landscape_refered_rank",
    operationType: "read",
    description: "Analyzes Citation Count Ranking to show activity changes, leading entities, and directional signals.",
    inputSchema: landscapeQueryInput,
    outputSchema: patsnapResultSchema,
  }),
  defineProviderAction("patsnap_mcp", {
    name: "landscape_rec_office",
    operationType: "read",
    description:
      "Analyzes Receiving Office Statistics to show activity changes, leading entities, and directional signals.",
    inputSchema: landscapeQueryInput,
    outputSchema: patsnapResultSchema,
  }),
  defineProviderAction("patsnap_mcp", {
    name: "landscape_map_3d",
    operationType: "read",
    description: "Analyzes 3D Map Analysis to show structure, distribution, hotspots, and the overall landscape.",
    inputSchema: landscapeQueryInput,
    outputSchema: patsnapResultSchema,
  }),
  defineProviderAction("patsnap_mcp", {
    name: "landscape_list",
    operationType: "read",
    description: "Retrieves a Patent List for batch review, filtering, and further processing.",
    inputSchema: patentListInput,
    outputSchema: patsnapResultSchema,
  }),
  defineProviderAction("patsnap_mcp", {
    name: "landscape_info",
    operationType: "read",
    description: "Retrieves detailed Patent Field Details for verification, full-text review, and deeper analysis.",
    inputSchema: patentInfoInput,
    outputSchema: patsnapResultSchema,
  }),
  defineProviderAction("patsnap_mcp", {
    name: "landscape_get_rec_office_year",
    operationType: "read",
    description:
      "Analyzes Receiving Office Statistics By Year to show activity changes, leading entities, and directional signals.",
    inputSchema: landscapeQueryInput,
    outputSchema: patsnapResultSchema,
  }),
  defineProviderAction("patsnap_mcp", {
    name: "landscape_get_patent_pdf",
    operationType: "read",
    description:
      "Retrieves Patent PDF data so users can review the key information and continue with downstream analysis.",
    inputSchema: patentPdfInput,
    outputSchema: patsnapResultSchema,
  }),
  defineProviderAction("patsnap_mcp", {
    name: "landscape_famn_rank",
    operationType: "read",
    description: "Analyzes Patent Family Ranking to show activity changes, leading entities, and directional signals.",
    inputSchema: landscapeQueryInput,
    outputSchema: patsnapResultSchema,
  }),
  defineProviderAction("patsnap_mcp", {
    name: "landscape_domain_map",
    operationType: "read",
    description: "Analyzes Domain Map to show structure, distribution, hotspots, and the overall landscape.",
    inputSchema: landscapeQueryInput,
    outputSchema: patsnapResultSchema,
  }),
  defineProviderAction("patsnap_mcp", {
    name: "landscape_detail_text",
    operationType: "read",
    description: "Retrieves detailed Patent Detail Text for verification, full-text review, and deeper analysis.",
    inputSchema: patentTextInput,
    outputSchema: patsnapResultSchema,
  }),
  defineProviderAction("patsnap_mcp", {
    name: "landscape_detail_aggregation",
    operationType: "read",
    description:
      "Retrieves detailed Patent Detail Aggregation for verification, full-text review, and deeper analysis.",
    inputSchema: patentAggregationInput,
    outputSchema: patsnapResultSchema,
  }),
  defineProviderAction("patsnap_mcp", {
    name: "landscape_detail",
    operationType: "read",
    description: "Retrieves detailed Patent Details for verification, full-text review, and deeper analysis.",
    inputSchema: patentDetailInput,
    outputSchema: patsnapResultSchema,
  }),
  defineProviderAction("patsnap_mcp", {
    name: "landscape_cooperation_applicant_analysis",
    operationType: "read",
    description:
      "Retrieves Cooperation Applicant Analysis data so users can review the key information and continue with downstream analysis.",
    inputSchema: landscapeQueryInput,
    outputSchema: patsnapResultSchema,
  }),
  defineProviderAction("patsnap_mcp", {
    name: "landscape_applicant_trend",
    operationType: "read",
    description:
      "Analyzes Leading Applicant Filing Trend to show activity changes, leading entities, and directional signals.",
    inputSchema: landscapeQueryInput,
    outputSchema: patsnapResultSchema,
  }),
  defineProviderAction("patsnap_mcp", {
    name: "landscape_applicant_technology_analysis",
    operationType: "read",
    description:
      "Retrieves Applicant Technology Analysis data so users can review the key information and continue with downstream analysis.",
    inputSchema: landscapeQueryInput,
    outputSchema: patsnapResultSchema,
  }),
  defineProviderAction("patsnap_mcp", {
    name: "landscape_applicant_rank",
    operationType: "read",
    description: "Analyzes Applicant Ranking to show activity changes, leading entities, and directional signals.",
    inputSchema: landscapeQueryInput,
    outputSchema: patsnapResultSchema,
  }),
];
