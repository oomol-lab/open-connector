import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { MailchimpActionName } from "./actions.ts";

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
  compactObject,
  optionalBoolean,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import {
  createProviderProxyUrl,
  defineApiKeyProviderExecutors,
  normalizeProviderProxyHeaders,
  providerFetch,
  ProviderRequestError,
  providerUserAgent,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  requireApiKeyCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";

type MailchimpJsonObject = Record<string, unknown>;
type MailchimpRequestMode = "validate" | "execute";
type MailchimpActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface MailchimpRequestOptions {
  apiKey: string;
  context: Pick<ApiKeyProviderContext, "fetcher" | "signal">;
  path: string;
  mode: MailchimpRequestMode;
  method?: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
}

const service = "mailchimp";
const mailchimpValidationPath = "/";

export const mailchimpActionHandlers: Record<MailchimpActionName, MailchimpActionHandler> = {
  list_lists(input, context) {
    return requestMailchimpJson({
      apiKey: context.apiKey,
      context,
      path: "/lists",
      query: compactObject({
        count: optionalNumber(input.count),
        offset: optionalNumber(input.offset),
      }),
      mode: "execute",
    });
  },
  async get_list(input, context) {
    const payload = await requestMailchimpJson({
      apiKey: context.apiKey,
      context,
      path: `/lists/${encodeURIComponent(requireInputString(input.list_id, "list_id"))}`,
      mode: "execute",
    });

    return { list: payload };
  },
  list_members(input, context) {
    return requestMailchimpJson({
      apiKey: context.apiKey,
      context,
      path: `/lists/${encodeURIComponent(requireInputString(input.list_id, "list_id"))}/members`,
      query: compactObject({
        count: optionalNumber(input.count),
        offset: optionalNumber(input.offset),
        status: optionalString(input.status),
      }),
      mode: "execute",
    });
  },
  async get_member(input, context) {
    const payload = await requestMailchimpJson({
      apiKey: context.apiKey,
      context,
      path: memberPath(input),
      mode: "execute",
    });

    return { member: payload };
  },
  async upsert_member(input, context) {
    const emailAddress = requireInputString(input.email_address, "email_address");
    const payload = await requestMailchimpJson({
      apiKey: context.apiKey,
      context,
      path: `/lists/${encodeURIComponent(requireInputString(input.list_id, "list_id"))}/members/${subscriberHash(
        emailAddress,
      )}`,
      method: "PUT",
      query: compactObject({
        skip_merge_validation: optionalBoolean(input.skip_merge_validation),
      }),
      body: compactObject({
        email_address: emailAddress,
        status_if_new: optionalString(input.status_if_new),
        status: optionalString(input.status),
        merge_fields: optionalRecord(input.merge_fields),
        vip: optionalBoolean(input.vip),
        language: optionalString(input.language),
        email_type: optionalString(input.email_type),
      }),
      mode: "execute",
    });

    return { member: payload };
  },
  async update_member(input, context) {
    const payload = await requestMailchimpJson({
      apiKey: context.apiKey,
      context,
      path: memberPath(input),
      method: "PATCH",
      query: compactObject({
        skip_merge_validation: optionalBoolean(input.skip_merge_validation),
      }),
      body: compactObject({
        status: optionalString(input.status),
        merge_fields: optionalRecord(input.merge_fields),
        vip: optionalBoolean(input.vip),
        language: optionalString(input.language),
        email_type: optionalString(input.email_type),
      }),
      mode: "execute",
    });

    return { member: payload };
  },
  async archive_member(input, context) {
    await requestMailchimpNoContent({
      apiKey: context.apiKey,
      context,
      path: memberPath(input),
      method: "DELETE",
      mode: "execute",
    });

    return { success: true };
  },
  async delete_member_permanently(input, context) {
    await requestMailchimpNoContent({
      apiKey: context.apiKey,
      context,
      path: `${memberPath(input)}/actions/delete-permanent`,
      method: "POST",
      mode: "execute",
    });

    return { success: true };
  },
  list_member_tags(input, context) {
    return requestMailchimpJson({
      apiKey: context.apiKey,
      context,
      path: `${memberPath(input)}/tags`,
      mode: "execute",
    });
  },
  async update_member_tags(input, context) {
    await requestMailchimpNoContent({
      apiKey: context.apiKey,
      context,
      path: `${memberPath(input)}/tags`,
      method: "POST",
      body: {
        tags: Array.isArray(input.tags) ? input.tags : [],
      },
      mode: "execute",
    });

    return { success: true };
  },
  list_merge_fields(input, context) {
    return requestMailchimpJson({
      apiKey: context.apiKey,
      context,
      path: `/lists/${encodeURIComponent(requireInputString(input.list_id, "list_id"))}/merge-fields`,
      query: compactObject({
        count: optionalNumber(input.count),
        offset: optionalNumber(input.offset),
      }),
      mode: "execute",
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, mailchimpActionHandlers);

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireApiKeyCredential(context, service);
    const url = createProviderProxyUrl(mailchimpApiBaseUrl(credential.apiKey), input.endpoint, input.query);
    const headers = normalizeProviderProxyHeaders(input.headers);
    for (const [name, value] of Object.entries(mailchimpHeaders(credential.apiKey, input.body !== undefined))) {
      headers.set(name, value);
    }

    const init: RequestInit = {
      method: input.method,
      headers,
      signal: context.signal,
    };
    if (input.body !== undefined) {
      init.body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
    }

    const response = await providerFetch(url, init);
    if (!response.ok) {
      const text = await readProviderProxyErrorMessage(response, "");
      throw new ProviderRequestError(response.status, text || `Mailchimp request failed with HTTP ${response.status}`);
    }

    return { ok: true, response: await readProviderProxyResponse(response) };
  } catch (error) {
    return toProviderProxyError(error, "Mailchimp request failed");
  }
};

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateMailchimpCredential(input.apiKey, fetcher, signal);
  },
};

