import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const superchatApiBaseUrl = "https://api.superchat.com";
const superchatApiVersionPath = "/v1.0";

type SuperchatPhase = "validate" | "execute";
type SuperchatMethod = "GET" | "POST" | "PATCH";

interface SuperchatRequestInput {
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  phase: SuperchatPhase;
  signal?: AbortSignal;
  method?: SuperchatMethod;
  query?: Record<string, string | number | undefined>;
  body?: Record<string, unknown>;
}

type SuperchatActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const superchatActionHandlers: ProviderActionHandlers<"superchat", SuperchatActionHandler> = {
  async get_me(_input, context) {
    return {
      profile: requiredRecord(
        await requestSuperchatJson({
          path: "/me",
          apiKey: context.apiKey,
          fetcher: context.fetcher,
          signal: context.signal,
          phase: "execute",
        }),
        "Superchat profile response",
      ),
    };
  },
  async list_channels(input, context) {
    const payload = requiredRecord(
      await requestSuperchatJson({
        path: "/channels",
        apiKey: context.apiKey,
        fetcher: context.fetcher,
        signal: context.signal,
        phase: "execute",
        query: buildCursorQuery(input),
      }),
      "Superchat channels response",
    );
    return { channels: readResults(payload), pagination: readPagination(payload, "list_channels") };
  },
  async get_channel(input, context) {
    const channelId = requiredString(input.channel_id, "channel_id", providerInputError);
    return {
      channel: requiredRecord(
        await requestSuperchatJson({
          path: `/channels/${encodeURIComponent(channelId)}`,
          apiKey: context.apiKey,
          fetcher: context.fetcher,
          signal: context.signal,
          phase: "execute",
        }),
        "Superchat channel response",
      ),
    };
  },
  async create_contact(input, context) {
    return {
      contact: requiredRecord(
        await requestSuperchatJson({
          path: "/contacts",
          method: "POST",
          apiKey: context.apiKey,
          fetcher: context.fetcher,
          signal: context.signal,
          phase: "execute",
          body: buildWritableContactBody(input),
        }),
        "Superchat contact response",
      ),
    };
  },
  async get_contact(input, context) {
    const contactId = requiredString(input.contact_id, "contact_id", providerInputError);
    return {
      contact: requiredRecord(
        await requestSuperchatJson({
          path: `/contacts/${encodeURIComponent(contactId)}`,
          apiKey: context.apiKey,
          fetcher: context.fetcher,
          signal: context.signal,
          phase: "execute",
        }),
        "Superchat contact response",
      ),
    };
  },
  async list_contacts(input, context) {
    const payload = requiredRecord(
      await requestSuperchatJson({
        path: "/contacts",
        apiKey: context.apiKey,
        fetcher: context.fetcher,
        signal: context.signal,
        phase: "execute",
        query: buildCursorQuery(input),
      }),
      "Superchat contacts response",
    );
    return { contacts: readResults(payload), pagination: readPagination(payload, "list_contacts") };
  },
  async search_contacts(input, context) {
    const field = requiredString(input.field, "field", providerInputError);
    const payload = requiredRecord(
      await requestSuperchatJson({
        path: "/contacts/search",
        method: "POST",
        apiKey: context.apiKey,
        fetcher: context.fetcher,
        signal: context.signal,
        phase: "execute",
        body: {
          query: {
            value: [
              compactObject({
                field,
                identifier:
                  field === "custom_attribute"
                    ? requiredString(input.identifier, "identifier", providerInputError)
                    : undefined,
                operator: "=",
                value: requiredString(input.value, "value", providerInputError),
              }),
            ],
          },
        },
      }),
      "Superchat contact search response",
    );
    return { contacts: readResults(payload), pagination: readPagination(payload, "search_contacts") };
  },
  async update_contact(input, context) {
    const contactId = requiredString(input.contact_id, "contact_id", providerInputError);
    return {
      contact: requiredRecord(
        await requestSuperchatJson({
          path: `/contacts/${encodeURIComponent(contactId)}`,
          method: "PATCH",
          apiKey: context.apiKey,
          fetcher: context.fetcher,
          signal: context.signal,
          phase: "execute",
          body: buildWritableContactBody(input),
        }),
        "Superchat contact response",
      ),
    };
  },
  async send_text_message(input, context) {
    return {
      message: requiredRecord(
        await requestSuperchatJson({
          path: "/messages",
          method: "POST",
          apiKey: context.apiKey,
          fetcher: context.fetcher,
          signal: context.signal,
          phase: "execute",
          body: {
            to: [{ identifier: requiredString(input.identifier, "identifier", providerInputError) }],
            from: buildSender(input),
            content: { type: "text", body: requiredString(input.body, "body", providerInputError) },
          },
        }),
        "Superchat message response",
      ),
    };
  },
  async send_email_message(input, context) {
    return {
      message: requiredRecord(
        await requestSuperchatJson({
          path: "/messages",
          method: "POST",
          apiKey: context.apiKey,
          fetcher: context.fetcher,
          signal: context.signal,
          phase: "execute",
          body: compactObject({
            to: [{ identifier: requiredString(input.identifier, "identifier", providerInputError) }],
            from: buildSender(input),
            content: compactObject({
              type: "email",
              subject: optionalString(input.subject),
              text: requiredString(input.text, "text", providerInputError),
              html: optionalString(input.html),
            }),
            in_reply_to: optionalString(input.in_reply_to),
          }),
        }),
        "Superchat message response",
      ),
    };
  },
  async send_whatsapp_template_message(input, context) {
    return {
      message: requiredRecord(
        await requestSuperchatJson({
          path: "/messages",
          method: "POST",
          apiKey: context.apiKey,
          fetcher: context.fetcher,
          signal: context.signal,
          phase: "execute",
          body: {
            to: [{ identifier: requiredString(input.identifier, "identifier", providerInputError) }],
            from: buildSender(input),
            content: {
              type: "whats_app_template",
              template_id: requiredString(input.template_id, "template_id", providerInputError),
              variables: Array.isArray(input.variables) ? input.variables : [],
            },
          },
        }),
        "Superchat message response",
      ),
    };
  },
};

