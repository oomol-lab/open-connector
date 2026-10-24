import type { CredentialValidationResult } from "../../core/types.ts";
import type { McpClientToolResult, McpToolOptions } from "../mcp-tools.ts";
import type { ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-executors.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { sha256Hex } from "../../core/aws-sigv4.ts";
import {
  looseArray,
  optionalInteger,
  optionalNumber,
  optionalRawString,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { callMcpTool, listMcpTools } from "../mcp-tools.ts";
import {
  parseProviderJsonBodyText,
  providerInputError,
  providerResponseError,
  requiredInputString,
} from "../provider-runtime.ts";

const hostedEndpoint = "https://mcp.draw.io/mcp";
const defaultShapeLimit = 10;
// The two create_diagram tool errors that judge the submitted source; anything else is a server failure.
const sourceVerdictPrefixes = ["Could not extract draw.io XML", "Provide exactly one of"];
const errorsHeading = "ERRORS (will cause rendering issues):\n- ";
const warningsHeading = "WARNINGS (may cause issues):\n- ";

interface DrawioFindings {
  errors: string[];
  warnings: string[];
}

interface DrawioShape {
  title: string;
  style: string;
  width: number;
  height: number;
}

export const drawioMcpActionHandlers: ProviderActionHandlers<"drawio_mcp", ProviderRuntimeHandler<McpToolOptions>> = {
  async create_diagram(input, options) {
    const result = await callMcpTool({
      ...options,
      toolName: "create_diagram",
      arguments: { mermaid: optionalString(input.mermaid), xml: optionalString(input.xml) },
      transformToolResult: rejectDiagramSource,
    });
    const texts = readTextContent(result);
    const editorUrl = readEditorUrl(texts);
    if (editorUrl === undefined) {
      throw providerResponseError(
        "draw.io MCP create_diagram response did not include an editor link; a self-hosted server must be jgraph/drawio-mcp mcp-app-server 1.0.4 or later",
      );
    }
    return { editorUrl, ...readFindings(texts) };
  },
  async search_shapes(input, options) {
    const result = await callMcpTool({
      ...options,
      toolName: "search_shapes",
      arguments: {
        query: requiredInputString(input.query, "query"),
        limit: optionalInteger(input.limit) ?? defaultShapeLimit,
      },
    });
    return { shapes: readShapes(result) };
  },
};

/** Resolve the MCP server a connection points at; a blank endpoint selects the hosted draw.io server. */
export function createDrawioMcpContext(
  values: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): McpToolOptions {
  return {
    endpoint: normalizeDrawioMcpEndpoint(values.mcpEndpoint),
    service: "draw.io",
    fetcher,
    signal,
    terminateSession: true,
    maxResponseBytes: 4 * 1024 * 1024,
    // tools/list is about 64 KB because create_diagram embeds draw.io's drawing reference in its description.
    toolListMaxBytes: 1024 * 1024,
    toolListMaxPages: 5,
    toolListMaxTools: 100,
  };
}

/** Confirm the endpoint serves the draw.io tools and derive a stable identity from the endpoint. */
export async function validateDrawioMcpCredential(
  values: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const options = createDrawioMcpContext(values, fetcher, signal);
  const discovered = new Set((await listMcpTools(options)).map((tool) => tool.name));
  const missing = Object.keys(drawioMcpActionHandlers).filter((toolName) => !discovered.has(toolName));
  if (missing.length > 0) {
    throw providerInputError(`mcpEndpoint does not serve the draw.io MCP tools: missing ${missing.join(", ")}`);
  }

  return {
    profile: {
      accountId: `drawio_mcp:mcp:${sha256Hex(options.endpoint).slice(0, 16)}`,
      displayName: `draw.io MCP · ${new URL(options.endpoint).host}`,
    },
    grantedScopes: [],
    metadata: { mcpEndpoint: options.endpoint },
  };
}

function normalizeDrawioMcpEndpoint(value: unknown): string {
  const allowPrivateNetwork = isPrivateNetworkAccessAllowed();
  const url = assertPublicHttpUrl(optionalString(value) ?? hostedEndpoint, {
    fieldName: "mcpEndpoint",
    createError: providerInputError,
    allowPrivateNetwork,
  });
  if (url.username || url.password) {
    throw providerInputError("mcpEndpoint must not include a username or password");
  }
  if (url.protocol === "http:" && !allowPrivateNetwork) {
    throw providerInputError("mcpEndpoint must use https unless private-network access is enabled");
  }
  url.search = "";
  url.hash = "";
  return url.toString();
}

// Also drops structured content: the editor link and findings only ever arrive as text blocks,
// which the shared result normalizer would otherwise discard in favour of structuredContent.
function rejectDiagramSource(result: McpClientToolResult): McpClientToolResult {
  const message = "content" in result && result.isError ? readTextContent(result).join("\n") : "";
  if (sourceVerdictPrefixes.some((prefix) => message.startsWith(prefix))) {
    throw providerInputError(`draw.io rejected the diagram source: ${message.slice(0, 300)}`);
  }
  return { ...result, structuredContent: undefined };
}

// draw.io puts the editor link on a line of its own after the source echo, which is single-line JSON, and after
// the XML findings, which quote attribute values from the source verbatim, line breaks included. Skipping the
// findings and taking the last such line keeps a link written inside the submitted source from being returned instead.
function readEditorUrl(texts: string[]): string | undefined {
  return texts
    .filter((text) => !isFindingsText(text))
    .flatMap((text) => text.split("\n"))
    .findLast((line) => line.startsWith("https://") && line.includes("#create="));
}

// draw.io reports XML problems in one text block of "ERRORS (...):\n- item" and "WARNINGS (...):\n- item" sections.
function isFindingsText(text: string): boolean {
  return text.startsWith("ERRORS ") || text.startsWith("WARNINGS ");
}

function readTextContent(result: unknown): string[] {
  return looseArray(optionalRecord(result)?.content).flatMap((item) => {
    const content = optionalRecord(item);
    const text = content?.type === "text" ? optionalRawString(content.text) : undefined;
    return text === undefined ? [] : [text];
  });
}

// Findings items quote attribute values verbatim, so blank lines and line starts can come from the source. Only
// draw.io's exact layout splits the block: each heading is followed by the items joined with "\n- ", and a blank
// line separates the errors section from the warnings section. The layout leaves no way to tell a quoted value from
// that structure: a value that itself contains "\n- " still reads as two items, and one that contains the whole
// "\n\nWARNINGS (may cause issues):\n- " separator can move items between errors and warnings. The editor link is
// unaffected, since readEditorUrl skips the findings block as a whole.
function readFindings(texts: string[]): DrawioFindings {
  const text = texts.find(isFindingsText) ?? "";
  if (text.startsWith(warningsHeading)) {
    return { errors: [], warnings: splitFindings(text.slice(warningsHeading.length)) };
  }
  if (!text.startsWith(errorsHeading)) {
    return { errors: [], warnings: [] };
  }
  const body = text.slice(errorsHeading.length);
  const separator = body.lastIndexOf(`\n\n${warningsHeading}`);
  if (separator < 0) {
    return { errors: splitFindings(body), warnings: [] };
  }
  return {
    errors: splitFindings(body.slice(0, separator)),
    warnings: splitFindings(body.slice(separator + 2 + warningsHeading.length)),
  };
}

// draw.io never reports an empty finding, so an empty piece can only come from a quoted value that contains the
// separator, such as one ending in "\n- ", and is dropped.
function splitFindings(section: string): string[] {
  return section.split("\n- ").filter((item) => item !== "");
}

// Newer draw.io servers return structured shapes; the hosted server returns a JSON array as text.
function readShapes(result: unknown): DrawioShape[] {
  const structured = optionalRecord(result)?.shapes;
  const payload = structured === undefined ? parseShapeText(readTextContent(result)[0]) : structured;
  if (!Array.isArray(payload)) {
    throw providerResponseError("draw.io MCP search_shapes returned an unexpected payload");
  }
  return payload.map(readShape);
}

function parseShapeText(text: string | undefined): unknown {
  if (text === undefined) {
    throw providerResponseError("draw.io MCP search_shapes response did not include any text");
  }
  if (text.startsWith("No shapes found")) return [];
  return parseProviderJsonBodyText(text, {
    emptyBody: [],
    invalidJsonMessage: `draw.io MCP search_shapes returned an unexpected payload: ${text.slice(0, 200)}`,
  });
}

function readShape(value: unknown): DrawioShape {
  const shape = optionalRecord(value);
  const style = optionalRawString(shape?.style);
  const width = optionalNumber(shape?.w);
  const height = optionalNumber(shape?.h);
  if (!style || width === undefined || height === undefined) {
    throw providerResponseError("draw.io MCP search_shapes returned a shape without a style or size");
  }
  return { title: optionalRawString(shape?.title) ?? "", style, width, height };
}
