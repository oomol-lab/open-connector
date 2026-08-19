import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalString } from "../../core/cast.ts";
import { withMcpClient } from "../mcp-client.ts";
import { ProviderRequestError } from "../provider-runtime.ts";

const cloudflareDocsMcpUrl = "https://docs.mcp.cloudflare.com/mcp";

export interface CloudflareDocsActionContext {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
}

export const cloudflareDocsActionHandlers: ProviderActionHandlers<
  "cloudflare_docs",
  ProviderRuntimeHandler<CloudflareDocsActionContext>
> = {
  search_cloudflare_documentation(input, context) {
    return searchCloudflareDocumentation(input, context);
  },
  get_pages_to_workers_migration_guide(input, context) {
    return getPagesToWorkersMigrationGuide(input, context);
  },
};

export async function searchCloudflareDocumentation(
  input: Record<string, unknown>,
  context: CloudflareDocsActionContext,
): Promise<Record<string, unknown>> {
  const query = optionalString(input.query)?.trim();
  if (!query) {
    throw new ProviderRequestError(400, "query parameter is required");
  }

  return callCloudflareDocsTool("search_cloudflare_documentation", { query }, context);
}

export async function getPagesToWorkersMigrationGuide(
  input: Record<string, unknown>,
  context: CloudflareDocsActionContext,
): Promise<Record<string, unknown>> {
  return callCloudflareDocsTool("migrate_pages_to_workers_guide", input, context);
}

async function callCloudflareDocsTool(
  toolName: string,
  args: Record<string, unknown>,
  context: CloudflareDocsActionContext,
): Promise<Record<string, unknown>> {
  try {
    return await withMcpClient(
      {
        endpoint: new URL(cloudflareDocsMcpUrl),
        transport: "streamable_http",
        fetcher: context.fetcher,
      },
      async (client) => {
        const result = await client.callTool({ name: toolName, arguments: args });
        if (result.isError) {
          const content = result.content as Array<{ type?: string; text?: string }> | undefined;
          const text = content?.find((c) => c.type === "text")?.text;
          throw new ProviderRequestError(502, text ?? "Cloudflare Docs MCP tool returned an unknown error.");
        }
        return result as Record<string, unknown>;
      },
    );
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    throw new ProviderRequestError(
      502,
      `Cloudflare Docs MCP request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
