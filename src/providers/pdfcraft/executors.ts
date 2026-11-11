import type { ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { McpToolOptions } from "../mcp-tools.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-executors.ts";

import { optionalString, recordOrEmpty } from "../../core/cast.ts";
import { assertPublicHttpUrl, readBoundedResponseBytes } from "../../core/request.ts";
import { callMcpTool, listMcpTools } from "../mcp-tools.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  providerFetch,
  providerInputError,
  providerResponseError,
  ProviderRequestError,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

const handlers: ProviderActionHandlers<"pdfcraft", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  async list_tools(_input, context) {
    return { tools: await listMcpTools(connection(context), { includeAnnotations: true, includeOutputSchema: true }) };
  },
  async call_tool(input, context) {
    return {
      result: await callMcpTool({
        ...connection(context),
        toolName: String(input.toolName),
        arguments: recordOrEmpty(input.arguments),
      }),
    };
  },
  get_transform(input, context) {
    return toolData(context, "get_transform", { uuid: input.uuid });
  },
  submit_transform: submitTransform,
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors("pdfcraft", handlers);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "pdfcraft",
  baseUrl: "https://api.pdfcraft.ai",
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json, text/event-stream");
  },
});

function connection(context: ApiKeyProviderContext): McpToolOptions {
  return {
    endpoint: "https://api.pdfcraft.ai/v1/mcp",
    service: "PDFCraft",
    headers: { authorization: `Bearer ${context.apiKey}` },
    fetcher: context.fetcher,
    signal: context.signal,
    protocolVersion: "modern",
  };
}

async function toolData(
  context: ApiKeyProviderContext,
  toolName: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const envelope = requiredResponseRecord(
    await callMcpTool({ ...connection(context), toolName, arguments: args }),
    "PDFCraft tool result",
  );
  return requiredResponseRecord(envelope.data, "PDFCraft tool data");
}

async function submitTransform(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const parameters = recordOrEmpty(input.parameters);
  validateConversion(input.input_format, parameters);
  const url = assertPublicHttpUrl(String(input.fileUrl), { fieldName: "fileUrl", createError: providerInputError });
  const bytes = await runProviderRequest(
    { label: "PDFCraft source download", signal: context.signal, timeoutMs: 120_000 },
    async (signal) => {
      const response = await providerFetch(url, { signal });
      if (!response.ok)
        throw new ProviderRequestError(response.status, `Source download failed with HTTP ${response.status}`);
      return readBoundedResponseBytes(response, {
        maxBytes: 100 * 1024 * 1024,
        fieldName: "PDFCraft source file",
        createError: () => providerInputError("Source file exceeds the Connector limit of 100 MiB"),
        signal,
      });
    },
  );
  const task = await toolData(context, "create_transform", {
    input_format: input.input_format,
    input_filename: input.input_filename,
  });
  const uuid = optionalString(task.uuid);
  if (!uuid) throw providerResponseError("PDFCraft create_transform returned no UUID");
  try {
    const upload = await toolData(context, "get_upload_urls", { uuid });
    const putUrl = optionalString(upload.put_url);
    if (!putUrl) throw providerResponseError("PDFCraft returned no upload URL for the new task");
    const uploadUrl = assertPublicHttpUrl(putUrl, { fieldName: "put_url", createError: providerResponseError });
    const headers = requiredResponseRecord(upload.headers, "PDFCraft upload headers");
    const uploadHeaders = new Headers();
    for (const [name, value] of Object.entries(headers)) {
      if (typeof value !== "string") throw providerResponseError("Invalid PDFCraft upload header");
      uploadHeaders.set(name, value);
    }
    await runProviderRequest(
      { label: "PDFCraft upload", signal: context.signal, timeoutMs: 120_000 },
      async (signal) => {
        const response = await providerFetch(uploadUrl, { method: "PUT", headers: uploadHeaders, body: bytes, signal });
        await response.body?.cancel();
        if (!response.ok)
          throw new ProviderRequestError(response.status, `PDFCraft upload failed with HTTP ${response.status}`);
      },
    );
    return await toolData(context, "launch_transform", { uuid, parameters });
  } catch (error) {
    const message = `PDFCraft task ${uuid}: ${error instanceof Error ? error.message : "Request failed"}. Resume this UUID through call_tool; do not automatically resubmit.`;
    if (error instanceof ProviderRequestError) {
      error.message = message;
      throw error;
    }
    throw providerResponseError(message);
  }
}

function validateConversion(format: unknown, parameters: Record<string, unknown>): void {
  const translating = parameters.target_language !== undefined;
  const output = parameters.output_format;
  const rendering = parameters.rendering_mode;
  if (format === "epub") {
    if (output !== "epub") {
      throw providerInputError("EPUB input only supports EPUB output");
    }
    if (!translating) {
      throw providerInputError("EPUB input requires target_language");
    }
    if (parameters.refinement !== undefined) {
      throw providerInputError("EPUB input does not support refinement");
    }
  }
  if (output === "pdf") {
    if (!translating) {
      throw providerInputError("PDF output requires target_language");
    }
    if (rendering !== undefined && rendering !== "replace") {
      throw providerInputError("PDF output only supports replace rendering_mode");
    }
  }
  if (!translating) {
    if (parameters.translation_prompt !== undefined) {
      throw providerInputError("translation_prompt requires target_language");
    }
    if (rendering !== undefined && rendering !== "source") {
      throw providerInputError("Rendering without translation requires source mode");
    }
  }
  if (translating && rendering === "source") {
    throw providerInputError("Translation does not support source rendering_mode");
  }
}
