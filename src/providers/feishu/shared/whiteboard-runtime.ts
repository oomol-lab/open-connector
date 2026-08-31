import type { FeishuJsonRequest } from "./client.ts";

import { optionalString, optionalStringArray } from "../../../core/cast.ts";
import { ProviderRequestError, providerResponseError } from "../../provider-runtime.ts";

interface FeishuWhiteboardActionHandler {
  (input: Record<string, unknown>): Promise<unknown>;
}

export function createFeishuWhiteboardActionHandlers(
  request: FeishuJsonRequest,
): Record<string, FeishuWhiteboardActionHandler> {
  return {
    list_whiteboard_nodes(input) {
      return listWhiteboardNodes(input, request);
    },
    create_whiteboard_nodes(input) {
      return createWhiteboardNodes(input, request);
    },
    create_whiteboard_diagram(input) {
      return createWhiteboardDiagram(input, request);
    },
    export_whiteboard_svg(input) {
      return exportWhiteboardSvg(input, request);
    },
  };
}

async function listWhiteboardNodes(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const token = requireString(input.whiteboardToken, "whiteboardToken");
  const data = await request({
    path: `/board/v1/whiteboards/${encodeURIComponent(token)}/nodes`,
  });
  return {
    nodes: Array.isArray(data.nodes) ? data.nodes : [],
  };
}

async function createWhiteboardNodes(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const token = requireString(input.whiteboardToken, "whiteboardToken");
  const nodes = requireArray(input.nodes, "nodes");
  const data = await request({
    method: "POST",
    path: `/board/v1/whiteboards/${encodeURIComponent(token)}/nodes`,
    query: {
      client_token: optionalString(input.idempotentToken),
    },
    body: {
      nodes,
      overwrite: input.overwrite === true,
    },
  });
  const ids = optionalStringArray(data.ids);
  if (!ids) {
    throw providerResponseError("Feishu whiteboard response is missing a string ids array");
  }
  return { createdNodeIds: ids };
}

async function createWhiteboardDiagram(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const token = requireString(input.whiteboardToken, "whiteboardToken");
  const format = requireString(input.format, "format");
  const syntaxType = {
    plantuml: 1,
    mermaid: 2,
    svg: 3,
  }[format];
  if (!syntaxType) {
    throw new ProviderRequestError(400, "format must be plantuml, mermaid, or svg");
  }
  const data = await request({
    method: "POST",
    path: `/board/v1/whiteboards/${encodeURIComponent(token)}/nodes/plantuml`,
    query: {
      client_token: optionalString(input.idempotentToken),
    },
    body: {
      plant_uml_code: requireString(input.source, "source"),
      syntax_type: syntaxType,
      parse_mode: 1,
      diagram_type: 0,
      overwrite: input.overwrite === true,
    },
  });
  return {
    createdNodeId: requireResponseString(data.node_id, "node_id"),
  };
}

async function exportWhiteboardSvg(input: Record<string, unknown>, request: FeishuJsonRequest) {
  const token = requireString(input.whiteboardToken, "whiteboardToken");
  const data = await request({
    method: "POST",
    path: `/board/v1/whiteboards/${encodeURIComponent(token)}/export`,
    body: {
      export_type: "svg",
    },
  });
  return {
    contentBase64: requireResponseString(data.content, "content"),
    mimeType: optionalString(data.mime_type) ?? "image/svg+xml",
  };
}

function requireArray(value: unknown, fieldName: string) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} must contain at least one item`);
  }
  return value;
}

function requireString(value: unknown, fieldName: string) {
  const string = optionalString(value);
  if (!string) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return string;
}

function requireResponseString(value: unknown, fieldName: string) {
  const string = optionalString(value);
  if (!string) {
    throw providerResponseError(`Feishu whiteboard response is missing ${fieldName}`);
  }
  return string;
}
