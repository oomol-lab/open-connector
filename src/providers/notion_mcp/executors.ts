import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { OAuthProviderContext, ProviderActionSources, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { Client } from "@modelcontextprotocol/client";

import { ProtocolError, SdkHttpError, UnauthorizedError } from "@modelcontextprotocol/client";
import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRawString,
  optionalRecord,
  optionalString,
  optionalStringArray,
  requiredRawString,
} from "../../core/cast.ts";
import { withMcpClient } from "../mcp-client.ts";
import {
  defineOAuthProviderExecutors,
  mapProviderActionSources,
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import { notionMcpEndpoint } from "./endpoints.ts";
import {
  decodeNotionToolText,
  parseNotionComments,
  parseNotionPage,
  parseNotionSearch,
  parseNotionSelf,
  parseNotionToolAccess,
} from "./mcp-response.ts";

const service = "notion_mcp";
const selfUserId = "self";

type NotionMcpPhase = "validate" | "execute";
type NotionMcpContext = Pick<OAuthProviderContext, "accessToken" | "fetcher" | "signal">;

/** One action's tool, the arguments it sends, and the typed reading of the answer beside the raw text. */
interface NotionMcpActionSource {
  tool: string;
  arguments(input: Record<string, unknown>): Record<string, unknown>;
  parse(value: unknown, input: Record<string, unknown>): Record<string, unknown>;
}

interface NotionMcpToolResult {
  raw: string;
  value: unknown;
}

const toolsByAction: ProviderActionSources<typeof service, NotionMcpActionSource> = {
  get_self: {
    tool: "notion-get-users",
    arguments: () => ({ user_id: selfUserId }),
    parse: (value) => compactObject({ user: parseNotionSelf(value) }),
  },
  search: {
    tool: "notion-search",
    arguments: searchArguments,
    parse: (value) => ({ ...parseNotionSearch(value) }),
  },
  fetch_page: {
    tool: "notion-fetch",
    arguments: (input) => ({ id: requiredInputString(input.id, "id") }),
    parse: (value, input) => ({ id: requiredInputString(input.id, "id"), ...parseNotionPage(value) }),
  },
  list_comments: {
    tool: "notion-get-comments",
    arguments: (input) => ({
      page_id: requiredInputString(input.page_id, "page_id"),
      include_all_blocks: optionalBoolean(input.include_all_blocks) ?? true,
    }),
    parse: (value) => ({ comments: parseNotionComments(value) }),
  },
  tool_access: {
    tool: "notion-get-tool-access",
    arguments: () => ({}),
    parse: (value) => ({ tools: parseNotionToolAccess(value) }),
  },
};

const handlers = mapProviderActionSources(
  service,
  toolsByAction,
  (_actionName, source): ProviderRuntimeHandler<OAuthProviderContext> =>
    async (input, context) => {
      const result = await callNotionTool(context, source.tool, source.arguments(input));
      return { ...source.parse(result.value, input), raw: result.raw };
    },
);

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, handlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  /** Require every tool the actions map, then identify the user so the account key is the Notion user ID. */
  async oauth2(input, { fetcher, signal }) {
    const context: NotionMcpContext = { accessToken: input.accessToken, fetcher, signal };
    const { toolCount, self } = await withNotionMcpClient(context, "validate", async (client, signal) => {
      const tools = await listNotionTools(client, signal);
      const available = new Set(tools.map((tool) => tool.name));
      const missing = Object.values(toolsByAction)
        .map((source) => source.tool)
        .filter((tool) => !available.has(tool));
      if (missing.length > 0) {
        throw new ProviderRequestError(
          502,
          `Notion MCP did not expose the tools this connector needs: ${[...new Set(missing)].join(", ")}.`,
        );
      }
      const result = await client.callTool(
        { name: toolsByAction.get_self.tool, arguments: toolsByAction.get_self.arguments({}) },
        { signal },
      );
      return {
        toolCount: tools.length,
        self: parseNotionSelf(readNotionToolResult(toolsByAction.get_self.tool, result).value),
      };
    });
    const accountId = self?.id;
    if (!accountId) throw providerResponseError("Notion MCP did not identify the connected user.");
    return {
      profile: { accountId, displayName: self.name ?? self.email ?? accountId },
      grantedScopes: optionalString(input.metadata.scope)?.split(" ") ?? [],
      metadata: { mcpEndpoint: notionMcpEndpoint, discoveredToolCount: toolCount },
    };
  },
};

