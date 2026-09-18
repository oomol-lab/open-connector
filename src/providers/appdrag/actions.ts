import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "appdrag";

const appdragHttpMethodSchema = s.stringEnum("The HTTP method configured for the AppDrag API function.", [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);

const appdragEnvironmentSchema = s.stringEnum(
  "The AppDrag environment segment to call when using an environment-specific route.",
  ["default", "dev", "preprod", "prod"],
);

const nullSchema: JsonSchema = {
  type: "null",
  description: "A null value.",
};

const appdragJsonValueSchema = s.anyOf("A JSON-compatible value accepted by the AppDrag connector.", [
  s.string("A string value."),
  s.number("A numeric value."),
  s.boolean("A boolean value."),
  nullSchema,
  s.array("An array value.", s.unknown("One array item.")),
  s.record("An object value.", s.unknown("One object property value.")),
]);

const appdragParametersSchema = s.record(
  "Key-value pairs forwarded to the AppDrag function as request parameters.",
  appdragJsonValueSchema,
);

const executeFunctionInputSchema = s.object(
  "The input payload for executing one AppDrag Cloud Backend API function.",
  {
    folder: s.nonEmptyString("The AppDrag function folder name used in the route."),
    functionName: s.nonEmptyString("The AppDrag function name used in the route."),
    method: appdragHttpMethodSchema,
    environment: appdragEnvironmentSchema,
    parameters: appdragParametersSchema,
    rawResponse: s.boolean("Whether to return the raw response body instead of the standard AppDrag wrapper payload."),
  },
  { required: ["folder", "functionName"] },
);

const executeFunctionOutputSchema = s.object(
  "The normalized output payload for an AppDrag Cloud Backend API function execution.",
  {
    successful: s.boolean("Whether the upstream HTTP request completed with a 2xx status code."),
    data: s.object(
      "The standard AppDrag response wrapper returned by most Cloud Backend functions.",
      {
        status: s.anyOf("The AppDrag execution status field.", [
          s.boolean("A boolean status returned by AppDrag."),
          s.string("A string status returned by AppDrag."),
        ]),
        execTime: s.number("The AppDrag function execution time in milliseconds."),
        billedTime: s.number("The AppDrag billed time in milliseconds."),
        payload: s.unknown("The upstream payload returned by the AppDrag function."),
        logs: s.unknown("Optional logs or error details returned by the AppDrag function."),
        affectedRows: s.anyOf("Optional affected row count returned by Visual SQL actions.", [
          s.string("The affected row count as a string."),
          s.integer("The affected row count as an integer."),
          s.number("The affected row count as a number."),
        ]),
      },
      { optional: ["logs", "affectedRows"] },
    ),
    error: s.string("The top-level AppDrag error string when it is present."),
    rawBody: s.unknown("The parsed response body returned when rawResponse is enabled."),
    responseFormat: s.stringEnum("The response body format detected by the connector.", ["json", "text", "empty"]),
    route: s.string("The final AppDrag route that was called."),
  },
  { optional: ["data", "error", "rawBody"] },
);

export const appdragActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "execute_function",
    operationType: "write",
    description:
      "Execute one AppDrag Cloud Backend API function by folder, function name, HTTP method, and optional parameters.",
    inputSchema: executeFunctionInputSchema,
    outputSchema: executeFunctionOutputSchema,
  }),
];
