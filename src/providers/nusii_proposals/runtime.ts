import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
} from "../provider-runtime.ts";

export const nusiiProposalsApiBaseUrl = "https://app.nusii.com/api/v2/";

const nusiiProposalsRequestTimeoutMs = 30_000;

type NusiiProposalsRequestPhase = "validate" | "execute";
type NusiiProposalsMethod = "GET" | "POST" | "PUT";
type NusiiProposalsContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type NusiiProposalsActionHandler = (input: Record<string, unknown>, context: NusiiProposalsContext) => Promise<unknown>;

const clientWriteFields = [
  "email",
  "name",
  "surname",
  "currency",
  "business",
  "locale",
  "pdf_page_size",
  "web",
  "telephone",
  "address",
  "city",
  "postcode",
  "country",
  "state",
];

const proposalCreateFields = [
  "title",
  "client_id",
  "client_email",
  "template_id",
  "document_section_title",
  "prepared_by_id",
  "expires_at",
  "display_date",
  "report",
  "exclude_total",
  "exclude_total_in_pdf",
  "theme",
];

const proposalUpdateFields = proposalCreateFields.filter((field) => field !== "template_id");

const proposalSendFields = [
  "email",
  "recipients",
  "cc",
  "bcc",
  "subject",
  "message",
  "save_email_template",
  "sender_id",
  "sender_email",
];

export const nusiiProposalsActionHandlers: ProviderActionHandlers<"nusii_proposals", NusiiProposalsActionHandler> = {
  get_account(_input, context) {
    return requestNusiiJson({
      path: "account/me",
      method: "GET",
      phase: "execute",
      ...context,
    });
  },
  list_clients(input, context) {
    return requestNusiiJson({
      path: "clients",
      method: "GET",
      query: pagedQuery(input),
      phase: "execute",
      ...context,
    });
  },
  get_client(input, context) {
    return requestNusiiJson({
      path: `clients/${readResourceId(input.id, "id")}`,
      method: "GET",
      phase: "execute",
      ...context,
    });
  },
  create_client(input, context) {
    return requestNusiiJson({
      path: "clients",
      method: "POST",
      body: { client: pickFields(input, clientWriteFields) },
      phase: "execute",
      ...context,
    });
  },
  list_proposals(input, context) {
    const recipientEmails = Array.isArray(input.recipient_emails) ? input.recipient_emails.join(",") : undefined;
    return requestNusiiJson({
      path: "proposals",
      method: "GET",
      query: compactObject({
        ...pagedQuery(input),
        status: input.status,
        archived: input.archived,
        recipient_email: input.recipient_email,
        recipient_emails: recipientEmails,
      }),
      phase: "execute",
      ...context,
    });
  },
  get_proposal(input, context) {
    return requestNusiiJson({
      path: `proposals/${readResourceId(input.id, "id")}`,
      method: "GET",
      phase: "execute",
      ...context,
    });
  },
  create_proposal(input, context) {
    return requestNusiiJson({
      path: "proposals",
      method: "POST",
      body: { proposal: pickFields(input, proposalCreateFields) },
      phase: "execute",
      ...context,
    });
  },
  update_proposal(input, context) {
    const body = pickFields(input, proposalUpdateFields);
    if (Object.keys(body).length === 0) {
      throw new ProviderRequestError(400, "Provide at least one proposal field to update.");
    }
    return requestNusiiJson({
      path: `proposals/${readResourceId(input.id, "id")}`,
      method: "PUT",
      body,
      phase: "execute",
      ...context,
    });
  },
  archive_proposal(input, context) {
    return requestNusiiJson({
      path: `proposals/${readResourceId(input.id, "id")}/archive`,
      method: "PUT",
      phase: "execute",
      ...context,
    });
  },
  send_proposal(input, context) {
    if (input.email === undefined && input.recipients === undefined) {
      throw new ProviderRequestError(400, "Provide email or at least one recipient.");
    }
    return requestNusiiJson({
      path: `proposals/${readResourceId(input.id, "id")}/send_proposal`,
      method: "PUT",
      body: pickFields(input, proposalSendFields),
      phase: "execute",
      ...context,
    });
  },
  list_templates(input, context) {
    return requestNusiiJson({
      path: "templates",
      method: "GET",
      query: compactObject({
        ...pagedQuery(input),
        public_templates: input.public_templates,
      }),
      phase: "execute",
      ...context,
    });
  },
  get_template(input, context) {
    return requestNusiiJson({
      path: `templates/${readResourceId(input.id, "id")}`,
      method: "GET",
      phase: "execute",
      ...context,
    });
  },
  list_users(input, context) {
    return requestNusiiJson({
      path: "users",
      method: "GET",
      query: pagedQuery(input),
      phase: "execute",
      ...context,
    });
  },
  list_themes(_input, context) {
    return requestNusiiJson({
      path: "themes",
      method: "GET",
      phase: "execute",
      ...context,
    });
  },
};

