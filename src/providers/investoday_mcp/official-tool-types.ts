import type { ActionOperationType, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";

export interface InvestodayOfficialToolDefinition {
  name: string;
  toolName: string;
  description: string;
  operationType: ActionOperationType;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

export const investodayCodeDataOutputSchema: JsonSchema = s.object(
  "The result returned by the Investoday MCP tool.",
  {
    result: s.unknown(
      "Structured code/data financial data or the original MCP content envelope, including unknown upstream fields and pagination metadata.",
    ),
  },
  { required: ["result"] },
);
