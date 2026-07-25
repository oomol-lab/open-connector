import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalObjectArray,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const service = "agent_qq";
const agentQQApiBaseUrl = "https://api.agent.qq.com";

type AgentQQActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

const agentQQActionHandlers: Record<string, AgentQQActionHandler> = {
  list_aliases(_input, context) {
    return agentQQRequest(context, { path: "/v1/me", mode: "execute" });
  },

  list_messages(input, context) {
    const aliasId = requireFieldString(input, "alias_id");
    const q = optionalString(input.q);
    const query = buildListMessagesQuery(input);
    const path = q
      ? `/v1/aliases/${encodeURIComponent(aliasId)}/messages/search`
      : `/v1/aliases/${encodeURIComponent(aliasId)}/messages`;
    return agentQQRequest(context, { path, query, mode: "execute" });
  },

  read_message(input, context) {
    const aliasId = requireFieldString(input, "alias_id");
    const messageId = requireFieldString(input, "message_id");
    return agentQQRequest(context, {
      path: `/v1/aliases/${encodeURIComponent(aliasId)}/messages/${encodeURIComponent(messageId)}`,
      mode: "execute",
    });
  },

  async send_message(input, context) {
    const aliasId = requireFieldString(input, "alias_id");
    const body = buildSendBody(input);
    const path = `/v1/aliases/${encodeURIComponent(aliasId)}/messages/send`;
    const confirmationToken = optionalString(input.confirmation_token);

    if (confirmationToken) {
      return agentQQRequest(context, {
        path,
        method: "POST",
        body: { ...body, confirmation_token: confirmationToken },
        mode: "execute",
      });
    }

    const initial = await agentQQRequest<unknown>(context, { path, method: "POST", body, mode: "execute" });
    const firstToken = readConfirmationToken(initial);
    if (firstToken) {
      return agentQQRequest(context, {
        path,
        method: "POST",
        body: { ...body, confirmation_token: firstToken },
        mode: "execute",
      });
    }

    return initial;
  },

  async delete_message(input, context) {
    const aliasId = requireFieldString(input, "alias_id");
    const messageId = requireFieldString(input, "message_id");
    const path = `/v1/aliases/${encodeURIComponent(aliasId)}/messages/${encodeURIComponent(messageId)}`;
    let response = await agentQQRequest<unknown>(context, {
      path,
      method: "DELETE",
      mode: "execute",
    });
    const firstToken = readConfirmationToken(response);
    if (firstToken) {
      response = await agentQQRequest(context, {
        path,
        method: "DELETE",
        body: { confirmation_token: firstToken },
        mode: "execute",
      });
    }

    const result = optionalRecord(response);
    if (optionalBoolean(result?.ok) === true && optionalBoolean(result?.deleted) === true) {
      return result;
    }
    return { ok: true, deleted: true, alias_id: aliasId, message_id: messageId };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, agentQQActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const context: ApiKeyProviderContext = { apiKey: input.apiKey, fetcher, signal };
    const payload = await agentQQRequest<unknown>(context, { path: "/v1/me", mode: "validate" });
    const data = optionalRecord(payload);
    const inner = optionalRecord(data?.data);
    const aliases = optionalObjectArray(inner?.aliases);
    const primary = aliases[0];

    return {
      profile: {
        displayName: optionalString(primary?.email) ?? "AgentMail (QQ)",
      },
      grantedScopes: [],
      metadata: compactObject({
        aliasCount: aliases.length,
        scopes: inner?.scopes,
      }),
    };
  },
};

interface AgentQQRequestOptions {
  path: string;
  method?: "GET" | "POST" | "DELETE";
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  mode: "validate" | "execute";
}

async function agentQQRequest<T>(context: ApiKeyProviderContext, request: AgentQQRequestOptions): Promise<T> {
  const url = buildAgentQQUrl(request.path, request.query);
  const hasJsonBody = request.body !== undefined;
  const response = await context.fetcher(url, {
    method: request.method ?? "GET",
    headers: agentQQHeaders(context.apiKey, hasJsonBody),
    body: hasJsonBody ? JSON.stringify(request.body) : undefined,
    signal: context.signal,
  });

  const text = await response.text().catch(() => "");
  if (!response.ok) {
    if (request.mode === "execute" && response.status === 428) {
      const confirmation = parseAgentQQConfirmation(text);
      if (confirmation) {
        return confirmation as T;
      }
    }
    assertAgentQQResponse(response, request.mode, text);
  }
  if (!text) {
    return {} as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ProviderRequestError(502, "AgentMail (QQ) returned invalid JSON");
  }
}

