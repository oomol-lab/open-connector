import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "tikhub" as const;
const tikhubUserScope = "/api/v1/tikhub/user/" as const;

function defineTikHubUserAction<TName extends string>(input: {
  name: TName;
  operationType: ActionDefinition["operationType"];
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}): ActionDefinition {
  return defineProviderAction(service, {
    requiredScopes: [tikhubUserScope],
    providerPermissions: [tikhubUserScope],
    ...input,
  });
}

const endpointSchema = s.string({
  description: "The TikHub endpoint path to inspect or price.",
  minLength: 1,
  pattern: "^/",
});

const envelopeSchema = s.object(
  "The normalized TikHub response envelope.",
  {
    code: s.nullable(s.integer("The status-like code returned in the TikHub response body.")),
    requestId: s.nullable(s.string("The TikHub request identifier when returned.")),
    message: s.nullable(s.string("The TikHub response message when returned.")),
    router: s.nullable(s.string("The TikHub router path reported by the response.")),
    params: s.nullable(s.looseObject("The request parameters echoed by TikHub when returned.")),
  },
  { optional: ["code", "requestId", "message", "router", "params"] },
);

const rawDataSchema = s.unknown("The raw data payload returned by TikHub.");
const rawResponseSchema = s.looseObject("The raw TikHub response payload.");
const apiKeyDataSchema = s.looseObject("TikHub API key metadata returned for the current token.", {
  api_key_name: s.string("The API key name."),
  api_key_scopes: s.array(
    "The TikHub path scopes assigned to the API key.",
    s.string("A TikHub path scope assigned to the API key."),
  ),
  created_at: s.string("The API key creation timestamp."),
  expires_at: s.nullable(s.string("The API key expiration timestamp when configured.")),
  api_key_status: s.integer("The API key status value returned by TikHub."),
});
const userDataSchema = s.looseObject("TikHub account metadata returned for the current token.", {
  email: s.string("The TikHub account email address."),
  balance: s.number("The current account balance."),
  free_credit: s.number("The remaining free credit balance."),
  email_verified: s.boolean("Whether the TikHub account email is verified."),
  account_disabled: s.boolean("Whether the TikHub account is disabled."),
  is_active: s.boolean("Whether the TikHub account is active."),
});

const getUserDailyUsageAction = defineTikHubUserAction({
  name: "get_user_daily_usage",
  operationType: "read",
  description: "Get the current TikHub account daily API usage. Requires the /api/v1/tikhub/user/ TikHub path scope.",
  inputSchema: s.object("The input payload for getting TikHub daily usage.", {}),
  outputSchema: s.object("The response returned when getting TikHub daily usage.", {
    envelope: envelopeSchema,
    usage: s.array("The daily usage entries returned by TikHub.", s.looseObject("One TikHub daily usage entry.")),
    rawData: rawDataSchema,
    raw: rawResponseSchema,
  }),
});

const getUserInfoAction = defineTikHubUserAction({
  name: "get_user_info",
  operationType: "read",
  description:
    "Get the current TikHub account and API key information. Requires the /api/v1/tikhub/user/ TikHub path scope.",
  inputSchema: s.object("The input payload for getting TikHub user information.", {}),
  outputSchema: s.object("The response returned when getting TikHub user information.", {
    envelope: envelopeSchema,
    apiKey: s.nullable(apiKeyDataSchema),
    user: s.nullable(userDataSchema),
    scopes: s.array(
      "The TikHub path scopes assigned to the current API key.",
      s.string("A TikHub path scope assigned to the API key."),
    ),
    rawData: rawDataSchema,
    raw: rawResponseSchema,
  }),
});

const getEndpointInfoAction = defineTikHubUserAction({
  name: "get_endpoint_info",
  operationType: "read",
  description: "Get TikHub cost and metadata for one endpoint. Requires the /api/v1/tikhub/user/ TikHub path scope.",
  inputSchema: s.object("The input payload for getting TikHub endpoint information.", {
    endpoint: endpointSchema,
  }),
  outputSchema: s.object("The response returned when getting TikHub endpoint information.", {
    envelope: envelopeSchema,
    endpoint: s.string("The endpoint path that was inspected."),
    endpointInfo: rawDataSchema,
    raw: rawResponseSchema,
  }),
});

const getAllEndpointsInfoAction = defineTikHubUserAction({
  name: "get_all_endpoints_info",
  operationType: "read",
  description: "Get TikHub cost and metadata for all endpoints. Requires the /api/v1/tikhub/user/ TikHub path scope.",
  inputSchema: s.object("The input payload for getting all TikHub endpoint information.", {}),
  outputSchema: s.object("The response returned when getting all TikHub endpoint information.", {
    envelope: envelopeSchema,
    endpoints: rawDataSchema,
    raw: rawResponseSchema,
  }),
});

