import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, objectArray, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import { ProviderRequestError, providerUserAgent, requiredInputString } from "../provider-runtime.ts";

const emailoctopusApiBaseUrl = "https://emailoctopus.com/api/1.6";
const emailoctopusValidationPath = "/lists";

interface EmailoctopusRequestOptions {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  mode: "validate" | "execute";
  path: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}

type EmailoctopusActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const emailoctopusActionHandlers: ProviderActionHandlers<"emailoctopus", EmailoctopusActionHandler> = {
  list_lists(input, context) {
    return listLists(input, context);
  },
  get_list(input, context) {
    return getList(input, context);
  },
  list_list_contacts(input, context) {
    return listListContacts(input, context);
  },
  get_list_contact(input, context) {
    return getListContact(input, context);
  },
  create_list_contact(input, context) {
    return createListContact(input, context);
  },
  update_list_contact(input, context) {
    return updateListContact(input, context);
  },
  delete_list_contact(input, context) {
    return deleteListContact(input, context);
  },
  list_campaigns(input, context) {
    return listCampaigns(input, context);
  },
  get_campaign(input, context) {
    return getCampaign(input, context);
  },
};

export async function validateEmailoctopusCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestEmailoctopusJson({
    context: { apiKey, fetcher, signal },
    path: emailoctopusValidationPath,
    mode: "validate",
    query: {
      limit: 1,
      page: 1,
    },
  });
  const lists = readObjectArray(payload.data, "data");
  const firstList = optionalRecord(lists[0]);
  const paging = optionalRecord(payload.paging);

  return {
    profile: {
      accountId: "emailoctopus",
      displayName: "EmailOctopus API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: emailoctopusApiBaseUrl,
      validationEndpoint: emailoctopusValidationPath,
      firstListId: optionalString(firstList?.id),
      firstListName: optionalString(firstList?.name),
      currentPage: optionalInteger(paging?.current_page),
      totalPages: optionalInteger(paging?.total_pages),
    }),
  };
}

async function listLists(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestEmailoctopusJson({
    context,
    path: "/lists",
    query: compactObject({
      limit: optionalInteger(input.limit),
      page: optionalInteger(input.page),
    }),
    mode: "execute",
  });

  return {
    lists: readObjectArray(payload.data, "data"),
    paging: optionalRecord(payload.paging),
  };
}

async function getList(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestEmailoctopusJson({
    context,
    path: `/lists/${encodePathSegment(requiredInputString(input.list_id, "list_id"))}`,
    mode: "execute",
  });

  return { list: payload };
}

async function listListContacts(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestEmailoctopusJson({
    context,
    path: `/lists/${encodePathSegment(requiredInputString(input.list_id, "list_id"))}/contacts`,
    query: compactObject({
      limit: optionalInteger(input.limit),
      page: optionalInteger(input.page),
    }),
    mode: "execute",
  });

  return {
    contacts: readObjectArray(payload.data, "data"),
    paging: optionalRecord(payload.paging),
  };
}

async function getListContact(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestEmailoctopusJson({
    context,
    path: contactPath(input),
    mode: "execute",
  });

  return { contact: payload };
}

async function createListContact(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestEmailoctopusJson({
    context,
    path: `/lists/${encodePathSegment(requiredInputString(input.list_id, "list_id"))}/contacts`,
    method: "POST",
    body: compactObject({
      email_address: requiredInputString(input.email_address, "email_address"),
      fields: optionalRecord(input.fields),
      tags: optionalStringArray(input.tags),
      status: optionalString(input.status),
    }),
    mode: "execute",
  });

  return { contact: payload };
}

async function updateListContact(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestEmailoctopusJson({
    context,
    path: contactPath(input),
    method: "PUT",
    body: compactObject({
      email_address: optionalString(input.email_address),
      fields: optionalRecord(input.fields),
      tags: optionalRecord(input.tags),
      status: optionalString(input.status),
    }),
    mode: "execute",
  });

  return { contact: payload };
}

async function deleteListContact(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  await requestEmailoctopusNoContent({
    context,
    path: contactPath(input),
    method: "DELETE",
    mode: "execute",
  });

  return { success: true };
}

