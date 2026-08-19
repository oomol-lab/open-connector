import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const mailersendApiBaseUrl = "https://api.mailersend.com";
const validationPath = "/v1/domains";

type MailersendMode = "validate" | "execute";
type MailersendActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface MailersendRequestOptions {
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  mode: MailersendMode;
  method?: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}

export const mailersendActionHandlers: ProviderActionHandlers<"mailersend", MailersendActionHandler> = {
  async send_email(input, context) {
    if (!optionalString(input.text) && !optionalString(input.html)) {
      throw new ProviderRequestError(400, "text or html is required");
    }
    const response = await mailersendFetch({
      path: "/v1/email",
      method: "POST",
      body: compactObject({ ...input }),
      context,
      mode: "execute",
    });
    const payload = await readMailersendPayload(response, false);
    if (!response.ok) {
      throw toMailersendError(response, payload, "execute");
    }

    return {
      message: optionalString(payload.message) ?? "Accepted",
      message_id: response.headers.get("x-message-id") ?? "",
      raw: payload,
    };
  },
  list_messages(input, context) {
    return requestMailersendJson({
      path: "/v1/messages",
      query: buildMessagesQuery(input),
      context,
      mode: "execute",
    });
  },
  get_message(input, context) {
    return requestMailersendJson({
      path: `/v1/messages/${encodeURIComponent(requiredInputString(input.message_id, "message_id"))}`,
      context,
      mode: "execute",
    });
  },
  list_domains(input, context) {
    return requestMailersendJson({
      path: validationPath,
      query: compactObject({
        page: optionalInteger(input.page),
        limit: optionalInteger(input.limit),
        name: optionalString(input.name),
      }),
      context,
      mode: "execute",
    });
  },
  get_domain(input, context) {
    return requestMailersendJson({
      path: `/v1/domains/${encodeURIComponent(requiredInputString(input.domain_id, "domain_id"))}`,
      context,
      mode: "execute",
    });
  },
  list_domain_recipients(input, context) {
    return requestMailersendJson({
      path: `/v1/domains/${encodeURIComponent(requiredInputString(input.domain_id, "domain_id"))}/recipients`,
      query: compactObject({
        page: optionalInteger(input.page),
        limit: optionalInteger(input.limit),
      }),
      context,
      mode: "execute",
    });
  },
  get_domain_dns_records(input, context) {
    return requestMailersendJson({
      path: `/v1/domains/${encodeURIComponent(requiredInputString(input.domain_id, "domain_id"))}/dns-records`,
      context,
      mode: "execute",
    });
  },
  get_domain_verification_status(input, context) {
    return requestMailersendJson({
      path: `/v1/domains/${encodeURIComponent(requiredInputString(input.domain_id, "domain_id"))}/verify`,
      context,
      mode: "execute",
    });
  },
  list_templates(input, context) {
    return requestMailersendJson({
      path: "/v1/templates",
      query: compactObject({
        page: optionalInteger(input.page),
        limit: optionalInteger(input.limit),
      }),
      context,
      mode: "execute",
    });
  },
  get_template(input, context) {
    return requestMailersendJson({
      path: `/v1/templates/${encodeURIComponent(requiredInputString(input.template_id, "template_id"))}`,
      context,
      mode: "execute",
    });
  },
  list_sender_identities(input, context) {
    return requestMailersendJson({
      path: "/v1/identities",
      query: compactObject({
        page: optionalInteger(input.page),
        limit: optionalInteger(input.limit),
        domain_id: optionalString(input.domain_id),
      }),
      context,
      mode: "execute",
    });
  },
  get_sender_identity(input, context) {
    return requestMailersendJson({
      path: `/v1/identities/${encodeURIComponent(requiredInputString(input.identity_id, "identity_id"))}`,
      context,
      mode: "execute",
    });
  },
};

export async function validateMailersendCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const context = { apiKey: requiredInputString(apiKey, "apiKey"), fetcher, signal };
  const payload = await requestMailersendJson<Record<string, unknown>>({
    path: validationPath,
    query: { limit: 10 },
    context,
    mode: "validate",
  });

  const domains = Array.isArray(payload.data) ? payload.data : [];
  const firstDomain = optionalRecord(domains[0]);
  const firstDomainId = optionalString(firstDomain?.id);
  const firstDomainName = optionalString(firstDomain?.name);

  return {
    profile: {
      accountId: firstDomainId ? `mailersend:domain:${firstDomainId}` : "mailersend",
      displayName: firstDomainName ?? "MailerSend API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: validationPath,
      domainCount: domains.length,
      firstDomainId,
      firstDomainName,
    }),
  };
}

async function requestMailersendJson<T = Record<string, unknown>>(input: MailersendRequestOptions): Promise<T> {
  const response = await mailersendFetch(input);
  const payload = await readMailersendPayload(response, true);
  if (!response.ok) {
    throw toMailersendError(response, payload, input.mode);
  }
  return payload as T;
}

async function mailersendFetch(input: MailersendRequestOptions): Promise<Response> {
  const url = new URL(input.path, mailersendApiBaseUrl);
  const method = input.method ?? "GET";
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  try {
    return await input.context.fetcher(url, {
      method,
      headers: mailersendHeaders(input.context.apiKey, input.body !== undefined),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `MailerSend request failed for ${method} ${url.toString()}: ${error.message}`
        : `MailerSend request failed for ${method} ${url.toString()}`,
    );
  }
}

function mailersendHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    ...(hasBody ? { "content-type": "application/json" } : {}),
    "user-agent": providerUserAgent,
  };
}

async function readMailersendPayload(response: Response, requireBody: boolean): Promise<Record<string, unknown>> {
  const raw = await response.text().catch(() => {
    throw new ProviderRequestError(502, "Failed to read MailerSend response body");
  });
  if (!raw.trim()) {
    if (requireBody) {
      throw new ProviderRequestError(502, "MailerSend returned an empty response body");
    }
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    const payload = optionalRecord(parsed);
    if (!payload) {
      throw new ProviderRequestError(502, "MailerSend returned a non-object JSON payload");
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(502, "MailerSend returned invalid JSON");
  }
}

function toMailersendError(
  response: Response,
  payload: Record<string, unknown>,
  mode: MailersendMode,
): ProviderRequestError {
  const message = optionalString(payload.message) ?? `MailerSend request failed with status ${response.status}`;
  if (response.status === 401) {
    return new ProviderRequestError(mode === "validate" ? 400 : 401, message, payload);
  }
  if (response.status === 403) {
    return new ProviderRequestError(403, message, payload);
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
  return new ProviderRequestError(response.status >= 500 ? 502 : 500, message, payload);
}

function buildMessagesQuery(input: Record<string, unknown>): Record<string, string | number | undefined> {
  return compactObject({
    page: optionalInteger(input.page),
    limit: optionalInteger(input.limit),
    status: optionalString(input.status),
    from: optionalString(input.from),
    to: optionalString(input.to),
    subject: optionalString(input.subject),
    domain_id: optionalString(input.domain_id),
  });
}

function requiredInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}