function buildAgentQQUrl(path: string, query?: Record<string, string>): string {
  const url = new URL(path, agentQQApiBaseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

function agentQQHeaders(apiKey: string, hasJsonBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${apiKey}`,
    accept: "application/json",
    "user-agent": providerUserAgent,
  };
  if (hasJsonBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

function requireFieldString(input: Record<string, unknown>, key: string): string {
  const value = optionalString(input[key]);
  if (value === undefined) {
    throw new ProviderRequestError(400, `${key} is required`);
  }
  return value;
}

function readConfirmationToken(response: unknown): string | undefined {
  const data = optionalRecord(optionalRecord(response)?.data);
  if (optionalBoolean(data?.confirmation_required) !== true) {
    return undefined;
  }
  return optionalString(data?.confirmation_token);
}

function parseAgentQQConfirmation(raw: string): Record<string, unknown> | undefined {
  try {
    const payload = optionalRecord(JSON.parse(raw));
    const error = optionalRecord(payload?.error);
    const details = optionalRecord(error?.details) ?? optionalRecord(payload?.data);
    const token = optionalString(details?.confirmation_token);
    if (!details || !token) {
      return undefined;
    }
    return {
      ok: true,
      data: {
        ...details,
        confirmation_required: true,
        confirmation_token: token,
      },
    };
  } catch {
    return undefined;
  }
}

function buildListMessagesQuery(input: Record<string, unknown>): Record<string, string> {
  const query: Record<string, string> = {};
  const limit = optionalInteger(input.limit);
  if (limit !== undefined) {
    query.limit = String(limit);
  }
  const dir = optionalString(input.dir);
  if (dir) {
    query.dir = dir;
  }
  const cursor = optionalString(input.cursor);
  if (cursor) {
    query.cursor = cursor;
  }
  const before = optionalString(input.before);
  if (before) {
    query.before = before;
  }
  const after = optionalString(input.after);
  if (after) {
    query.after = after;
  }
  const hasAttachments = optionalBoolean(input.has_attachments);
  if (hasAttachments === true) {
    query.has_attachments = "true";
  }
  const isUnread = optionalBoolean(input.is_unread);
  if (isUnread === true) {
    query.is_read = "false";
  } else {
    const isRead = optionalBoolean(input.is_read);
    if (isRead !== undefined) {
      query.is_read = String(isRead);
    }
  }
  const q = optionalString(input.q);
  if (q) {
    query.q = q;
  }
  return query;
}

function buildSendBody(input: Record<string, unknown>): Record<string, unknown> {
  const to = toRecipients(input.to, "to");
  const cc = optionalRecipients(input.cc);
  const bcc = optionalRecipients(input.bcc);
  const subject = requireFieldString(input, "subject");
  const body = requireFieldString(input, "body");
  const bodyFormat = normalizeBodyFormat(optionalString(input.body_format));

  const msg: Record<string, unknown> = { to, subject, body };
  if (cc && cc.length > 0) {
    msg.cc = cc;
  }
  if (bcc && bcc.length > 0) {
    msg.bcc = bcc;
  }
  if (bodyFormat) {
    msg.body_format = bodyFormat;
  }
  return msg;
}

function toRecipients(value: unknown, field: string): Array<{ email: string }> {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ProviderRequestError(400, `${field} must be a non-empty array of email addresses`);
  }
  return value.map((email) => ({ email: String(email).trim() }));
}

function optionalRecipients(value: unknown): Array<{ email: string }> | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  return value.map((email) => ({ email: String(email).trim() }));
}

function normalizeBodyFormat(value: string | undefined): string | undefined {
  if (!value || value === "auto") {
    return undefined;
  }
  return value.toUpperCase();
}

function assertAgentQQResponse(response: Response, mode: "validate" | "execute", raw: string): void {
  if (response.ok) {
    return;
  }

  const { message, type } = readAgentQQError(raw, response.status);
  const status = response.status;
  if (status === 429) {
    throw new ProviderRequestError(429, message, { type });
  }
  if (mode === "validate" && (status === 401 || status === 403)) {
    throw new ProviderRequestError(400, message, { type });
  }
  if (status === 400 || status === 422) {
    throw new ProviderRequestError(400, message, { type });
  }
  throw new ProviderRequestError(status || 500, message, { type });
}

function readAgentQQError(raw: string, status: number): { message: string; type: string } {
  try {
    const payload = optionalRecord(JSON.parse(raw));
    const nested = optionalRecord(payload?.error);
    return {
      type: optionalString(nested?.type) ?? optionalString(payload?.type) ?? "provider_error",
      message:
        (optionalString(nested?.message) ??
          optionalString(payload?.message) ??
          optionalString(payload?.error) ??
          raw) ||
        `AgentMail (QQ) request failed with ${status}`,
    };
  } catch {
    return {
      type: "provider_error",
      message: raw || `AgentMail (QQ) request failed with ${status}`,
    };
  }
}
