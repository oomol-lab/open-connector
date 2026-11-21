import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "lurkapi";

const getCreditBalanceAction = defineProviderAction(service, {
  name: "get_credit_balance",
  operationType: "read",
  requiredScopes: [],
  description: "Get the credits left on the LurkAPI account the connected key belongs to. Free to call.",
  inputSchema: s.object("The input for reading the LurkAPI credit balance.", {}),
  outputSchema: s.requiredObject("The LurkAPI credit balance.", {
    creditsRemaining: s.number("The credits the account can still spend."),
    dailyTopUp: s.nullableNumber("Once a day (UTC), a balance below this is raised to it on the first call."),
    nextTopUpAt: s.nullableString("When the next daily top-up can happen, as an ISO 8601 timestamp."),
  }),
});

const parameterSchema = s.requiredObject("One query parameter the endpoint accepts.", {
  name: s.nonEmptyString("The exact query parameter name to pass in call_endpoint's query."),
  required: s.boolean("Whether the endpoint needs this parameter."),
  type: s.string("The JSON type of the value, such as string, number or boolean."),
  description: s.string("What the parameter means and the values it accepts."),
  enum: s.nullable(s.array("The values the parameter accepts, when it is a fixed list.", s.unknown("One value."))),
});

const endpointSchema = s.requiredObject("One LurkAPI endpoint.", {
  path: s.nonEmptyString("The API path to pass to call_endpoint, such as /v1/tiktok/profile."),
  platform: s.string("The platform the endpoint reads, such as TikTok or Reddit."),
  title: s.string("A short name for the endpoint."),
  description: s.string("What the endpoint returns, when to use it, and the errors it answers."),
  credits: s.nullableNumber("The base credits one successful call costs. Some endpoints add paid steps."),
  documentationUrl: s.nullableString("The endpoint's documentation page, with a real response."),
  parameters: s.array("The query parameters the endpoint accepts.", parameterSchema),
});

const findEndpointsAction = defineProviderAction(service, {
  name: "find_endpoints",
  operationType: "read",
  requiredScopes: [],
  description:
    "Find LurkAPI endpoints by platform or by what they return, with their parameters and price. The list is read from LurkAPI's live OpenAPI document, so new endpoints appear without a provider update. Free to call.",
  followUpActions: ["lurkapi.call_endpoint"],
  inputSchema: s.object(
    "Filters for finding LurkAPI endpoints.",
    {
      query: s.string("Words to match against the platform, title, description and path, such as tiktok comments.", {
        maxLength: 200,
      }),
      platform: s.string("A platform name to keep, such as TikTok, Instagram, Reddit or YouTube.", { maxLength: 100 }),
      offset: s.integer("The zero-based offset into the matching endpoints.", { minimum: 0, default: 0 }),
      limit: s.integer("The most endpoints to return.", { minimum: 1, maximum: 50, default: 20 }),
    },
    { optional: ["query", "platform", "offset", "limit"] },
  ),
  outputSchema: s.requiredObject("A page of matching LurkAPI endpoints.", {
    endpoints: s.array("The matching endpoints in this page.", endpointSchema),
    total: s.nonNegativeInteger("How many endpoints match the filters."),
    nextOffset: s.nullableInteger("The offset of the next page, or null when this is the last."),
  }),
});

const callEndpointAction = defineProviderAction(service, {
  name: "call_endpoint",
  operationType: "read",
  requiredScopes: [],
  description:
    "Call a LurkAPI endpoint by its path with query parameters, and get its JSON answer. Use find_endpoints to see the paths, parameters and prices. A call that reached the platform is charged, a not-found answer included; invalid parameters and server errors are free.",
  followUpActions: ["lurkapi.find_endpoints"],
  inputSchema: s.object(
    "A LurkAPI request.",
    {
      path: s.nonEmptyString("The endpoint path from find_endpoints, such as /v1/tiktok/profile."),
      query: s.looseObject(
        "Query parameters keyed by their exact names from find_endpoints, such as { handle: nike }. Values are strings, numbers or booleans.",
      ),
    },
    { optional: ["query"] },
  ),
  outputSchema: s.requiredObject("The LurkAPI answer.", {
    path: s.string("The endpoint path that was called."),
    creditsCharged: s.nullableNumber("The credits this call cost."),
    creditsRemaining: s.nullableNumber("The credits left on the account after this call."),
    data: s.looseObject("The endpoint's answer without the success and credit fields."),
  }),
});

export const lurkapiActions: ActionDefinition[] = [getCreditBalanceAction, findEndpointsAction, callEndpointAction];
