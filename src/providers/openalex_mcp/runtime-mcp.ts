import type { CredentialValidationResult, CredentialValidatorOptions, ResolvedCredential } from "../../core/types.ts";
import type { OAuthProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-executors.ts";
import type { Client } from "@modelcontextprotocol/client";

import { ProtocolError, SdkHttpError, UnauthorizedError } from "@modelcontextprotocol/client";
import {
  compactObject,
  looseArray,
  optionalRawString,
  optionalRecord,
  optionalString,
  pickOptionalString,
} from "../../core/cast.ts";
import { withMcpClient } from "../mcp-client.ts";
import { mapProviderActionNames } from "../provider-executors.ts";
import {
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
  runProviderRequest,
} from "../provider-runtime.ts";
import { openalexMcpActionNames } from "./actions.ts";
import { openalexMcpEndpoint } from "./endpoints.ts";

const service = "openalex_mcp";
type OpenalexMcpContext = Pick<OAuthProviderContext, "accessToken" | "fetcher" | "signal">;
type OpenalexMcpToolCall = Awaited<ReturnType<Client["callTool"]>>;

/**
 * One action per OpenAlex MCP tool, under the same name: the handler compacts
 * the schema-validated input, calls the tool, and returns the JSON it carried
 * as `result` beside its text as `raw`, so a server-side tool change needs no
 * connector change beyond the action list in actions.ts.
 */
export const openalexMcpActionHandlers: ProviderActionHandlers<
  typeof service,
  ProviderRuntimeHandler<OAuthProviderContext>
> = mapProviderActionNames(service, openalexMcpActionNames, (name) => async (input, context) => {
  const result = await callOpenalexMcpTool(context, name, compactObject(input));
  return { result: result.payload ?? null, raw: result.text };
});

/**
 * The tools every grant must serve at sign-in. The remaining actions call
 * their tools as they are and fail on their own when the server does not list
 * them, so only these three are pinned: get_my_account profiles the
 * connection, and search_works with get_work are the reads every flow starts
 * from.
 */
const openalexMcpSignInTools = ["get_my_account", "search_works", "get_work"];

/** One tool call's text as returned plus the JSON it carried, when it carried any. */
interface OpenalexMcpToolResult {
  text: string;
  payload: unknown;
}

const maxToolListPages = 20;

/**
 * Validate the OAuth grant against the MCP server: every sign-in tool must be
 * listed (a rename shows up here, at sign-in, never mid-poll), then
 * get_my_account supplies the profile with the claimed author's OpenAlex ID.
 */
export async function validateOpenalexMcpCredential(
  credential: Extract<ResolvedCredential, { authType: "oauth2" }>,
  options: CredentialValidatorOptions,
): Promise<CredentialValidationResult> {
  const context = { accessToken: credential.accessToken, fetcher: options.fetcher, signal: options.signal };
  return withOpenalexMcpClient(context, async (client, signal) => {
    const available = await listOpenalexMcpToolNames(client, signal);
    const missing = openalexMcpSignInTools.filter((name) => !available.has(name));
    if (missing.length > 0) {
      throw new ProviderRequestError(
        502,
        `OpenAlex MCP did not expose the ${missing.join(", ")} tool${missing.length > 1 ? "s" : ""} this connector needs; OpenAlex may have renamed ${missing.length > 1 ? "them" : "it"}.`,
      );
    }
    const result = readOpenalexMcpToolResult(
      "get_my_account",
      await client.callTool({ name: "get_my_account", arguments: {} }, { signal }),
    );
    const account = parseOpenalexMcpAccount(result.payload);
    if (!account) throw providerResponseError("OpenAlex MCP did not return the signed-in account.");
    return {
      profile: { accountId: account.accountId, displayName: account.displayName },
      grantedScopes: optionalString(credential.metadata.scope)?.split(" ") ?? [],
      metadata: { mcpEndpoint: openalexMcpEndpoint, discoveredToolCount: available.size },
    };
  });
}

async function listOpenalexMcpToolNames(client: Client, signal: AbortSignal): Promise<Set<string>> {
  const names = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < maxToolListPages; page += 1) {
    const listed = await client.listTools(cursor ? { cursor } : {}, { signal });
    for (const tool of listed.tools) names.add(tool.name);
    cursor = optionalString(listed.nextCursor);
    if (!cursor) break;
  }
  return names;
}

