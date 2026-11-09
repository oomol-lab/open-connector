import type { ActionDefinition } from "../../core/types.ts";
import type { AisaActionRoute } from "./routes.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

export const publicUtilityActions: ActionDefinition[] = [
  defineProviderAction("aisa", {
    name: "list_duffel_hotel_loyalty_programmes",
    description: "List hotel loyalty programmes supported by Duffel Stays, including programme references and logos.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "Pagination for the public hotel loyalty programme directory.",
      {
        after: s.optional(s.string("Return results after this pagination cursor.")),
        before: s.optional(s.string("Return results before this pagination cursor.")),
        limit: s.optional(s.integer("Maximum number of programmes to return.", { minimum: 1, maximum: 200 })),
      },
      { optional: [] },
    ),
    outputSchema: s.looseObject(
      "The supported loyalty programmes and pagination metadata.",
      {
        data: s.array(
          "Supported hotel loyalty programmes.",
          s.looseObject(
            "One hotel loyalty programme.",
            {
              reference: s.optional(s.string("Programme code used by accommodation and rate records.")),
              name: s.optional(s.string("The loyalty programme name.")),
              logo_url_svg: s.optional(s.string("The programme SVG logo URL.")),
              logo_url_png_small: s.optional(s.string("The programme small PNG logo URL.")),
            },
            { required: [] },
          ),
        ),
        meta: s.optional(
          s.looseObject(
            "Pagination cursors and page size.",
            {
              after: s.optional(s.nullableString("Cursor for the next page, or null when unavailable.")),
              before: s.optional(s.nullableString("Cursor for the previous page, or null when unavailable.")),
              limit: s.optional(s.number("The page size returned by the provider.")),
            },
            { required: [] },
          ),
        ),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("aisa", {
    name: "generate_parallel_findall_spec",
    description:
      "Convert a natural-language research objective into a suggested FindAll specification without starting a run.",
    operationType: "read",
    requiredScopes: [],
    inputSchema: s.object(
      "The objective to convert into a structured research specification.",
      {
        objective: s.string("Natural language objective to create a FindAll run specification.", {
          minLength: 1,
        }),
        parallelBeta: s.optional(
          s.string("Optional Parallel beta feature header; deprecated upstream and normally omitted."),
        ),
      },
      { optional: [] },
    ),
    outputSchema: s.looseObject(
      "The suggested FindAll specification, which can be customized before a run.",
      {
        objective: s.string("The generated natural-language research objective."),
        entity_type: s.string("The type of entities to find."),
        match_conditions: s.array(
          "Conditions each matching entity should satisfy.",
          s.looseObject(
            "One named matching condition.",
            {
              name: s.optional(s.string("The condition name.")),
              description: s.optional(s.string("The condition to evaluate.")),
            },
            { required: [] },
          ),
        ),
        generator: s.optional(s.string("The suggested FindAll generator.")),
        match_limit: s.optional(s.nullableInteger("Maximum number of candidates to evaluate.")),
        enrichments: s.optional(
          s.nullable(s.array("Suggested enrichment inputs.", s.looseObject("One enrichment specification."))),
        ),
      },
      { required: [] },
    ),
  }),
];

export const publicUtilityRoutes: Record<string, AisaActionRoute> = {
  list_duffel_hotel_loyalty_programmes: {
    method: "GET",
    path: "/apis/v1/duffel/stays/loyalty-programmes/list",
    query: { after: "after", before: "before", limit: "limit" },
  },
  generate_parallel_findall_spec: {
    method: "POST",
    path: "/apis/v1/parallel/findall/ingest",
    query: {},
    body: { objective: "objective" },
    headers: { parallelBeta: "parallel-beta" },
  },
};
