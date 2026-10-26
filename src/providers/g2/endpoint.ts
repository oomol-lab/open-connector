import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

interface G2QueryParameter {
  name: string;
  encoding?: "repeat" | "comma" | "deepObject";
}

export interface G2Endpoint {
  path: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  pathParameters: Record<string, string>;
  query: Record<string, G2QueryParameter>;
  body?: {
    contentType: string;
    mode: "json" | "attributes" | "resource" | "resources";
    fields: Record<string, string>;
    resourceType?: string;
    resourceId?: string;
  };
  emptyResponse?: boolean;
  action: ActionDefinition;
}

interface EndpointDefinition extends Omit<G2Endpoint, "action"> {
  name: string;
  description: string;
  operationType: "read" | "write" | "destructive";
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

export function defineG2Endpoint(definition: EndpointDefinition): G2Endpoint {
  const { name, description, operationType, inputSchema, outputSchema, ...endpoint } = definition;
  return {
    ...endpoint,
    action: defineProviderAction("g2", {
      name,
      description,
      operationType,
      requiredScopes: [],
      inputSchema,
      outputSchema,
    }),
  };
}

export function g2ResponseSchema(data: JsonSchema): JsonSchema {
  return s.object(
    "The G2 response, preserving upstream fields and exposing pagination cursors.",
    {
      data,
      included: s.array("Related resources returned by G2.", s.looseObject("One related resource.")),
      links: s.looseObject("Upstream links, returned without following them."),
      meta: s.looseObject("Upstream counts, aggregates, credit usage or partial failures."),
      errors: s.array(
        "Per-item failures returned with a successful batch response.",
        s.looseObject("One item failure."),
      ),
      nextCursor: s.nullable(s.string("Pass as after for the next page; null if unavailable.")),
      previousCursor: s.nullable(s.string("Pass as before for the previous page; null if unavailable.")),
    },
    {
      additionalProperties: true,
      required: ["data", "nextCursor", "previousCursor"],
    },
  );
}