/** Call one tool in a fresh MCP session and return its text and parsed payload. */
function callOpenalexMcpTool(
  context: OpenalexMcpContext,
  name: string,
  args: Record<string, unknown>,
): Promise<OpenalexMcpToolResult> {
  return withOpenalexMcpClient(context, async (client, signal) =>
    readOpenalexMcpToolResult(name, await client.callTool({ name, arguments: args }, { signal })),
  );
}

/**
 * Join the text blocks as `text` and read the JSON they carry as `payload`
 * (structured content wins when the server sends it). Text that is not JSON
 * is not an error: `payload` stays undefined and `raw` still reaches the caller.
 */
function readOpenalexMcpToolResult(name: string, result: OpenalexMcpToolCall): OpenalexMcpToolResult {
  if ("toolResult" in result) {
    return { text: JSON.stringify(result.toolResult), payload: result.toolResult };
  }
  if (result.isError) throw new ProviderRequestError(502, `OpenAlex MCP tool ${name} failed.`, result);
  const text = looseArray(result.content)
    .map((block) => optionalRecord(block))
    .filter((block) => block?.type === "text")
    .map((block) => optionalRawString(block?.text) ?? "")
    .join("\n");
  return { text, payload: optionalRecord(result.structuredContent) ?? parseJsonText(text) };
}

function parseJsonText(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

/** The signed-in account as the validator reports it: an account ID and a display name. */
interface OpenalexMcpAccount {
  accountId: string;
  displayName: string;
}

/**
 * The get_my_account answer as a profile: the claimed author's OpenAlex ID,
 * else the first account email, else the service itself; the display name
 * prefers the claimed author, then the account, then the email.
 */
function parseOpenalexMcpAccount(payload: unknown): OpenalexMcpAccount | undefined {
  const record = optionalRecord(payload);
  if (!record) return undefined;
  const claimedAuthor = optionalRecord(record.claimed_author);
  const user = optionalRecord(record.user);
  const email = parseOpenalexMcpEmails(user?.emails)[0] ?? optionalString(record.email) ?? optionalString(user?.email);
  return {
    accountId: (claimedAuthor && pickOptionalString(claimedAuthor, "id")) ?? email ?? "openalex",
    displayName:
      (claimedAuthor && pickOptionalString(claimedAuthor, "display_name", "displayName", "name")) ??
      (user && pickOptionalString(user, "display_name", "displayName", "name")) ??
      email ??
      "openalex",
  };
}

/** The account's emails in order, sent as `email` strings or `{ email }` records. */
function parseOpenalexMcpEmails(value: unknown): string[] {
  return looseArray(value).flatMap((item) => {
    const entry = optionalRecord(item);
    const email = entry ? pickOptionalString(entry, "email") : optionalString(item);
    return email ? [email] : [];
  });
}

function withOpenalexMcpClient<T>(
  context: OpenalexMcpContext,
  run: (client: Client, signal: AbortSignal) => Promise<T>,
): Promise<T> {
  return runProviderRequest({ signal: context.signal, label: "OpenAlex MCP" }, (signal) =>
    withMcpClient(
      {
        endpoint: new URL(openalexMcpEndpoint),
        transport: "streamable_http",
        fetcher: context.fetcher,
        headers: { authorization: `Bearer ${context.accessToken}`, "user-agent": providerUserAgent },
        redirect: "manual",
        signal,
        mapError: mapOpenalexMcpError,
      },
      (client) => run(client, signal),
    ),
  );
}

// Status alone does not establish that reconnecting can resolve a provider failure.
function mapOpenalexMcpError(error: unknown): unknown {
  if (error instanceof ProviderRequestError) return error;
  if (error instanceof UnauthorizedError) {
    return new ProviderRequestError(401, "OpenAlex MCP authorization request failed.", undefined, "provider_error");
  }
  if (error instanceof SdkHttpError) {
    return new ProviderRequestError(
      error.status,
      `OpenAlex MCP request failed with HTTP ${error.status}.`,
      undefined,
      error.status === 429 ? "rate_limited" : "provider_error",
    );
  }
  if (error instanceof ProtocolError) {
    return new ProviderRequestError(502, `OpenAlex MCP protocol error ${error.code}.`, undefined, "provider_error");
  }
  return error;
}
