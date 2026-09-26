import type { CredentialValidationResult, CredentialValidatorOptions, ResolvedCredential } from "../../core/types.ts";
import type {
  OAuthProviderContext,
  ProviderActionHandlers,
  ProviderActionSources,
  ProviderRuntimeHandler,
} from "../provider-runtime.ts";
import type { LinearMcpComment, LinearMcpIssue, LinearMcpUser } from "./actions.ts";
import type { Client } from "@modelcontextprotocol/client";

import { ProtocolError, SdkHttpError, UnauthorizedError } from "@modelcontextprotocol/client";
import {
  compactObject,
  looseArray,
  optionalBoolean,
  optionalInteger,
  optionalRawString,
  optionalRecord,
  optionalString,
  pickOptionalString,
} from "../../core/cast.ts";
import { withMcpClient } from "../mcp-client.ts";
import {
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
  requiredInputString,
  runProviderRequest,
} from "../provider-runtime.ts";
import { linearMcpEndpoint } from "./endpoints.ts";

const service = "linear_mcp";
type LinearMcpPhase = "validate" | "execute";
type LinearMcpContext = Pick<OAuthProviderContext, "accessToken" | "fetcher" | "signal">;
type LinearMcpToolCall = Awaited<ReturnType<Client["callTool"]>>;

/** The Linear MCP tool behind each action. Sign-in requires every one of them (see the validator). */
export const linearMcpToolsByAction: ProviderActionSources<typeof service, string> = {
  get_self: "get_user",
  list_issues: "list_issues",
  get_issue: "get_issue",
  list_comments: "list_comments",
};

/** One tool call's text as returned plus the JSON it carried, when it carried any. */
export interface LinearMcpToolResult {
  text: string;
  payload: unknown;
}