/** The recorded notion-search arguments: typed filters nest under `filters`; extra ones pass through beneath them. */
function searchArguments(input: Record<string, unknown>): Record<string, unknown> {
  const filters = compactObject({
    ...optionalRecord(input.filters),
    last_edited_date_range: optionalRecord(input.last_edited_date_range),
    created_date_range: optionalRecord(input.created_date_range),
    created_by_user_ids: optionalStringArray(input.created_by_user_ids),
    edited_by_user_ids: optionalStringArray(input.edited_by_user_ids),
  });
  return compactObject({
    query: optionalRawString(input.query) ?? "",
    sort: optionalString(input.sort),
    page_size: optionalInteger(input.page_size),
    max_highlight_length: optionalInteger(input.max_highlight_length),
    filters: Object.keys(filters).length > 0 ? filters : undefined,
  });
}

async function listNotionTools(client: Client, signal: AbortSignal): Promise<Array<{ name: string }>> {
  const tools: Array<{ name: string }> = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await client.listTools(cursor === undefined ? {} : { cursor }, { signal });
    tools.push(...page.tools);
    cursor = page.nextCursor;
    if (cursor !== undefined) {
      if (cursors.has(cursor)) throw providerResponseError("Notion MCP tools/list returned a repeated cursor.");
      cursors.add(cursor);
    }
  } while (cursor !== undefined);
  return tools;
}

async function callNotionTool(
  context: NotionMcpContext,
  name: string,
  input: Record<string, unknown>,
): Promise<NotionMcpToolResult> {
  const result = await withNotionMcpClient(context, "execute", (client, signal) =>
    client.callTool({ name, arguments: input }, { signal }),
  );
  return readNotionToolResult(name, result);
}

/** The text blocks joined are the raw answer; structured content, when the server sends it, is the value. */
function readNotionToolResult(name: string, result: unknown): NotionMcpToolResult {
  const record = requiredResponseRecord(result, "Notion MCP result");
  if (record.isError === true) throw new ProviderRequestError(502, `Notion MCP tool ${name} failed.`, record);
  const texts = (Array.isArray(record.content) ? record.content : []).flatMap((block) => {
    const item = optionalRecord(block);
    return item?.type === "text" ? [requiredRawString(item.text, "Notion MCP text", providerResponseError)] : [];
  });
  const structured = optionalRecord(record.structuredContent);
  if (texts.length === 0 && structured === undefined) throw providerResponseError("Notion MCP returned no content.");
  const raw = texts.length > 0 ? texts.join("\n") : JSON.stringify(structured);
  return { raw, value: structured ?? decodeNotionToolText(raw) };
}

function withNotionMcpClient<T>(
  context: NotionMcpContext,
  phase: NotionMcpPhase,
  run: (client: Client, signal: AbortSignal) => Promise<T>,
): Promise<T> {
  return runProviderRequest({ signal: context.signal, label: "Notion MCP" }, (signal) =>
    withMcpClient(
      {
        endpoint: new URL(notionMcpEndpoint),
        transport: "streamable_http",
        fetcher: context.fetcher,
        headers: { authorization: `Bearer ${context.accessToken}`, "user-agent": providerUserAgent },
        redirect: "manual",
        signal,
        mapError: (error) => mapNotionMcpError(error, phase),
      },
      (client) => run(client, signal),
    ),
  );
}

/**
 * Sign-in reports a rejected token as invalid input (400); a run reports it as an expired authorization (401).
 * Anything unrecognized is left to runProviderRequest, which tells a timeout (504) from a failure (502).
 */
function mapNotionMcpError(error: unknown, phase: NotionMcpPhase): unknown {
  if (error instanceof ProviderRequestError) return error;
  const credentialStatus = phase === "validate" ? 400 : 401;
  if (error instanceof UnauthorizedError) {
    return new ProviderRequestError(credentialStatus, "Notion MCP credential is invalid or expired.");
  }
  if (error instanceof SdkHttpError) {
    const status = error.status;
    if (status === 401 || status === 403) {
      return new ProviderRequestError(credentialStatus, "Notion MCP credential is invalid or expired.");
    }
    // The SDK error carries the response body; only the status is reported so a token echoed in it never is.
    const providerStatus = 400 <= status && status < 500 ? status : 502;
    return new ProviderRequestError(providerStatus, `Notion MCP request failed with HTTP ${status}.`);
  }
  if (error instanceof ProtocolError) {
    return new ProviderRequestError(502, `Notion MCP request failed: ${error.message}`);
  }
  return error;
}