const calculatePriceAction = defineTikHubUserAction({
  name: "calculate_price",
  operationType: "read",
  description:
    "Calculate TikHub daily request pricing for one endpoint. Requires the /api/v1/tikhub/user/ TikHub path scope.",
  inputSchema: s.object(
    "The input payload for calculating TikHub endpoint pricing.",
    {
      endpoint: endpointSchema,
      requestPerDay: s.positiveInteger("The expected number of daily requests used for the price calculation."),
    },
    { optional: ["requestPerDay"] },
  ),
  outputSchema: s.object("The response returned when calculating TikHub endpoint pricing.", {
    envelope: envelopeSchema,
    endpoint: s.string("The endpoint path used for the calculation."),
    requestPerDay: s.positiveInteger("The daily request count used for the calculation."),
    price: rawDataSchema,
    raw: rawResponseSchema,
  }),
});

const discoveredEndpointSchema = s.object("One currently discovered TikHub endpoint contract.", {
  operationId: s.string("The OpenAPI operation identifier reported by TikHub."),
  title: s.string("The endpoint title from the TikHub OpenAPI catalog."),
  category: s.string("The TikHub API family from the OpenAPI catalog."),
  description: s.string("The current endpoint description from the TikHub OpenAPI catalog."),
  method: s.stringEnum("The HTTP method accepted by this endpoint.", ["GET", "POST"]),
  path: s.string("The absolute TikHub API path or path template."),
  requiredScope: s.string("The TikHub token path scope required by this endpoint."),
  contractHash: s.string("The SHA-256 digest of the normalized operation contract."),
  requestSchema: s.looseObject("The dynamic path, query, and JSON body request schema."),
});

const discoverEndpointsAction = defineProviderAction(service, {
  name: "discover_endpoints",
  operationType: "read",
  description:
    "Discover current TikHub functional API endpoints from the official OpenAPI catalog, excluding account APIs.",
  requiredScopes: [],
  providerPermissions: [],
  followUpActions: ["tikhub.invoke_endpoint"],
  inputSchema: s.object(
    "Filters and pagination for discovering current TikHub endpoints.",
    {
      query: s.string("Short title, operation ID, category, or path terms to match.", {
        maxLength: 200,
      }),
      category: s.string("An exact TikHub functional API family name.", {
        maxLength: 100,
      }),
      cursor: s.nullable(
        s.string("An opaque cursor bound to the current catalog version and filters.", {
          maxLength: 1_024,
        }),
      ),
      limit: s.integer("The maximum number of OpenAPI operations to inspect in this page.", {
        minimum: 1,
        maximum: 20,
        default: 10,
      }),
    },
    { optional: ["query", "category", "cursor", "limit"] },
  ),
  outputSchema: s.object("The current page of TikHub functional endpoint contracts.", {
    catalogVersion: s.string("The SHA-256 digest of the current TikHub OpenAPI catalog."),
    endpoints: s.array("The endpoints discovered in this page.", discoveredEndpointSchema),
    nextCursor: s.nullable(s.string("The next opaque catalog cursor when more entries remain.")),
    stale: s.boolean("Whether discovery used a recent stale catalog after a refresh failure."),
  }),
});

const invokeRequestSchema = s.object(
  "The path, query, and optional JSON body sent to one TikHub endpoint.",
  {
    path: s.looseObject("Path placeholder values keyed by placeholder name."),
    query: s.looseObject("Query values keyed by the exact upstream parameter name."),
    body: s.unknown("The JSON request body for an approved POST endpoint, or null when absent."),
  },
  { optional: ["path", "query", "body"] },
);

const invokeEndpointAction = defineProviderAction(service, {
  name: "invoke_endpoint",
  operationType: "read",
  description:
    "Invoke one TikHub functional API endpoint at the fixed TikHub API origin. TikHub account endpoints are excluded.",
  requiredScopes: [],
  providerPermissions: [],
  followUpActions: ["tikhub.discover_endpoints"],
  inputSchema: s.object("A controlled dynamic TikHub endpoint invocation.", {
    method: s.stringEnum("The approved TikHub endpoint HTTP method.", ["GET", "POST"]),
    path: s.nonEmptyString("The absolute TikHub API path or OpenAPI path template."),
    request: invokeRequestSchema,
  }),
  outputSchema: s.object("The normalized successful TikHub endpoint response.", {
    method: s.stringEnum("The HTTP method used for the TikHub request.", ["GET", "POST"]),
    path: s.string("The final encoded TikHub API path used for the request."),
    status: s.integer("The successful upstream HTTP status.", { minimum: 100, maximum: 599 }),
    requestId: s.nullable(s.string("The TikHub request identifier when returned.")),
    response: s.looseObject("The complete successful TikHub JSON response body."),
  }),
});

export const tikhubActions: ActionDefinition[] = [
  getUserDailyUsageAction,
  getUserInfoAction,
  getEndpointInfoAction,
  getAllEndpointsInfoAction,
  calculatePriceAction,
  discoverEndpointsAction,
  invokeEndpointAction,
];