async function listCampaigns(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestEmailoctopusJson({
    context,
    path: "/campaigns",
    query: compactObject({
      limit: optionalInteger(input.limit),
      page: optionalInteger(input.page),
    }),
    mode: "execute",
  });

  return {
    campaigns: readObjectArray(payload.data, "data"),
    paging: optionalRecord(payload.paging),
  };
}

async function getCampaign(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestEmailoctopusJson({
    context,
    path: `/campaigns/${encodePathSegment(requiredInputString(input.campaign_id, "campaign_id"))}`,
    mode: "execute",
  });

  return { campaign: payload };
}

async function requestEmailoctopusJson(input: EmailoctopusRequestOptions): Promise<Record<string, unknown>> {
  const method = input.method ?? "GET";
  const url = new URL(`${emailoctopusApiBaseUrl}${input.path}`);

  if (method === "GET" || method === "DELETE") {
    url.searchParams.set("api_key", input.context.apiKey);
  }

  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  try {
    response = await input.context.fetcher(url, {
      method,
      headers: buildJsonHeaders(input.body !== undefined),
      body:
        input.body === undefined
          ? undefined
          : JSON.stringify({
              api_key: input.context.apiKey,
              ...optionalRecord(input.body),
            }),
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `EmailOctopus request failed for ${method} ${url.toString()}: ${error.message}`
        : `EmailOctopus request failed for ${method} ${url.toString()}`,
    );
  }

  const payload = await readEmailoctopusPayload(response);
  if (!response.ok) {
    const message =
      optionalString(optionalRecord(payload.error)?.message) ??
      optionalString(payload.error) ??
      `EmailOctopus request failed with status ${response.status}`;
    throw createEmailoctopusHttpError(response.status, message, input.mode);
  }

  return payload;
}

async function requestEmailoctopusNoContent(input: EmailoctopusRequestOptions): Promise<void> {
  const method = input.method ?? "DELETE";
  const url = new URL(`${emailoctopusApiBaseUrl}${input.path}`);
  url.searchParams.set("api_key", input.context.apiKey);

  let response: Response;
  try {
    response = await input.context.fetcher(url, {
      method,
      headers: {
        "user-agent": providerUserAgent,
        accept: "application/json",
      },
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `EmailOctopus request failed for ${method} ${url.toString()}: ${error.message}`
        : `EmailOctopus request failed for ${method} ${url.toString()}`,
    );
  }

  if (!response.ok) {
    const message =
      (await readEmailoctopusErrorMessage(response)) ?? `EmailOctopus request failed with status ${response.status}`;
    throw createEmailoctopusHttpError(response.status, message, input.mode);
  }
}

async function readEmailoctopusPayload(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text().catch(() => {
    throw new ProviderRequestError(502, "Failed to read EmailOctopus response body");
  });
  if (!text) {
    return {};
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "EmailOctopus returned invalid JSON");
  }

  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "EmailOctopus returned a non-object JSON payload");
  }
  return record;
}

async function readEmailoctopusErrorMessage(response: Response): Promise<string | undefined> {
  const text = await response.text().catch(() => undefined);
  if (!text) {
    return undefined;
  }

  try {
    const payload = optionalRecord(JSON.parse(text) as unknown);
    return (
      optionalString(optionalRecord(payload?.error)?.message) ??
      optionalString(payload?.error) ??
      optionalString(payload?.message) ??
      text
    );
  } catch {
    return text;
  }
}

function createEmailoctopusHttpError(
  status: number,
  message: string,
  mode: "validate" | "execute",
): ProviderRequestError {
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (mode === "validate" && status === 401) {
    return new ProviderRequestError(400, message);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(status || 500, message);
}

function buildJsonHeaders(hasBody: boolean): Record<string, string> {
  const headers: Record<string, string> = {
    "user-agent": providerUserAgent,
    accept: "application/json",
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
  }
  return headers;
}

function contactPath(input: Record<string, unknown>): string {
  return `/lists/${encodePathSegment(requiredInputString(input.list_id, "list_id"))}/contacts/${encodePathSegment(
    requiredInputString(input.contact_id, "contact_id"),
  )}`;
}

function readObjectArray(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  return Array.isArray(value) ? objectArray(value, fieldName, (message) => new ProviderRequestError(502, message)) : [];
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((item) => optionalString(item)).filter((item): item is string => item !== undefined);
}
