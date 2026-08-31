import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "scrape_creators";

const getCreditBalanceAction = defineProviderAction(service, {
  name: "get_credit_balance",
  requiredScopes: [],
  providerPermissions: [],
  description: "Get the remaining credit balance for the current Scrape Creators API key.",
  inputSchema: s.object("The input for getting the current credit balance.", {}),
  outputSchema: s.object("The current Scrape Creators credit balance response.", {
    balance: s.nullable(s.number("The remaining API credit balance when returned.")),
    raw: s.looseObject("The complete response returned by Scrape Creators."),
  }),
});

const endpointSchema = s.object("One endpoint discovered from the official OpenAPI document.", {
  method: s.stringEnum("The HTTP method accepted by this endpoint.", ["GET", "POST"]),
  path: s.string("The absolute Scrape Creators API path."),
  category: s.string("The endpoint category from the first OpenAPI tag."),
  title: s.string("The endpoint summary from the OpenAPI document."),
  description: s.string("The endpoint description from the OpenAPI document."),
  documentationUrl: s.url("The official documentation URL for this endpoint."),
  requestSchema: s.looseObject("The current query and JSON body request contract."),
});

const discoverEndpointsAction = defineProviderAction(service, {
  name: "discover_endpoints",
  requiredScopes: [],
  providerPermissions: [],
  description: "Discover current Scrape Creators GET and POST endpoints from the official OpenAPI document.",
  followUpActions: ["scrape_creators.invoke_endpoint"],
  inputSchema: s.object(
    "Filters and pagination for discovering Scrape Creators endpoints.",
    {
      query: s.string("Text to match against the category, title, description, or path.", {
        maxLength: 200,
      }),
      category: s.string("An exact OpenAPI category tag to include.", { maxLength: 100 }),
      offset: s.integer("The zero-based offset into matching endpoints.", {
        minimum: 0,
        default: 0,
      }),
      limit: s.integer("The maximum number of endpoints to return.", {
        minimum: 1,
        maximum: 50,
        default: 20,
      }),
    },
    { optional: ["query", "category", "offset", "limit"] },
  ),
  outputSchema: s.object("A page of currently documented Scrape Creators endpoints.", {
    catalogVersion: s.string("The SHA-256 digest of the current OpenAPI document."),
    endpoints: s.array("The discovered endpoints in this page.", endpointSchema),
    total: s.integer("The total number of endpoints matching the filters."),
    nextOffset: s.nullable(s.integer("The next offset when more endpoints match.")),
    stale: s.boolean("Whether a recent cached catalog was used after a refresh failure."),
  }),
});

const invokeEndpointAction = defineProviderAction(service, {
  name: "invoke_endpoint",
  requiredScopes: [],
  providerPermissions: [],
  description: "Invoke a currently documented Scrape Creators GET or POST endpoint at the fixed official API origin.",
  followUpActions: ["scrape_creators.discover_endpoints"],
  inputSchema: s.object("A controlled dynamic Scrape Creators API invocation.", {
    method: s.stringEnum("The documented endpoint HTTP method.", ["GET", "POST"]),
    path: s.nonEmptyString("The exact absolute path returned by discover_endpoints."),
    request: s.object(
      "The query parameters and optional JSON body for the endpoint.",
      {
        query: s.looseObject("Query values keyed by exact upstream parameter name."),
        body: s.unknown("The JSON body for a documented POST endpoint."),
      },
      { optional: ["query", "body"] },
    ),
  }),
  outputSchema: s.object("The successful Scrape Creators endpoint response.", {
    method: s.stringEnum("The HTTP method used for the request.", ["GET", "POST"]),
    path: s.string("The documented API path used for the request."),
    status: s.integer("The successful upstream HTTP status.", { minimum: 100, maximum: 599 }),
    response: s.unknown("The complete successful response body."),
  }),
});

export const scrapeCreatorsActions: ActionDefinition[] = [
  getCreditBalanceAction,
  discoverEndpointsAction,
  invokeEndpointAction,
];
