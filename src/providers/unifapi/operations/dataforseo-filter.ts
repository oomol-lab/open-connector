import type { JsonSchema } from "../../../core/types.ts";

export const dataForSeoFilterDefinitions: Record<string, JsonSchema> = {
  DataForSeoFilterCondition: {
    type: "object",
    properties: {
      field: {
        type: "string",
        minLength: 1,
        description: "Field to filter on. See the endpoint's list of filterable fields.",
      },
      op: {
        type: "string",
        enum: [
          "=",
          "<>",
          "<",
          "<=",
          ">",
          ">=",
          "in",
          "not_in",
          "like",
          "not_like",
          "ilike",
          "not_ilike",
          "match",
          "not_match",
        ],
        description: "Comparison operator.",
      },
      value: {
        $ref: "#/$defs/DataForSeoFilterValue",
      },
    },
    required: ["field", "op", "value"],
    additionalProperties: false,
    description: "The filter condition.",
  },
  DataForSeoFilterValue: {
    anyOf: [
      {
        type: "string",
      },
      {
        type: "number",
      },
      {
        type: "boolean",
      },
      {
        type: "array",
        items: {
          anyOf: [
            {
              type: "string",
            },
            {
              type: "number",
            },
            {
              type: "boolean",
            },
          ],
        },
        minItems: 1,
      },
    ],
    description:
      'Comparison value: a string, number, or boolean for scalar operators, or a non-empty array for "in" / "not_in".',
  },
  DataForSeoFilter: {
    anyOf: [
      {
        $ref: "#/$defs/DataForSeoFilterCondition",
      },
      {
        type: "object",
        properties: {
          and: {
            type: "array",
            items: {
              $ref: "#/$defs/DataForSeoFilter",
            },
            minItems: 2,
            description: "Sub-expressions that must all match.",
          },
        },
        required: ["and"],
        additionalProperties: false,
      },
      {
        type: "object",
        properties: {
          or: {
            type: "array",
            items: {
              $ref: "#/$defs/DataForSeoFilter",
            },
            minItems: 2,
            description: "Sub-expressions where at least one must match.",
          },
        },
        required: ["or"],
        additionalProperties: false,
      },
    ],
  },
};

export function createDataForSeoFilterSchema(description: string): JsonSchema {
  return {
    $ref: "#/$defs/DataForSeoFilter",
    description,
  };
}