async function validateMailchimpCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestMailchimpJson({
    apiKey,
    context: { fetcher, signal },
    path: mailchimpValidationPath,
    mode: "validate",
  });

  const dataCenter = extractMailchimpDataCenter(apiKey);
  const apiBaseUrl = mailchimpApiBaseUrl(apiKey);
  const accountId = optionalString(payload.account_id);
  const loginId = optionalString(payload.login_id);
  const accountName = optionalString(payload.account_name);
  const email = optionalString(payload.email);
  const role = optionalString(payload.role);

  return {
    profile: {
      accountId: accountId ?? loginId ?? `mailchimp:${dataCenter}`,
      displayName: accountName ?? email ?? `Mailchimp ${dataCenter}`,
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl,
      dataCenter,
      validationEndpoint: mailchimpValidationPath,
      email,
      role,
    }),
  };
}

async function requestMailchimpJson(input: MailchimpRequestOptions): Promise<MailchimpJsonObject> {
  const response = await mailchimpFetch(input);
  const payload = await parseMailchimpJson(response);
  if (!response.ok) {
    throw toMailchimpError(response, payload, input.mode);
  }

  return payload;
}

async function requestMailchimpNoContent(input: MailchimpRequestOptions): Promise<Response> {
  const response = await mailchimpFetch(input);
  const raw = await readResponseBody(response);

  if (!response.ok) {
    const payload = raw.trim() === "" ? {} : parseMailchimpBody(raw);
    throw toMailchimpError(response, payload, input.mode);
  }

  return response;
}

