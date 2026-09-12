import type { CredentialValidationResult, CredentialValidatorOptions, ResolvedCredential } from "../../core/types.ts";
import type { OAuthProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { GranolaMeeting } from "./actions.ts";
import type { Client } from "@modelcontextprotocol/client";

import { SdkHttpError, UnauthorizedError } from "@modelcontextprotocol/client";
import {
  objectArray,
  optionalString,
  positiveInteger,
  requiredRawString,
  requiredString,
  requiredStringArray,
} from "../../core/cast.ts";
import { withMcpClient } from "../mcp-client.ts";
import {
  providerInputError,
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
  readProviderJsonBody,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import { granolaMcpEndpoint, granolaOAuthIssuer } from "./endpoints.ts";
import { parseGranolaFolders, parseGranolaMeetings, parseGranolaTranscript } from "./mcp-response.ts";

const granolaMcpCursorPrefix = "granola-mcp:";

export const granolaMcpActionHandlers: ProviderActionHandlers<
  "granola",
  ProviderRuntimeHandler<OAuthProviderContext>
> = {
  async list_notes(input, context) {
    for (const field of ["created_before", "created_after", "updated_after"]) {
      if (input[field] !== undefined) {
        throw providerInputError(
          `${field} requires an API key connection; Granola MCP does not expose note creation or update timestamps.`,
        );
      }
    }
    const meetings = await listGranolaMeetings(context, optionalString(input.folder_id));
    const page = paginateGranolaMcp(meetings, input);
    return {
      notes: page.items.map(({ id, title }) => ({ id, title })),
      hasMore: page.hasMore,
      cursor: page.nextCursor,
      nextCursor: page.nextCursor,
    };
  },
  async get_note(input, context) {
    const id = requiredInputString(input.note_id, "note_id");
    const meeting = (await getGranolaMeetings(context, [id]))[0]!;
    return {
      note: {
        id: meeting.id,
        title: meeting.title,
        summary_markdown: meeting.summary,
        transcript: input.include === "transcript" ? [{ text: await getGranolaTranscript(context, id) }] : undefined,
      },
    };
  },
  async list_folders(input, context) {
    const text = await callGranolaTool(context, "list_meeting_folders", {});
    const page = paginateGranolaMcp(parseGranolaFolders(text), input);
    return { folders: page.items, hasMore: page.hasMore, cursor: page.nextCursor, nextCursor: page.nextCursor };
  },
  async list_meetings(_input, context) {
    return { meetings: await listGranolaMeetings(context) };
  },
  async get_meetings(input, context) {
    const ids = requiredStringArray(input.meeting_ids, "meeting_ids", providerInputError);
    return { meetings: await getGranolaMeetings(context, ids) };
  },
  async get_meeting_transcript(input, context) {
    const meetingId = requiredInputString(input.meeting_id, "meeting_id");
    return { meeting_id: meetingId, transcript: await getGranolaTranscript(context, meetingId) };
  },
};

async function listGranolaMeetings(context: OAuthProviderContext, folderId?: string): Promise<GranolaMeeting[]> {
  const text = await callGranolaTool(context, "list_meetings", { time_range: "last_30_days", folder_id: folderId });
  return parseGranolaMeetings(text);
}

async function getGranolaMeetings(context: OAuthProviderContext, ids: string[]): Promise<GranolaMeeting[]> {
  const text = await callGranolaTool(context, "get_meetings", { meeting_ids: ids });
  const meetings = parseGranolaMeetings(text);
  const byId = new Map(meetings.map((meeting) => [meeting.id, meeting]));
  if (meetings.length !== ids.length || ids.some((id) => !byId.has(id))) {
    throw providerResponseError("Granola did not return every requested meeting.");
  }
  return ids.map((id) => byId.get(id)!);
}

async function getGranolaTranscript(context: OAuthProviderContext, meetingId: string): Promise<string> {
  const text = await callGranolaTool(context, "get_meeting_transcript", { meeting_id: meetingId });
  return parseGranolaTranscript(text, meetingId);
}

interface GranolaMcpPage<T> {
  items: T[];
  hasMore: boolean;
  nextCursor: string | null;
}

function paginateGranolaMcp<T extends { id: string }>(items: T[], input: Record<string, unknown>): GranolaMcpPage<T> {
  const cursor = optionalString(input.cursor);
  let offset = 0;
  if (cursor) {
    const index = cursor.startsWith(granolaMcpCursorPrefix)
      ? items.findIndex((item) => item.id === cursor.slice(granolaMcpCursorPrefix.length))
      : -1;
    if (index === -1) throw providerInputError("Invalid or expired Granola MCP cursor. Restart from the first page.");
    offset = index + 1;
  }
  const pageSize = positiveInteger(input.page_size ?? 10, "page_size", providerInputError);
  const page = items.slice(offset, offset + pageSize);
  const hasMore = offset + page.length < items.length;
  return { items: page, hasMore, nextCursor: hasMore ? `${granolaMcpCursorPrefix}${page.at(-1)!.id}` : null };
}

function callGranolaTool(context: OAuthProviderContext, name: string, input: Record<string, unknown>): Promise<string> {
  return withGranolaClient(context, async (client, signal) => {
    const result = await client.callTool({ name, arguments: input }, { signal });
    if (result.isError) throw new ProviderRequestError(502, `Granola MCP tool ${name} failed.`, result);
    const content = objectArray(result.content, "Granola MCP content", providerResponseError);
    if (content.length === 0) throw providerResponseError("Granola MCP returned no content.");
    return content
      .map((block) => {
        if (block.type !== "text") throw providerResponseError("Granola MCP returned unsupported content.");
        return requiredRawString(block.text, "Granola MCP text", providerResponseError);
      })
      .join("\n");
  });
}

function withGranolaClient<T>(
  context: OAuthProviderContext,
  run: (client: Client, signal: AbortSignal) => Promise<T>,
): Promise<T> {
  return runProviderRequest({ signal: context.signal, label: "Granola MCP" }, (signal) =>
    withMcpClient(
      {
        endpoint: new URL(granolaMcpEndpoint),
        transport: "streamable_http",
        fetcher: context.fetcher,
        headers: { authorization: `Bearer ${context.accessToken}`, "user-agent": providerUserAgent },
        redirect: "manual",
        signal,
        mapError(error) {
          if (error instanceof UnauthorizedError)
            return new ProviderRequestError(401, "Granola OAuth authorization expired.");
          if (error instanceof SdkHttpError)
            return new ProviderRequestError(error.status ?? 502, "Granola MCP request failed.");
          return error;
        },
      },
      (client) => run(client, signal),
    ),
  );
}

/** Validate the OAuth account and MCP grant without requiring paid meeting or transcript tools. */
export async function validateGranolaOAuthCredential(
  credential: Extract<ResolvedCredential, { authType: "oauth2" }>,
  options: CredentialValidatorOptions,
): Promise<CredentialValidationResult> {
  try {
    return await runProviderRequest({ signal: options.signal, label: "Granola OAuth validation" }, async (signal) => {
      const response = await options.fetcher(`${granolaOAuthIssuer}/oauth2/userinfo`, {
        headers: { authorization: `Bearer ${credential.accessToken}` },
        redirect: "manual",
        signal,
      });
      if (!response.ok) throw new ProviderRequestError(response.status, "Granola account verification failed.");
      const user = requiredResponseRecord(
        await readProviderJsonBody(response, {
          emptyBody: undefined,
          invalidJsonMessage: "Invalid Granola account response.",
        }),
        "Granola account",
      );
      const accountId = requiredString(user.sub, "Granola account ID", providerResponseError);
      await withGranolaClient(
        { accessToken: credential.accessToken, fetcher: options.fetcher, signal },
        (client, signal) => client.listTools({}, { signal }),
      );
      return {
        profile: { accountId, displayName: optionalString(user.name) ?? optionalString(user.email) ?? accountId },
      };
    });
  } catch (error) {
    if (error instanceof ProviderRequestError && (error.status === 401 || error.status === 403)) {
      throw new ProviderRequestError(400, "Granola OAuth credentials are invalid or MCP access is disabled.");
    }
    throw error;
  }
}
