import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import operations from "./operations.json" with { type: "json" };
export const anyapiOperations: typeof operations = operations;
const responseControls = {
  fields: s.string("Comma-separated output fields to retain; this does not reduce charges."),
  max_items: s.integer("Maximum returned rows after execution; this does not reduce charges.", {
    minimum: 0,
  }),
  summary: s.boolean("Return a structural outline instead of the full output; charges are unchanged."),
  jq: s.string("A jq expression shaping output, which may become an array or scalar; charges are unchanged."),
};
const requestOptions = s.object(
  "Optional request budget, output shaping, and retry identity.",
  {
    ...responseControls,
    max_cost_usd: s.string("Maximum USD cost for this request; unaffordable routes are refused before execution."),
    idempotencyKey: s.string(
      "Reuse this key only for retries of the same logical request. A UUID v7 is generated when omitted and returned in the response or error details.",
      { minLength: 1, maxLength: 255 },
    ),
  },
  {
    optional: [...Object.keys(responseControls), "max_cost_usd", "idempotencyKey"],
  },
);
const resultRequired = ["output", "provider", "costUsd", "items", "replayed"];
const idempotencyReplayedSchema = s.nullable(
  s.boolean(
    "Upstream Idempotency-Replayed header: false confirms a fresh execution with an accepted key, true confirms a replay, and null means idempotency support was not confirmed. A sent key alone does not guarantee a free retry.",
  ),
);
const resultProperties = {
  output: s.unknown(
    "AnyAPI business output, normally {found, data, reason?}; jq or summary may change its shape. Unknown upstream fields are preserved.",
  ),
  provider: s.string("The upstream provider label, normally AnyAPI."),
  costUsd: s.number("USD charged for the original execution; replay and cached reads do not charge this amount again."),
  items: s.integer("Number of returned result rows; billing may instead use submitted inputs."),
  replayed: s.boolean("Whether this is a replay of an earlier execution."),
  source: s.looseObject("Identity of the upstream data source that served the request."),
  resultId: s.string("Cached unshaped result handle, when retained; use get_result to reshape without another run."),
  hint: s.string("Upstream completeness, pagination, or query guidance."),
  jqError: s.string("Output shaping error; the unshaped result is retained when shaping fails."),
};
const anyapiResultSchema: JsonSchema = s.object(
  "AnyAPI execution envelope with original billing and source information.",
  {
    ...resultProperties,
    idempotencyReplayed: idempotencyReplayedSchema,
    requestId: s.string("Upstream request identifier, when supplied."),
    idempotencyKey: s.string("Retry identity used for this invocation; retain it when resuming the same request."),
  },
  {
    additionalProperties: true,
    required: resultRequired,
  },
);
const requestSchema = s.object(
  "Durable request state and retained execution result.",
  {
    requestId: s.string("AnyAPI request identifier used by get_request."),
    sku: s.string("AnyAPI SKU executed by this request."),
    status: s.stringEnum("Durable execution state.", ["queued", "running", "succeeded", "failed", "expired"]),
    createdAt: s.string("Request creation timestamp."),
    completedAt: s.string("Request completion timestamp, when available."),
    expiresAt: s.string("Request expiry timestamp, when available."),
    resultExpired: s.boolean("Whether the stored result is no longer available."),
    retryAfterSeconds: s.integer("Suggested delay before polling again.", { minimum: 1 }),
    result: s.object("Retained result envelope; may be absent after expiry.", resultProperties, {
      additionalProperties: true,
      required: resultRequired,
    }),
    error: s.looseObject("Terminal upstream error information, when provided."),
    serviceOutcome: s.string("Service outcome independent of payment settlement."),
    settlementState: s.string("Payment settlement state independent of execution status."),
    idempotencyKey: s.string("Retry identity returned when submitting a request."),
    idempotencyReplayed: idempotencyReplayedSchema,
  },
  {
    additionalProperties: true,
    required: ["requestId", "sku", "status", "createdAt"],
  },
);
const submitSchema: JsonSchema = {
  ...requestSchema,
  description: "Accepted request snapshot or an immediately completed execution with its result.",
  required: ["sku", "status", "idempotencyKey", "idempotencyReplayed"],
  anyOf: [
    { required: ["requestId", "createdAt"] },
    { properties: { status: { const: "succeeded" } }, required: ["result"] },
  ],
};
export const anyapiActions: ActionDefinition[] = [
  ...operations.map((operation) =>
    defineProviderAction("anyapi", {
      name: operation.name,
      description: operation.description,
      operationType: operation.durable ? "write" : "read",
      requiredScopes: [],
      asyncLifecycle: operation.durable
        ? { startActionId: `anyapi.${operation.name}`, statusActionId: "anyapi.get_request" }
        : undefined,
      inputSchema: {
        ...operation.inputSchema,
        properties: { ...operation.inputSchema.properties, requestOptions },
      } as JsonSchema,
      outputSchema: operation.durable ? submitSchema : anyapiResultSchema,
    }),
  ),
  defineProviderAction("anyapi", {
    name: "get_request",
    operationType: "read",
    description: "Read a durable AnyAPI request and its retained result without submitting another paid job.",
    requiredScopes: [],
    inputSchema: s.requiredObject("The durable request to inspect.", {
      requestId: s.string("AnyAPI request UUID.", { format: "uuid" }),
    }),
    outputSchema: requestSchema,
  }),
  defineProviderAction("anyapi", {
    name: "get_result",
    operationType: "read",
    description: "Read or reshape an AnyAPI cached result without executing the business request again.",
    requiredScopes: [],
    inputSchema: s.object(
      "Cached result identifier and optional output shaping.",
      {
        resultId: s.string("Opaque cached result identifier returned by an execution.", {
          minLength: 1,
        }),
        ...responseControls,
      },
      {
        optional: Object.keys(responseControls),
      },
    ),
    outputSchema: anyapiResultSchema,
  }),
  defineProviderAction("anyapi", {
    name: "get_balance",
    operationType: "read",
    description: "Read the USD wallet balance associated with your AnyAPI key without a paid business call.",
    requiredScopes: [],
    inputSchema: s.requiredObject("No parameters are needed to read the wallet balance.", {}),
    outputSchema: s.object(
      "Current AnyAPI wallet balance.",
      {
        usd: s.number("Remaining wallet balance in USD."),
      },
      {
        additionalProperties: true,
        required: ["usd"],
      },
    ),
  }),
];