export async function validateNusiiProposalsCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestNusiiJson({
    path: "account/me",
    method: "GET",
    apiKey,
    fetcher,
    signal,
    phase: "validate",
  });
  const account = requireObject(payload, "Nusii account response");
  const data = requireObject(account.data, "Nusii account data");
  const attributes = requireObject(data.attributes, "Nusii account attributes");
  const name = readNonEmptyString(attributes.name);
  const email = readNonEmptyString(attributes.email);
  const subdomain = readNonEmptyString(attributes.subdomain);

  return {
    profile: {
      accountId: readStringLike(data.id) ?? "api_key",
      displayName: name ?? email ?? subdomain ?? "Nusii API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: nusiiProposalsApiBaseUrl,
      validationEndpoint: "/account/me",
      accountId: readStringLike(data.id),
      accountName: name,
      accountEmail: email,
      accountSubdomain: subdomain,
    }),
  };
}

function pagedQuery(input: Record<string, unknown>) {
  return compactObject({
    page: input.page,
    per: input.per,
  });
}

function pickFields(input: Record<string, unknown>, fields: readonly string[]) {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (input[field] !== undefined) {
      result[field] = input[field];
    }
  }
  return result;
}

function readResourceId(value: unknown, fieldName: string) {
  const id = readStringLike(value)?.trim();
  if (!id) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return encodeURIComponent(id);
}

function readStringLike(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function readNonEmptyString(value: unknown) {
  return optionalString(value);
}

async function requestNusiiJson(input: {
  path: string;
  method: NusiiProposalsMethod;
  apiKey: string;
  fetcher: typeof fetch;
  phase: NusiiProposalsRequestPhase;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  signal?: AbortSignal;
}) {
  const url = new URL(input.path, nusiiProposalsApiBaseUrl);
  for (const [name, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(name, String(value));
    }
  }

  const timeout = createProviderTimeout(input.signal, nusiiProposalsRequestTimeoutMs);
  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: input.method,
      headers: {
        accept: "application/json",
        authorization: `Token token=${input.apiKey}`,
        ...(input.body === undefined ? {} : { "content-type": "application/json" }),
        "user-agent": providerUserAgent,
      },
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Nusii request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Nusii request failed: ${error.message}` : "Nusii request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }

  const payload = await readNusiiPayload(response);
  if (!response.ok) {
    throw createNusiiError(response.status, payload, input.phase);
  }
  if (typeof payload === "string") {
    throw new ProviderRequestError(502, "Nusii returned invalid JSON");
  }
  return payload;
}

async function readNusiiPayload(response: Response) {
  const text = await readProviderTextBody(response, "Nusii response", 10 * 1024 * 1024);
  if (!text.trim()) {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createNusiiError(status: number, payload: unknown, phase: NusiiProposalsRequestPhase) {
  const message = extractNusiiErrorMessage(payload) ?? `Nusii request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message);
  }
  if (phase === "execute" && status === 401) {
    return new ProviderRequestError(401, message);
  }
  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message);
  }
  return new ProviderRequestError(status >= 500 ? status : 502, message);
}

function extractNusiiErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  const error = record.error;
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  const nestedError = optionalRecord(error);
  const nestedMessage = readNonEmptyString(nestedError?.message);
  if (nestedMessage) {
    return nestedMessage;
  }
  const message = readNonEmptyString(record.message);
  if (message) {
    return message;
  }
  if (Array.isArray(record.errors)) {
    for (const item of record.errors) {
      if (typeof item === "string" && item.trim()) {
        return item;
      }
      const itemRecord = optionalRecord(item);
      const itemMessage = readNonEmptyString(itemRecord?.message);
      if (itemMessage) {
        return itemMessage;
      }
    }
  }
  return undefined;
}

function requireObject(value: unknown, label: string) {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} must be an object`);
  }
  return record;
}