async function mailchimpFetch(input: MailchimpRequestOptions): Promise<Response> {
  const url = buildMailchimpUrl(input.apiKey, input.path, input.query);
  const method = input.method ?? "GET";

  try {
    return await input.context.fetcher(url, {
      method,
      headers: mailchimpHeaders(input.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.context.signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ProviderRequestError(502, `Mailchimp request failed for ${method} ${url.toString()}: ${message}`);
  }
}

function buildMailchimpUrl(apiKey: string, path: string, query?: MailchimpRequestOptions["query"]): URL {
  const apiBaseUrl = mailchimpApiBaseUrl(apiKey);
  const url = new URL(path.startsWith("/") ? `${apiBaseUrl}${path}` : `${apiBaseUrl}/${path}`);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

function mailchimpHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Basic ${Buffer.from(`connect:${apiKey}`).toString("base64")}`,
    ...(hasBody ? { "content-type": "application/json" } : {}),
    "user-agent": providerUserAgent,
  };
}

async function parseMailchimpJson(response: Response): Promise<MailchimpJsonObject> {
  const raw = await readResponseBody(response);
  if (raw.trim() === "") {
    throw new ProviderRequestError(502, "Mailchimp returned an empty response body");
  }

  return parseMailchimpBody(raw);
}

async function readResponseBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `Failed to read Mailchimp response body: ${error.message}`
        : "Failed to read Mailchimp response body",
    );
  }
}

function parseMailchimpBody(raw: string): MailchimpJsonObject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ProviderRequestError(502, "Mailchimp returned invalid JSON");
  }

  const payload = optionalRecord(parsed);
  if (!payload) {
    throw new ProviderRequestError(502, "Mailchimp returned a non-object JSON payload");
  }

  return payload;
}

function toMailchimpError(
  response: Response,
  payload: MailchimpJsonObject,
  mode: MailchimpRequestMode,
): ProviderRequestError {
  const message = extractMailchimpErrorMessage(payload) ?? `Mailchimp request failed with status ${response.status}`;

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(mode === "validate" ? 400 : response.status, message, payload);
  }

  if (response.status === 400 || response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }

  if (response.status === 404) {
    return new ProviderRequestError(404, message, payload);
  }

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractMailchimpErrorMessage(payload: MailchimpJsonObject): string | undefined {
  const detail = optionalString(payload.detail);
  if (detail) {
    return detail;
  }

  const title = optionalString(payload.title);
  if (title) {
    return title;
  }

  const errors = payload.errors;
  if (Array.isArray(errors)) {
    for (const item of errors) {
      const message = optionalString(optionalRecord(item)?.message);
      if (message) {
        return message;
      }
    }
  }

  return undefined;
}

function mailchimpApiBaseUrl(apiKey: string): string {
  const dataCenter = extractMailchimpDataCenter(apiKey);
  return `https://${dataCenter}.api.mailchimp.com/3.0`;
}

function extractMailchimpDataCenter(apiKey: string): string {
  const trimmed = apiKey.trim();
  const separatorIndex = trimmed.lastIndexOf("-");
  if (separatorIndex <= 0 || separatorIndex === trimmed.length - 1) {
    throw new ProviderRequestError(400, "Mailchimp apiKey must include a data center suffix such as us1");
  }

  const dataCenter = trimmed.slice(separatorIndex + 1);
  if (!/^[a-z0-9]+$/i.test(dataCenter)) {
    throw new ProviderRequestError(400, "Mailchimp apiKey has an invalid data center suffix");
  }

  return dataCenter.toLowerCase();
}

function memberPath(input: Record<string, unknown>): string {
  const listId = requireInputString(input.list_id, "list_id");
  const hash = resolveSubscriberHash(input);
  return `/lists/${encodeURIComponent(listId)}/members/${encodeURIComponent(hash)}`;
}

function resolveSubscriberHash(input: Record<string, unknown>): string {
  const explicitHash = optionalString(input.subscriber_hash);
  if (explicitHash) {
    return explicitHash;
  }

  const emailAddress = optionalString(input.email_address);
  if (emailAddress) {
    return subscriberHash(emailAddress);
  }

  throw new ProviderRequestError(400, "subscriber_hash or email_address is required");
}

function subscriberHash(emailAddress: string): string {
  return createHash("md5").update(emailAddress.trim().toLowerCase()).digest("hex");
}

function requireInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}
