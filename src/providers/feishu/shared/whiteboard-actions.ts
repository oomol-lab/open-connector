import type { ActionDefinition } from "../../../core/types.ts";

import { s } from "../../../core/json-schema.ts";
import { defineProviderAction } from "../../../core/provider-definition.ts";
export const feishuWhiteboardProviderScopes = {
  read: "board:whiteboard:node:read",
  create: "board:whiteboard:node:create",
};
const whiteboardTokenSchema = s.string("The Feishu whiteboard token.", { minLength: 1 });
const whiteboardNodeSchema = s.looseObject("A raw Feishu whiteboard node using the Board OpenAPI shape.");
const idempotentTokenSchema = s.string("An idempotency token with at least 10 characters.", {
  minLength: 10,
});
export function createFeishuWhiteboardActions(service: string): readonly ActionDefinition[] {
  return [
    defineProviderAction(service, {
      name: "list_whiteboard_nodes",
      operationType: "read",
      description: "List the raw nodes in a Feishu whiteboard, including Mermaid or PlantUML source metadata.",
      requiredScopes: [feishuWhiteboardProviderScopes.read],
      providerPermissions: [feishuWhiteboardProviderScopes.read],
      inputSchema: s.object(
        "Identify the whiteboard to read.",
        {
          whiteboardToken: whiteboardTokenSchema,
        },
        {
          optional: [],
        },
      ),
      outputSchema: s.object(
        "The raw whiteboard nodes.",
        {
          nodes: s.array("The nodes in the whiteboard.", whiteboardNodeSchema),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "create_whiteboard_nodes",
      operationType: "write",
      description: "Create raw OpenAPI nodes in a Feishu whiteboard, optionally replacing all existing content.",
      requiredScopes: [feishuWhiteboardProviderScopes.create],
      providerPermissions: [feishuWhiteboardProviderScopes.create],
      inputSchema: s.object(
        "Identify the whiteboard and provide raw nodes.",
        {
          whiteboardToken: whiteboardTokenSchema,
          nodes: s.array("The raw whiteboard nodes to create.", whiteboardNodeSchema, {
            minItems: 1,
          }),
          overwrite: s.boolean("Delete existing whiteboard content before creating nodes."),
          idempotentToken: idempotentTokenSchema,
        },
        {
          optional: ["overwrite", "idempotentToken"],
        },
      ),
      outputSchema: s.object(
        "The created whiteboard node IDs.",
        {
          createdNodeIds: s.array("The IDs of the created nodes.", s.string("A node ID.")),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "create_whiteboard_diagram",
      operationType: "write",
      description: "Create a Mermaid, PlantUML, or SVG diagram node in a Feishu whiteboard.",
      requiredScopes: [feishuWhiteboardProviderScopes.create],
      providerPermissions: [feishuWhiteboardProviderScopes.create],
      inputSchema: s.object(
        "Identify the whiteboard and provide diagram source.",
        {
          whiteboardToken: whiteboardTokenSchema,
          format: s.stringEnum("The diagram source format.", ["plantuml", "mermaid", "svg"]),
          source: s.string("The complete diagram source.", { minLength: 1 }),
          overwrite: s.boolean("Delete existing whiteboard content before creating the diagram."),
          idempotentToken: idempotentTokenSchema,
        },
        {
          optional: ["overwrite", "idempotentToken"],
        },
      ),
      outputSchema: s.object(
        "The created whiteboard diagram node.",
        {
          createdNodeId: s.string("The created diagram node ID."),
        },
        {
          optional: [],
        },
      ),
    }),
    defineProviderAction(service, {
      name: "export_whiteboard_svg",
      operationType: "read",
      description:
        "Export a Feishu whiteboard as SVG and return the API's Base64 payload without writing a local file.",
      requiredScopes: [feishuWhiteboardProviderScopes.read],
      providerPermissions: [feishuWhiteboardProviderScopes.read],
      inputSchema: s.object(
        "Identify the whiteboard to export.",
        {
          whiteboardToken: whiteboardTokenSchema,
        },
        {
          optional: [],
        },
      ),
      outputSchema: s.object(
        "The exported SVG payload.",
        {
          contentBase64: s.string("The Base64-encoded SVG content."),
          mimeType: s.string("The SVG MIME type returned by Feishu."),
        },
        {
          optional: [],
        },
      ),
    }),
  ];
}
