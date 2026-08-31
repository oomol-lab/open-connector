import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError, requiredInputString } from "../provider-runtime.ts";

const mailerliteApiBaseUrl = "https://connect.mailerlite.com/api";
const validationPath = "/groups";

type MailerliteMode = "validate" | "execute";
type MailerliteActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface MailerliteRequestOptions {
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  mode: MailerliteMode;
  method?: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}

export const mailerliteActionHandlers: ProviderActionHandlers<"mailerlite", MailerliteActionHandler> = {
  list_subscribers(input, context) {
    return requestMailerliteJson({
      path: "/subscribers",
      query: compactObject({
        "filter[status]": optionalString(input.status),
        limit: optionalInteger(input.limit),
        cursor: optionalString(input.cursor),
        include: input.include_groups === true ? "groups" : undefined,
      }),
      context,
      mode: "execute",
    });
  },
  get_subscriber(input, context) {
    return requestMailerliteJson({
      path: `/subscribers/${encodeURIComponent(requiredInputString(input.subscriber_id_or_email, "subscriber_id_or_email"))}`,
      context,
      mode: "execute",
    });
  },
  upsert_subscriber(input, context) {
    return requestMailerliteJson({
      path: "/subscribers",
      method: "POST",
      body: compactObject({
        email: requiredInputString(input.email, "email"),
        fields: optionalRecord(input.fields),
        groups: optionalStringArray(input.groups),
        status: optionalString(input.status),
        subscribed_at: optionalString(input.subscribed_at),
        ip_address: optionalString(input.ip_address),
        opted_in_at: optionalString(input.opted_in_at),
        optin_ip: optionalString(input.optin_ip),
        unsubscribed_at: optionalString(input.unsubscribed_at),
        resubscribe: input.resubscribe === true ? true : undefined,
      }),
      context,
      mode: "execute",
    });
  },
  update_subscriber(input, context) {
    return requestMailerliteJson({
      path: `/subscribers/${encodeURIComponent(requiredInputString(input.subscriber_id, "subscriber_id"))}`,
      method: "PUT",
      body: compactObject({
        fields: optionalRecord(input.fields),
        groups: optionalStringArray(input.groups),
        status: optionalString(input.status),
        subscribed_at: optionalString(input.subscribed_at),
        ip_address: optionalString(input.ip_address),
        opted_in_at: optionalString(input.opted_in_at),
        optin_ip: optionalString(input.optin_ip),
        unsubscribed_at: optionalString(input.unsubscribed_at),
      }),
      context,
      mode: "execute",
    });
  },
  async delete_subscriber(input, context) {
    await requestMailerliteNoContent({
      path: `/subscribers/${encodeURIComponent(requiredInputString(input.subscriber_id, "subscriber_id"))}`,
      method: "DELETE",
      context,
      mode: "execute",
    });
    return { success: true };
  },
  list_groups(input, context) {
    return requestMailerliteJson({
      path: "/groups",
      query: compactObject({
        limit: optionalInteger(input.limit),
        page: optionalInteger(input.page),
        "filter[name]": optionalString(input.name),
        sort: optionalString(input.sort),
      }),
      context,
      mode: "execute",
    });
  },
  create_group(input, context) {
    return requestMailerliteJson({
      path: "/groups",
      method: "POST",
      body: { name: requiredInputString(input.name, "name") },
      context,
      mode: "execute",
    });
  },
  update_group(input, context) {
    return requestMailerliteJson({
      path: `/groups/${encodeURIComponent(requiredInputString(input.group_id, "group_id"))}`,
      method: "PUT",
      body: { name: requiredInputString(input.name, "name") },
      context,
      mode: "execute",
    });
  },
  async delete_group(input, context) {
    await requestMailerliteNoContent({
      path: `/groups/${encodeURIComponent(requiredInputString(input.group_id, "group_id"))}`,
      method: "DELETE",
      context,
      mode: "execute",
    });
    return { success: true };
  },
  list_group_subscribers(input, context) {
    return requestMailerliteJson({
      path: `/groups/${encodeURIComponent(requiredInputString(input.group_id, "group_id"))}/subscribers`,
      query: compactObject({
        "filter[status]": optionalString(input.status),
        limit: optionalInteger(input.limit),
        cursor: optionalString(input.cursor),
        include: input.include_groups === true ? "groups" : undefined,
      }),
      context,
      mode: "execute",
    });
  },
  add_subscriber_to_group(input, context) {
    return requestMailerliteJson({
      path: `/subscribers/${encodeURIComponent(requiredInputString(input.subscriber_id, "subscriber_id"))}/groups/${encodeURIComponent(requiredInputString(input.group_id, "group_id"))}`,
      method: "POST",
      context,
      mode: "execute",
    });
  },
  async remove_subscriber_from_group(input, context) {
    await requestMailerliteNoContent({
      path: `/subscribers/${encodeURIComponent(requiredInputString(input.subscriber_id, "subscriber_id"))}/groups/${encodeURIComponent(requiredInputString(input.group_id, "group_id"))}`,
      method: "DELETE",
      context,
      mode: "execute",
    });
    return { success: true };
  },
  list_fields(input, context) {
    return requestMailerliteJson({
      path: "/fields",
      query: compactObject({
        limit: optionalInteger(input.limit),
        page: optionalInteger(input.page),
        "filter[keyword]": optionalString(input.keyword),
        "filter[type]": optionalString(input.type),
        sort: optionalString(input.sort),
      }),
      context,
      mode: "execute",
    });
  },
};

