import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const messageSchema = s.object(
  "One conversation message to preserve or classify.",
  {
    role: s.stringEnum("The speaker role for this message.", ["user", "assistant"]),
    content: s.nonEmptyString("The message text."),
  },
  { optional: [] },
);
const toolResultSchema = s.object(
  "The normalized result returned by TiMEM Space MCP.",
  {
    result: s.unknown("Structured MCP content when available; otherwise the complete MCP content envelope."),
  },
  { optional: [] },
);
const toolAnnotationsSchema = s.looseObject("MCP behavior hints supplied by TiMEM Space.", {
  title: s.optional(s.string("A human-readable title for the tool.")),
  readOnlyHint: s.optional(s.boolean("Whether the tool is expected not to modify data.")),
  destructiveHint: s.optional(s.boolean("Whether the tool may perform destructive operations.")),
  idempotentHint: s.optional(
    s.boolean("Whether repeated calls with the same arguments are expected to be idempotent."),
  ),
  openWorldHint: s.optional(s.boolean("Whether the tool may interact with entities outside TiMEM Space.")),
});
const toolSummarySchema = s.object(
  "One tool currently exposed by the connected TiMEM Space account.",
  {
    name: s.nonEmptyString("The exact TiMEM Space MCP tool name to pass to call_tool."),
    description: s.string("The current tool description supplied by TiMEM Space."),
    annotations: toolAnnotationsSchema,
    inputSchema: s.looseObject("The current JSON Schema for the tool arguments, supplied by TiMEM Space."),
    outputSchema: s.looseObject("The current JSON Schema for the tool result when TiMEM Space supplies one."),
  },
  { optional: ["description", "annotations", "outputSchema"] },
);
const officialActions = [
  defineProviderAction("timem_space", {
    name: "search_memories",
    operationType: "read",
    description: "Search TiMEM Space for memories related to a semantic query, optionally within a memory domain.",
    requiredScopes: [],
    inputSchema: s.object(
      "The memory query and optional domain and result limit.",
      {
        query_text: s.nonEmptyString("The natural-language query used to recall relevant memories."),
        domain: s.stringEnum("The memory domain to search.", ["general", "coding", "writing"]),
        limit: s.integer("The maximum number of memories to return.", {
          minimum: 1,
          maximum: 50,
        }),
      },
      { optional: ["domain", "limit"] },
    ),
    outputSchema: toolResultSchema,
  }),
  defineProviderAction("timem_space", {
    name: "create_memory",
    operationType: "write",
    description: "Create durable TiMEM Space memories from one to four user and assistant conversation messages.",
    requiredScopes: [],
    inputSchema: s.object(
      "The conversation messages and optional memory classification hints.",
      {
        messages: s.array("The conversation messages from which TiMEM Space should create memory.", messageSchema, {
          minItems: 1,
          maxItems: 4,
        }),
        domain: s.stringEnum("The memory domain for the conversation.", ["general", "coding", "writing"]),
        memory_hint: s.nonEmptyString(
          "A concise hint describing the durable fact, preference, decision, or lesson to preserve.",
        ),
      },
      { optional: ["domain", "memory_hint"] },
    ),
    outputSchema: toolResultSchema,
  }),
  defineProviderAction("timem_space", {
    name: "delete_memory",
    operationType: "destructive",
    description: "Soft-delete one TiMEM Space memory after its identifier has been confirmed through search.",
    requiredScopes: [],
    inputSchema: s.object(
      "The memory to remove.",
      {
        memory_id: s.nonEmptyString("The exact TiMEM Space memory identifier to delete."),
      },
      { optional: [] },
    ),
    outputSchema: toolResultSchema,
  }),
  defineProviderAction("timem_space", {
    name: "classify_memory_scene",
    operationType: "read",
    description: "Classify conversation messages into the general, coding, or writing TiMEM Space memory domain.",
    requiredScopes: [],
    inputSchema: s.object(
      "The conversation messages to classify.",
      {
        messages: s.array("The messages whose memory domain should be classified.", messageSchema, {
          minItems: 1,
          maxItems: 4,
        }),
      },
      { optional: [] },
    ),
    outputSchema: toolResultSchema,
  }),
  defineProviderAction("timem_space", {
    name: "ready",
    operationType: "read",
    description: "Check TiMEM Space MCP authentication and service connectivity.",
    requiredScopes: [],
    inputSchema: s.object("No input is required.", {}, { optional: [] }),
    outputSchema: toolResultSchema,
  }),
];
export const timemSpaceActions: ActionDefinition[] = [
  ...officialActions,
  defineProviderAction("timem_space", {
    name: "list_tools",
    operationType: "read",
    description:
      "Discover every current TiMEM Space memory, rule-learning, knowledge, conversation, credit, and notification MCP tool with its live schema.",
    requiredScopes: [],
    followUpActions: ["timem_space.call_tool"],
    inputSchema: s.object("No input is required.", {}, { optional: [] }),
    outputSchema: s.object(
      "The current TiMEM Space MCP tool catalog.",
      {
        tools: s.array("Tools currently exposed to this TiMEM Space connection.", toolSummarySchema),
      },
      { optional: [] },
    ),
  }),
  defineProviderAction("timem_space", {
    name: "call_tool",
    operationType: "destructive",
    description:
      "Call any current TiMEM Space MCP tool with JSON arguments after checking its live schema and behavior annotations.",
    requiredScopes: [],
    followUpActions: ["timem_space.list_tools"],
    inputSchema: s.object(
      "Input for invoking one current TiMEM Space MCP tool.",
      {
        toolName: s.nonEmptyString("The exact tool name returned by list_tools."),
        arguments: s.looseObject("JSON arguments matching the inputSchema returned for the selected tool."),
      },
      { optional: ["arguments"] },
    ),
    outputSchema: toolResultSchema,
  }),
];
