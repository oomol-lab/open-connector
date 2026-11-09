import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const tool = s.looseObject("Tool details, including provider-specific parameters and pricing.");

const scalar = s.anyOf("A query parameter value.", [
  s.string("A string value."),
  s.number("A numeric value."),
  s.boolean("A boolean value."),
]);

export const tregActions: ActionDefinition[] = [
  defineProviderAction("treg", {
    name: "catalog_search",
    operationType: "read",
    requiredScopes: [],
    description: "Search Treg's catalog by task and compare available tools and prices before calling one.",
    inputSchema: s.object(
      "Catalog search options.",
      {
        q: s.string("Task or keywords to search for; omit to browse."),
        limit: s.integer("Maximum results to return, default 25.", { minimum: 1, maximum: 100 }),
        added_within_days: s.integer("Only tools added within this many days.", { minimum: 1 }),
        sort: s.stringEnum("Sort by relevance or newest additions.", ["", "best", "newest"]),
        engine: s.stringEnum("Use agent search or omit for keyword search.", ["", "agent"]),
      },
      { required: [] },
    ),
    outputSchema: s.looseObject(
      "Catalog search results and discovery hints.",
      {
        query: s.string("The search query."),
        count: s.integer("Number of returned results."),
        total: s.integer("Total matching tools."),
        results: s.array("Matching tools.", tool),
        hints: s.array("Suggested next steps.", s.string("A discovery hint.")),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("treg", {
    name: "catalog_get",
    operationType: "read",
    requiredScopes: [],
    description: "Read a Treg catalog tool's parameters, method, price and examples before calling it.",
    inputSchema: s.object(
      "Catalog tool identification.",
      {
        endpoint_id: s.nonWhitespaceString("Exact endpoint ID returned by catalog_search."),
      },
      { optional: [] },
    ),
    outputSchema: s.looseObject(
      "Catalog endpoint details.",
      {
        id: s.string("Catalog endpoint ID."),
        provider: s.string("Upstream provider identifier."),
        method: s.string("HTTP method used to call the endpoint."),
        path: s.string("Upstream endpoint path."),
        input: s.looseObject("Provider-defined input parameters and body requirements."),
        cost: s.looseObject("Pricing details and billing conditions."),
      },
      { required: [] },
    ),
  }),
  defineProviderAction("treg", {
    name: "list_tools",
    operationType: "read",
    requiredScopes: [],
    description: "List the connected team's registered tools that this token is allowed to use.",
    inputSchema: s.object("Team tool listing options.", {}, { optional: [] }),
    outputSchema: s.object(
      "Team tools.",
      {
        tools: s.array("Registered tools available to the caller.", tool),
      },
      { optional: [] },
    ),
  }),
  defineProviderAction("treg", {
    name: "get_balance",
    operationType: "read",
    requiredScopes: [],
    description: "Read the connected team's current prepaid Treg balance in integer micro-USD.",
    inputSchema: s.object("Balance query options.", {}, { optional: [] }),
    outputSchema: s.object(
      "Current team balance.",
      {
        team: s.string("Team slug."),
        balance_micro: s.integer("Prepaid balance in micro-USD; one USD equals 1000000 micro-USD."),
      },
      { optional: [] },
    ),
  }),
  defineProviderAction("treg", {
    name: "call_tool",
    operationType: "destructive",
    requiredScopes: [],
    description:
      "Call a Treg catalog endpoint or registered team tool with JSON parameters. Read catalog_get first and use its method, inputs and price. Calls can modify or delete upstream resources and spend team credits. Only synchronous JSON responses are supported; use URL inputs for remote files where the tool supports them. After a timeout, verify the outcome before retrying.",
    inputSchema: s.object(
      "Tool call request.",
      {
        tool: s.nonWhitespaceString("Catalog endpoint ID or registered team tool name."),
        path: s.string("Relative upstream path for a registered team tool; omit for catalog endpoints."),
        method: s.stringEnum("HTTP method from the tool documentation; defaults to GET.", [
          "GET",
          "POST",
          "PUT",
          "PATCH",
          "DELETE",
          "HEAD",
          "OPTIONS",
        ]),
        query: s.record(
          "Query parameters; arrays produce repeated parameters.",
          s.anyOf("A scalar or repeated query parameter.", [scalar, s.array("Repeated query values.", scalar)]),
        ),
        headers: s.record(
          "Upstream and Treg routing headers. Token, team, host and transport headers cannot be overridden.",
          s.string("A header value."),
        ),
        body: s.unknown("JSON request body matching the tool contract; not allowed for GET or HEAD."),
      },
      { optional: ["path", "method", "query", "headers", "body"] },
    ),
    outputSchema: s.object(
      "Tool response with billing metadata.",
      {
        result: s.unknown("Upstream JSON response, or null for an empty response."),
        status: s.integer("Successful upstream HTTP status."),
        cost_micro: s.nullable(s.integer("Charged amount from X-Treg-Cost-Micro, when provided.")),
        served_by: s.nullable(s.string("Provider named by X-Treg-Served-By, when provided.")),
      },
      { optional: [] },
    ),
  }),
];