export async function validateMailerliteCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = { apiKey: requiredInputString(apiKey, "apiKey"), fetcher, signal };
  const payload = await requestMailerliteJson<Record<string, unknown>>({
    path: validationPath,
    query: { limit: 1 },
    context,
    mode: "validate",
  });
  const groups = Array.isArray(payload.data) ? payload.data : [];
  const firstGroup = optionalRecord(groups[0]);
  const meta = optionalRecord(payload.meta);
  const total = optionalInteger(meta?.total);

  return {
    profile: {
      accountId: "mailerlite",
      displayName: "MailerLite API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: mailerliteApiBaseUrl,
      validationEndpoint: validationPath,
      groupCount: total ?? groups.length,
      firstGroupId: optionalString(firstGroup?.id),
      firstGroupName: optionalString(firstGroup?.name),
    }),
  };
}

async function requestMailerliteJson<T = Record<string, unknown>>(input: MailerliteRequestOptions): Promise<T> {
  const response = await mailerliteFetch(input);
  const payload = await readMailerlitePayload(response, true);
  if (!response.ok) {
    throw toMailerliteError(response, payload, input.mode);
  }
  return payload as T;
}

async function requestMailerliteNoContent(input: MailerliteRequestOptions): Promise<void> {
  const response = await mailerliteFetch(input);
  const payload = await readMailerlitePayload(response, false);
  if (!response.ok) {
    throw toMailerliteError(response, payload, input.mode);
  }
}

async function mailerliteFetch(input: MailerliteRequestOptions): Promise<Response> {
  const url = new URL(input.path, mailerliteApiBaseUrl);
  const method = input.method ?? "GET";
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  try {
    return await input.context.fetcher(url, {
      method,
      headers: mailerliteHeaders(input.context.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `MailerLite request failed for ${method} ${url.toString()}: ${error.message}`
        : `MailerLite request failed for ${method} ${url.toString()}`,
    );
  }
}

function mailerliteHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    ...(hasBody ? { "content-type": "application/json" } : {}),
    "user-agent": providerUserAgent,
  };
}

async function readMailerlitePayload(response: Response, requireBody: boolean): Promise<Record<string, unknown>> {
  const raw = await response.text().catch(() => {
    throw new ProviderRequestError(502, "Failed to read MailerLite response body");
  });
  if (!raw.trim()) {
    if (requireBody) {
      throw new ProviderRequestError(502, "MailerLite returned an empty response body");
    }
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    const payload = optionalRecord(parsed);
    if (!payload) {
      throw new ProviderRequestError(502, "MailerLite returned a non-object JSON payload");
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(502, "MailerLite returned invalid JSON");
  }
}

function toMailerliteError(
  response: Response,
  payload: Record<string, unknown>,
  mode: MailerliteMode,
): ProviderRequestError {
  const message = extractMailerliteErrorMessage(payload) ?? `MailerLite request failed with status ${response.status}`;
  if (response.status === 401) {
    return new ProviderRequestError(mode === "validate" ? 400 : 401, message, payload);
  }
  if (response.status === 404) {
    return new ProviderRequestError(404, message, payload);
  }
  if (response.status === 422) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : 400, message, payload);
}

function extractMailerliteErrorMessage(payload: Record<string, unknown>): string | undefined {
  const message = optionalString(payload.message);
  if (message) {
    return message;
  }

  const errors = optionalRecord(payload.errors);
  if (!errors) {
    return undefined;
  }

  for (const value of Object.values(errors)) {
    if (!Array.isArray(value)) {
      continue;
    }
    const first = optionalString(value[0]);
    if (first) {
      return first;
    }
  }
  return undefined;
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => optionalString(item)).filter((item): item is string => Boolean(item));
}
