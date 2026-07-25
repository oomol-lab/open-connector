import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "excalidraw_mcp";

const readMeOutputSchema = s.actionOutput(
  {
    content: s.string("The Excalidraw MCP reference text returned by read_me."),
  },
  "The Excalidraw MCP reference text.",
);

const createViewInputSchema = s.actionInput(
  {
    elements: s.string(
      "A compact JSON array string of Excalidraw elements. Call read_me first for the element format and ordering rules.",
      { minLength: 2 },
    ),
  },
  ["elements"],
  "Input for rendering a diagram with the Excalidraw MCP create_view tool.",
);

const createViewOutputSchema = s.actionOutput(
  {
    checkpointId: s.string("The Excalidraw checkpoint ID returned by the tool."),
    content: s.string("The confirmation message returned by the tool."),
  },
  "The result of rendering a diagram with Excalidraw MCP.",
);

export const excalidrawMcpActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "read_me",
    description: "Fetch the Excalidraw element format guide and drawing tips from the MCP server.",
    requiredScopes: [],
    inputSchema: s.actionInput({}, [], "No input is required."),
    outputSchema: readMeOutputSchema,
    followUpActions: ["excalidraw_mcp.create_view"],
  }),
  defineProviderAction(service, {
    name: "create_view",
    description: "Render a hand-drawn Excalidraw diagram from a JSON array string of elements.",
    requiredScopes: [],
    inputSchema: createViewInputSchema,
    outputSchema: createViewOutputSchema,
    followUpActions: ["excalidraw_mcp.read_me"],
  }),
];
