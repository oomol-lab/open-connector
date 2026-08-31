import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalRecord, optionalString } from "../../core/cast.ts";
import { createProviderTimeout, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const timelinesAiApiBaseUrl = "https://app.timelines.ai/integrations/api";

type RequestPhase = "validate" | "execute";
export const timelinesAiActionHandlers: ProviderActionHandlers<
  "timelinesai",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  async get_workspace(_input, context) {
    return { workspace: normalizeWorkspace(await request({ path: "/workspace", ...context })) };
  },
  async list_whatsapp_accounts(_input, context) {
    const data = requireProviderObject(
      await request({ path: "/whatsapp_accounts", ...context }),
      "WhatsApp account list",
    );
    return {
      accounts: requireProviderArray(data.whatsapp_accounts, "WhatsApp accounts").map(normalizeWhatsappAccount),
    };
  },
  async list_chats(input, context) {
    const data = requireProviderObject(
      await request({
        path: "/chats",
        query: compactObject({
          label: commaSeparated(input.labels),
          whatsapp_account_id: commaSeparated(input.whatsappAccountIds),
          group: optionalBoolean(input.group),
          responsible: commaSeparated(input.responsibleEmails),
          name: commaSeparated(input.names),
          phone: optionalString(input.phone),
          read: optionalBoolean(input.read),
          closed: optionalBoolean(input.closed),
          chatgpt_autoresponse_enabled: optionalBoolean(input.chatgptAutoresponseEnabled),
          page: input.page,
          created_after: optionalString(input.createdAfter),
          created_before: optionalString(input.createdBefore),
        }),
        ...context,
      }),
      "chat list",
    );
    return {
      hasMorePages: data.has_more_pages,
      chats: requireProviderArray(data.chats, "chats").map(normalizeChat),
    };
  },
  async get_chat(input, context) {
    return {
      chat: normalizeChat(await request({ path: `/chats/${encodeURIComponent(String(input.chatId))}`, ...context })),
    };
  },
  async list_chat_messages(input, context) {
    const data = requireProviderObject(
      await request({
        path: `/chats/${encodeURIComponent(String(input.chatId))}/messages`,
        query: compactObject({
          from_me: optionalBoolean(input.fromMe),
          after: optionalString(input.after),
          before: optionalString(input.before),
          after_message: optionalString(input.afterMessage),
          before_message: optionalString(input.beforeMessage),
          sorting_order: optionalString(input.sortingOrder),
        }),
        ...context,
      }),
      "message list",
    );
    return {
      hasMorePages: data.has_more_pages,
      messages: requireProviderArray(data.messages, "messages").map(normalizeMessage),
    };
  },
  async get_message(input, context) {
    return {
      message: normalizeMessage(
        await request({
          path: `/messages/${encodeURIComponent(String(input.messageUid))}`,
          ...context,
        }),
      ),
    };
  },
  async get_message_status(input, context) {
    const data = await request({
      path: `/messages/${encodeURIComponent(String(input.messageUid))}/status_history`,
      ...context,
    });
    return {
      history: requireProviderArray(data, "message status history").map((item) => {
        const record = requireProviderObject(item, "message status record");
        return { status: record.status, timestamp: record.timestamp };
      }),
    };
  },
  async send_message_to_chat(input, context) {
    const data = requireProviderObject(
      await request({
        method: "POST",
        path: `/chats/${encodeURIComponent(String(input.chatId))}/messages`,
        body: compactObject({ text: input.text, reply_to: input.replyTo }),
        ...context,
      }),
      "message submission",
    );
    return { messageUid: data.message_uid };
  },
  async send_message_to_phone(input, context) {
    const data = requireProviderObject(
      await request({
        method: "POST",
        path: "/messages",
        body: compactObject({
          phone: input.phone,
          text: input.text,
          whatsapp_account_phone: input.whatsappAccountPhone,
        }),
        ...context,
      }),
      "message submission",
    );
    return { messageUid: data.message_uid };
  },
};

export async function validateTimelinesAiCredential(
  apiKey: string,
  fetcher: ApiKeyProviderContext["fetcher"],
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const workspace = normalizeWorkspace(
    await request({ path: "/workspace", apiKey, fetcher, signal, phase: "validate" }),
  );
  const workspaceId = requireProviderString(workspace.workspaceId, "workspace ID");
  const displayName = requireProviderString(workspace.displayName, "workspace display name");
  return {
    profile: { displayName },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: timelinesAiApiBaseUrl,
      validationEndpoint: "/workspace",
      workspaceId,
      plan: workspace.plan,
    },
  };
}

interface RequestInput extends Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal"> {
  path: string;
  phase?: RequestPhase;
  method?: "GET" | "POST";
  query?: Record<string, unknown>;
  body?: unknown;
}

async function request(input: RequestInput) {
  const url = new URL(`${timelinesAiApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const timeout = createProviderTimeout(input.signal);
  try {
    const response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.apiKey}`,
        "user-agent": providerUserAgent,
        ...(input.body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });

    const payload = await readPayload(response);
    if (!response.ok) {
      throw createRequestError(response, payload, input.phase ?? "execute");
    }

    const envelope = requireProviderObject(payload, "response envelope");
    if (envelope.status !== "ok" || !("data" in envelope)) {
      throw providerError("provider_error", readErrorMessage(payload), 502);
    }
    return envelope.data;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout()) {
      throw providerError("provider_error", "TimelinesAI request timed out", 504);
    }
    throw providerError(
      "provider_error",
      error instanceof Error ? `TimelinesAI request failed: ${error.message}` : "TimelinesAI request failed",
      502,
    );
  } finally {
    timeout.cleanup();
  }
}