const humanIdentifier = /^[A-Z][A-Z0-9]*-\d+$/;
const uuidIdentifier = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const truncationMarker = /\(truncated\b/i;
const maxToolListPages = 20;

export const linearMcpActionHandlers: ProviderActionHandlers<
  typeof service,
  ProviderRuntimeHandler<OAuthProviderContext>
> = {
  async get_self(_input, context) {
    const result = await callLinearMcpTool(context, "execute", linearMcpToolsByAction.get_self, { query: "me" });
    return { user: parseLinearMcpUser(result.payload) ?? null, raw: result.text };
  },
  async list_issues(input, context) {
    const result = await callLinearMcpTool(
      context,
      "execute",
      linearMcpToolsByAction.list_issues,
      compactObject({
        updatedAt: optionalString(input.updatedAt),
        orderBy: optionalString(input.orderBy),
        limit: optionalInteger(input.limit),
        cursor: optionalString(input.cursor),
      }),
    );
    return { ...parseLinearMcpIssuePage(result.payload), raw: result.text };
  },
  async get_issue(input, context) {
    const id = requiredInputString(input.id, "id");
    const result = await callLinearMcpTool(context, "execute", linearMcpToolsByAction.get_issue, { id });
    return { issue: parseLinearMcpIssue(result.payload) ?? null, raw: result.text };
  },
  async list_comments(input, context) {
    const issueId = requiredInputString(input.issueId, "issueId");
    const result = await callLinearMcpTool(context, "execute", linearMcpToolsByAction.list_comments, { issueId });
    return { comments: parseLinearMcpComments(result.payload), raw: result.text };
  },
};

/**
 * Validate the OAuth grant against the MCP server: every tool the actions map
 * must be listed (a rename shows up here, at sign-in, never mid-poll), then the
 * self tool supplies the profile with the same viewer ID the GraphQL API reports.
 */
export async function validateLinearMcpCredential(
  credential: Extract<ResolvedCredential, { authType: "oauth2" }>,
  options: CredentialValidatorOptions,
): Promise<CredentialValidationResult> {
  const context = { accessToken: credential.accessToken, fetcher: options.fetcher, signal: options.signal };
  return withLinearMcpClient(context, "validate", async (client, signal) => {
    const available = await listLinearMcpToolNames(client, signal);
    const missing = Object.values(linearMcpToolsByAction).filter((name) => !available.has(name));
    if (missing.length > 0) {
      throw new ProviderRequestError(
        502,
        `Linear MCP did not expose the ${missing.join(", ")} tool${missing.length > 1 ? "s" : ""} this connector needs; Linear may have renamed ${missing.length > 1 ? "them" : "it"}.`,
      );
    }
    const result = readLinearMcpToolResult(
      linearMcpToolsByAction.get_self,
      await client.callTool({ name: linearMcpToolsByAction.get_self, arguments: { query: "me" } }, { signal }),
    );
    const user = parseLinearMcpUser(result.payload);
    if (!user) throw providerResponseError("Linear MCP did not return the signed-in user.");
    return {
      profile: { accountId: user.id, displayName: user.displayName ?? user.name ?? user.email ?? user.id },
      grantedScopes: optionalString(credential.metadata.scope)?.split(" ") ?? [],
      metadata: { mcpEndpoint: linearMcpEndpoint, discoveredToolCount: available.size },
    };
  });
}

async function listLinearMcpToolNames(client: Client, signal: AbortSignal): Promise<Set<string>> {
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
export function callLinearMcpTool(
  context: LinearMcpContext,
  phase: LinearMcpPhase,
  name: string,
  args: Record<string, unknown>,
): Promise<LinearMcpToolResult> {
  return withLinearMcpClient(context, phase, async (client, signal) =>
    readLinearMcpToolResult(name, await client.callTool({ name, arguments: args }, { signal })),
  );
}

/**
 * Join the text blocks as `text` and read the JSON they carry as `payload`
 * (structured content wins when the server sends it). Text that is not JSON
 * is not an error: the typed fields stay empty and `raw` still reaches the caller.
 */
export function readLinearMcpToolResult(name: string, result: LinearMcpToolCall): LinearMcpToolResult {
  if ("toolResult" in result) {
    return { text: JSON.stringify(result.toolResult), payload: result.toolResult };
  }
  if (result.isError) throw new ProviderRequestError(502, `Linear MCP tool ${name} failed.`, result);
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

export function parseLinearMcpUser(payload: unknown): LinearMcpUser | undefined {
  const record = optionalRecord(payload);
  const user = record && (optionalRecord(record.user) ?? optionalRecord(record.viewer) ?? record);
  const id = user && pickOptionalString(user, "id", "uuid");
  if (!user || !id) return undefined;
  return {
    id,
    email: pickOptionalString(user, "email"),
    displayName: pickOptionalString(user, "displayName", "display_name"),
    name: pickOptionalString(user, "name"),
  };
}

export function parseLinearMcpIssuePage(payload: unknown): {
  issues: LinearMcpIssue[];
  hasNextPage: boolean;
  cursor: string | null;
} {
  const record = optionalRecord(payload);
  const items = Array.isArray(payload) ? payload : looseArray(record?.issues ?? record?.nodes ?? record?.results);
  const issues = items.map(parseLinearMcpIssue).filter((issue) => issue !== undefined);
  const cursor = record ? (pickOptionalString(record, "cursor", "nextCursor", "endCursor") ?? null) : null;
  const hasNextPage =
    (record && (optionalBoolean(record.hasNextPage) ?? optionalBoolean(record.hasMore))) ?? cursor !== null;
  return { issues, hasNextPage, cursor };
}

export function parseLinearMcpIssue(value: unknown): LinearMcpIssue | undefined {
  const record = optionalRecord(value);
  const issue = record && (optionalRecord(record.issue) ?? record);
  const id = issue && pickOptionalString(issue, "id", "identifier", "uuid");
  if (!issue || !id) return undefined;
  const description = optionalRawString(issue.description);
  const assignee = optionalRecord(issue.assignee);
  const creator = optionalRecord(issue.creator);
  return {
    id,
    identifier: pickOptionalString(issue, "identifier") ?? (humanIdentifier.test(id) ? id : undefined),
    uuid: pickOptionalString(issue, "uuid") ?? (uuidIdentifier.test(id) ? id : undefined),
    title: optionalRawString(issue.title),
    description,
    descriptionTruncated: description === undefined ? undefined : truncationMarker.test(description),
    url: pickOptionalString(issue, "url"),
    state: labelOf(issue.state ?? issue.status),
    priority: issue.priority,
    assignee: labelOf(issue.assignee),
    assigneeId: assignee && pickOptionalString(assignee, "id"),
    creator: labelOf(issue.creator),
    creatorId: creator && pickOptionalString(creator, "id"),
    team: labelOf(issue.team),
    project: labelOf(issue.project),
    labels: parseLabels(issue.labels),
    createdAt: pickOptionalString(issue, "createdAt", "created_at"),
    updatedAt: pickOptionalString(issue, "updatedAt", "updated_at"),
    archivedAt: pickOptionalString(issue, "archivedAt", "archived_at"),
    completedAt: pickOptionalString(issue, "completedAt", "completed_at"),
    dueDate: pickOptionalString(issue, "dueDate", "due_date"),
  };
}

export function parseLinearMcpComments(payload: unknown): LinearMcpComment[] {
  const record = optionalRecord(payload);
  const items = Array.isArray(payload) ? payload : looseArray(record?.comments ?? record?.nodes);
  return items.flatMap((item) => {
    const comment = optionalRecord(item);
    const id = comment && pickOptionalString(comment, "id");
    if (!comment || !id) return [];
    const user = optionalRecord(comment.user);
    return [
      {
        id,
        body: optionalRawString(comment.body),
        user: labelOf(comment.user),
        userId: user && pickOptionalString(user, "id"),
        createdAt: pickOptionalString(comment, "createdAt", "created_at"),
        updatedAt: pickOptionalString(comment, "updatedAt", "updated_at"),
        url: pickOptionalString(comment, "url"),
      },
    ];
  });
}

/** A name for a value Linear may return as a string or as an object such as `{ id, name }`. */
function labelOf(value: unknown): string | undefined {
  const record = optionalRecord(value);
  if (record) return pickOptionalString(record, "name", "displayName", "title", "key", "id");
  return optionalString(value);
}

function parseLabels(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((label) => {
    const name = labelOf(label);
    return name ? [name] : [];
  });
}

function withLinearMcpClient<T>(
  context: LinearMcpContext,
  phase: LinearMcpPhase,
  run: (client: Client, signal: AbortSignal) => Promise<T>,
): Promise<T> {
  return runProviderRequest({ signal: context.signal, label: "Linear MCP" }, (signal) =>
    withMcpClient(
      {
        endpoint: new URL(linearMcpEndpoint),
        transport: "streamable_http",
        fetcher: context.fetcher,
        headers: { authorization: `Bearer ${context.accessToken}`, "user-agent": providerUserAgent },
        redirect: "manual",
        signal,
        mapError: (error) => mapLinearMcpError(error, phase),
      },
      (client) => run(client, signal),
    ),
  );
}

/**
 * A rejected token is a bad credential (400) while validating and an expired
 * authorization (401) while executing; other SDK failures keep a 4xx status or
 * become 502. Aborts and unknown errors pass through for the request wrapper.
 */
function mapLinearMcpError(error: unknown, phase: LinearMcpPhase): unknown {
  if (error instanceof ProviderRequestError) return error;
  if (error instanceof UnauthorizedError) return credentialError(phase);
  if (error instanceof SdkHttpError) {
    const status = error.status;
    if (status === 401 || status === 403) return credentialError(phase);
    return new ProviderRequestError(
      400 <= status && status < 500 ? status : 502,
      `Linear MCP request failed: ${error.message}`,
      error,
    );
  }
  if (error instanceof ProtocolError) {
    return new ProviderRequestError(502, `Linear MCP request failed: ${error.message}`, error);
  }
  return error;
}

function credentialError(phase: LinearMcpPhase): ProviderRequestError {
  return new ProviderRequestError(
    phase === "validate" ? 400 : 401,
    "Linear MCP credential is invalid or expired; reconnect Linear.",
  );
}
