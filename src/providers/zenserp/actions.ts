import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "zenserp";

const commonSearchInputProperties = {
  q: s.nonEmptyString("Search query sent to Zenserp."),
  searchEngine: s.nonEmptyString("Search engine domain sent as the search_engine query parameter."),
  location: s.nonEmptyString("Geo location string sent to Zenserp when localized results are needed."),
  hl: s.nonEmptyString("Language code sent to Zenserp."),
  gl: s.nonEmptyString("Country code sent to Zenserp."),
  num: s.integer("Maximum number of results to request.", {
    minimum: 1,
    maximum: 100,
  }),
  start: s.nonNegativeInteger("Zero-based result offset used for pagination."),
};

const optionalSearchInputFields = ["searchEngine", "location", "hl", "gl", "num", "start"];
const optionalObjectSchema = (description: string) => s.nullable(s.looseObject(description));
const optionalObjectArraySchema = (itemDescription: string, description: string) =>
  s.nullable(s.array(description, s.looseObject(itemDescription)));

export const zenserpActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search",
    description: "Run a Google Search request through Zenserp and return the first-pass common result surfaces.",
    inputSchema: s.object(
      "Input parameters for running a Google Search request through Zenserp.",
      commonSearchInputProperties,
      {
        optional: optionalSearchInputFields,
      },
    ),
    outputSchema: s.object(
      "Normalized output payload for search.",
      {
        organic: optionalObjectArraySchema("One organic result item.", "Organic results returned by Zenserp."),
        knowledge_graph: optionalObjectSchema("Knowledge Graph payload returned by Zenserp when available."),
        related_searches: optionalObjectArraySchema(
          "One related search item.",
          "Related searches returned by Zenserp when available.",
        ),
      },
      {
        optional: ["organic", "knowledge_graph", "related_searches"],
        additionalProperties: true,
      },
    ),
  }),
  defineProviderAction(service, {
    name: "google_news_search",
    description: "Run a Google News request through Zenserp.",
    inputSchema: s.object(
      "Input parameters for running a Google News request through Zenserp.",
      commonSearchInputProperties,
      {
        optional: optionalSearchInputFields,
      },
    ),
    outputSchema: s.object(
      "Normalized output payload for google_news_search.",
      {
        news_results: optionalObjectArraySchema("One Google News result item.", "News results returned by Zenserp."),
      },
      {
        optional: ["news_results"],
        additionalProperties: true,
      },
    ),
  }),
  defineProviderAction(service, {
    name: "google_maps_search",
    description: "Run a Google Maps local search request through Zenserp.",
    inputSchema: s.object(
      "Input parameters for running a Google Maps request through Zenserp.",
      commonSearchInputProperties,
      {
        optional: optionalSearchInputFields,
      },
    ),
    outputSchema: s.object(
      "Normalized output payload for google_maps_search.",
      {
        local_results: optionalObjectArraySchema(
          "One Google Maps local result item.",
          "Local results returned by Zenserp.",
        ),
      },
      {
        optional: ["local_results"],
        additionalProperties: true,
      },
    ),
  }),
  defineProviderAction(service, {
    name: "google_image_search",
    description: "Run a Google Image Search request through Zenserp.",
    inputSchema: s.object(
      "Input parameters for running a Google Image Search request through Zenserp.",
      commonSearchInputProperties,
      {
        optional: optionalSearchInputFields,
      },
    ),
    outputSchema: s.object(
      "Normalized output payload for google_image_search.",
      {
        image_results: optionalObjectArraySchema(
          "One Google Image Search result item.",
          "Image search results returned by Zenserp.",
        ),
      },
      {
        optional: ["image_results"],
        additionalProperties: true,
      },
    ),
  }),
];