function providerError(_code: string, message: string, status: number): ProviderRequestError {
  return new ProviderRequestError(status, message);
}

async function readPayload(response: Response) {
  const text = await response.text();
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) {
      return { message: text };
    }
    throw providerError("provider_error", "TimelinesAI returned invalid JSON", 502);
  }
}

function createRequestError(response: Response, payload: unknown, phase: RequestPhase) {
  const message = readErrorMessage(payload);
  if (response.status === 429) {
    return providerError("rate_limited", message, 429);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return providerError("invalid_input", message, 400);
  }
  if (response.status === 401) {
    return providerError("credential_expired", message, 401);
  }
  if (response.status === 400 || response.status === 404) {
    return providerError("invalid_input", message, 400);
  }
  return providerError("provider_error", message, response.status >= 500 ? 502 : response.status);
}

function readErrorMessage(payload: unknown) {
  const record = optionalRecord(payload);
  return optionalString(record?.message) ?? "TimelinesAI request failed";
}

function commaSeparated(value: unknown) {
  return Array.isArray(value) ? value.join(",") : undefined;
}

function requireProviderObject(value: unknown, name: string) {
  const record = optionalRecord(value);
  if (!record) {
    throw providerError("provider_error", `TimelinesAI returned invalid ${name}`, 502);
  }
  return record;
}

function requireProviderArray(value: unknown, name: string) {
  if (!Array.isArray(value)) {
    throw providerError("provider_error", `TimelinesAI returned invalid ${name}`, 502);
  }
  return value;
}

function requireProviderString(value: unknown, name: string) {
  if (typeof value !== "string" || !value) {
    throw providerError("provider_error", `TimelinesAI returned invalid ${name}`, 502);
  }
  return value;
}

function nullableString(value: unknown) {
  return value === null || value === undefined ? null : value;
}

function nullableBoolean(value: unknown) {
  return value === null || value === undefined ? null : value;
}

function normalizeQuota(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }
  const quota = requireProviderObject(value, "quota");
  return {
    total: quota.total,
    used: quota.used,
    periodStart: nullableString(quota.period_start),
    periodEnd: nullableString(quota.period_end),
  };
}

function normalizeWorkspace(value: unknown) {
  const workspace = requireProviderObject(value, "workspace");
  const nonRecurring = optionalRecord(workspace.non_recurring_quota);
  return {
    workspaceId: workspace.workspace_id,
    displayName: workspace.display_name,
    plan: workspace.plan,
    seats: normalizeQuota(workspace.seats),
    messagingQuota: normalizeQuota(workspace.messaging_quota),
    apiCallsQuota: normalizeQuota(workspace.api_calls_quota),
    nonRecurringQuota: nonRecurring
      ? {
          remainingBalance: nonRecurring.remaining_balance === undefined ? null : nonRecurring.remaining_balance,
          lastUpdatedAt: nullableString(nonRecurring.last_updated_at),
        }
      : null,
    raw: workspace,
  };
}

function normalizeWhatsappAccount(value: unknown) {
  const account = requireProviderObject(value, "WhatsApp account");
  return {
    id: account.id,
    phone: account.phone,
    connectedOn: account.connected_on,
    status: account.status,
    ownerName: account.owner_name,
    ownerEmail: account.owner_email,
    accountName: account.account_name,
    raw: account,
  };
}

function normalizeChat(value: unknown) {
  const chat = requireProviderObject(value, "chat");
  return {
    id: chat.id,
    name: chat.name,
    phone: nullableString(chat.phone),
    jid: chat.jid,
    isGroup: chat.is_group,
    closed: chat.closed,
    read: chat.read,
    labels: chat.labels,
    chatgptAutoresponseEnabled: chat.chatgpt_autoresponse_enabled,
    responsibleEmail: nullableString(chat.responsible_email),
    responsibleName: nullableString(chat.responsible_name),
    whatsappAccountId: chat.whatsapp_account_id,
    chatUrl: chat.chat_url,
    createdTimestamp: chat.created_timestamp,
    lastMessageUid: nullableString(chat.last_message_uid),
    lastMessageTimestamp: nullableString(chat.last_message_timestamp),
    unattended: chat.unattended,
    photo: nullableString(chat.photo),
    isAllowedToMessage: nullableBoolean(chat.is_allowed_to_message),
    raw: chat,
  };
}

function normalizeMessage(value: unknown) {
  const message = requireProviderObject(value, "message");
  return {
    uid: message.uid,
    chatId: message.chat_id,
    timestamp: message.timestamp,
    receivedTimestamp: message.received_timestamp,
    senderPhone: message.sender_phone,
    senderName: message.sender_name,
    recipientPhone: message.recipient_phone,
    recipientName: message.recipient_name,
    fromMe: message.from_me,
    text: nullableString(message.text),
    attachmentUrl: nullableString(message.attachment_url),
    attachmentFilename: nullableString(message.attachment_filename),
    status: message.status,
    origin: message.origin,
    hasAttachment: message.has_attachment,
    messageType: message.message_type,
    metadata: optionalRecord(message.data) ?? {},
    createdBy: message.created_by,
    raw: message,
  };
}