export async function validateSuperchatCredential(
  input: { apiKey: string },
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = requiredRecord(
    await requestSuperchatJson({
      path: "/me",
      apiKey: input.apiKey,
      fetcher,
      signal,
      phase: "validate",
    }),
    "Superchat profile response",
  );
  const user = optionalRecord(payload.user);
  const workspace = optionalRecord(payload.workspace);
  return {
    profile: {
      accountId: optionalString(user?.id),
      displayName: optionalString(user?.email) ?? "Superchat API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: superchatApiBaseUrl,
      validationEndpoint: "/me",
      workspaceName: optionalString(workspace?.name),
      userRole: optionalString(user?.role),
      userLanguage: optionalString(user?.language),
    },
  };
}

function buildCursorQuery(input: Record<string, unknown>) {
  return compactObject({
    limit: optionalInteger(input.limit),
    after: optionalString(input.after),
    before: optionalString(input.before),
  });
}

function readResults(payload: Record<string, unknown>): unknown[] {
  return Array.isArray(payload.results) ? payload.results : [];
}

function readPagination(payload: Record<string, unknown>, actionName: string): Record<string, unknown> {
  const pagination = optionalRecord(payload.pagination);
  if (!pagination) {
    throw new ProviderRequestError(502, `Superchat returned invalid ${actionName} pagination`);
  }
  return pagination;
}

function buildWritableContactBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    first_name: optionalString(input.first_name),
    last_name: optionalString(input.last_name),
    gender: optionalString(input.gender),
    handles: Array.isArray(input.handles) ? input.handles : undefined,
    custom_attributes: Array.isArray(input.custom_attributes) ? input.custom_attributes : undefined,
  });
}

function buildSender(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    channel_id: requiredString(input.channel_id, "channel_id", providerInputError),
    name: optionalString(input.from_name),
  });
}

async function requestSuperchatJson(input: SuperchatRequestInput): Promise<unknown> {
  const timeout = createProviderTimeout(input.signal);
  const url = new URL(`${superchatApiVersionPath}${input.path}`, superchatApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  try {
    const response = await input.fetcher(url, {
      method: input.method ?? "GET",
      headers: buildHeaders(input.apiKey, Boolean(input.body)),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const rawText = await response.text();
    const payload = tryParseJson(rawText);
    if (!response.ok) {
      throw createSuperchatError(response.status, payload ?? rawText, input.phase);
    }
    if (payload === undefined) {
      throw new ProviderRequestError(502, "Superchat returned invalid JSON");
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(timeout.didTimeout() ? 504 : 502, "Superchat request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Superchat request failed: ${error.message}` : "Superchat request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  return {
    accept: "application/json",
    ...(hasBody ? { "content-type": "application/json" } : {}),
    "user-agent": providerUserAgent,
    "x-api-key": apiKey,
  };
}

function tryParseJson(rawText: string): unknown {
  if (!rawText.trim()) return undefined;
  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    return undefined;
  }
}

function createSuperchatError(status: number, payload: unknown, phase: SuperchatPhase): ProviderRequestError {
  const message = readSuperchatErrorMessage(payload) ?? `Superchat request failed with status ${status}`;
  if (status === 401) return new ProviderRequestError(phase === "validate" ? 400 : 401, message, payload);
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (status === 400 || status === 404 || status === 422) return new ProviderRequestError(400, message, payload);
  return new ProviderRequestError(status >= 500 ? 502 : status, message, payload);
}

function readSuperchatErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") return payload.trim() || undefined;
  const record = optionalRecord(payload);
  const direct = optionalString(record?.message) ?? optionalString(record?.error);
  if (direct) return direct;
  const first = Array.isArray(record?.errors) ? optionalRecord(record.errors[0]) : undefined;
  const title = optionalString(first?.title);
  const detail = optionalString(first?.detail);
  return title && detail ? `${title}: ${detail}` : (title ?? detail);
}

function requiredRecord(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) throw new ProviderRequestError(502, `${label} must be an object`);
  return record;
}
