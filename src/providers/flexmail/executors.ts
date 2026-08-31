import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { Buffer } from "node:buffer";
import { compactObject, optionalInteger, optionalRawString, optionalRecord } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
  requireCustomCredential,
  requiredResponseRecord,
} from "../provider-runtime.ts";

const service = "flexmail";
const flexmailApiBaseUrl = "https://api.flexmail.eu";

const flexmailMaxResponseBytes = 10 * 1024 * 1024;
const supportedLanguageSet = new Set([
  "nl",
  "fr",
  "de",
  "it",
  "es",
  "ru",
  "da",
  "se",
  "zh",
  "pt",
  "pl",
  "en",
  "hu",
  "bg",
  "hr",
  "cs",
  "et",
  "fi",
  "el",
  "ga",
  "lv",
  "lt",
  "mt",
  "ro",
  "sk",
  "sl",
  "uk",
  "ca",
]);

type FlexmailRequestPhase = "validate" | "execute";

interface FlexmailCredentialContext {
  readonly accountId: string;
  readonly personalAccessToken: string;
  readonly fetcher: typeof fetch;
  readonly signal?: AbortSignal;
}

interface FlexmailRequestInput {
  readonly context: FlexmailCredentialContext;
  readonly method: string;
  readonly path: string;
  readonly query?: Record<string, string | number | undefined>;
  readonly body?: Record<string, unknown>;
  readonly parseResponse?: boolean;
  readonly phase?: FlexmailRequestPhase;
}

interface FlexmailCreatedResource {
  readonly id?: string | number;
  readonly location?: string;
}

interface FlexmailCollection {
  readonly items: readonly unknown[];
  readonly total?: number;
  readonly limit?: number;
  readonly offset?: number;
  readonly payload: Record<string, unknown>;
}

type FlexmailActionHandler = (input: Record<string, unknown>, context: FlexmailCredentialContext) => Promise<unknown>;

export const flexmailActionHandlers: ProviderActionHandlers<"flexmail", FlexmailActionHandler> = {
  list_contacts(input, context) {
    return flexmailCollectionRequest({
      context,
      method: "GET",
      path: "/contacts",
      query: pickQuery(input, ["email", "limit", "offset"]),
    });
  },
  async create_contact(input, context) {
    return flexmailCreatedResourceRequest({
      context,
      method: "POST",
      path: "/contacts",
      body: compactObject({
        email: input.email,
        source: input.source,
        first_name: trimOptionalString(input.first_name),
        name: trimOptionalString(input.name),
        language: readSupportedLanguage(input.language),
        custom_fields: input.custom_fields,
      }),
    });
  },
  async get_contact(input, context) {
    return flexmailResourceRequest({
      context,
      method: "GET",
      path: `/contacts/${encodeURIComponent(String(input.id))}`,
    });
  },
  async update_contact(input, context) {
    return flexmailResourceRequest({
      context,
      method: "PATCH",
      path: `/contacts/${encodeURIComponent(String(input.id))}`,
      body: compactObject({
        first_name: trimOptionalString(input.first_name),
        name: trimOptionalString(input.name),
        language: readSupportedLanguage(input.language),
        custom_fields: input.custom_fields,
      }),
    });
  },
  async unsubscribe_contact(input, context) {
    await flexmailRequest({
      context,
      method: "POST",
      path: `/contacts/${encodeURIComponent(String(input.id))}/unsubscribe`,
      parseResponse: false,
    });
    return { ok: true };
  },
  list_custom_fields(input, context) {
    return flexmailCollectionRequest({
      context,
      method: "GET",
      path: "/custom-fields",
      query: {
        type: optionalRawString(input.type),
        language: trimOptionalString(input.language),
      },
    });
  },
  list_interests(input, context) {
    return flexmailCollectionRequest({
      context,
      method: "GET",
      path: "/interests",
      query: {
        name: trimOptionalString(input.name),
        visibility: optionalRawString(input.visibility),
        order_by: optionalRawString(input.order_by),
        order_direction: optionalRawString(input.order_direction),
        limit: optionalInteger(input.limit),
        offset: optionalInteger(input.offset),
      },
    });
  },
  async create_interest(input, context) {
    return flexmailCreatedResourceRequest({
      context,
      method: "POST",
      path: "/interests",
      body: compactObject({
        name: requireTrimmedString(input.name, "name"),
        visibility: input.visibility,
        label: trimOptionalString(input.label),
        description: trimOptionalString(input.description),
      }),
    });
  },
  async get_interest(input, context) {
    return flexmailResourceRequest({
      context,
      method: "GET",
      path: `/interests/${encodeURIComponent(String(input.id))}`,
    });
  },
  async update_interest(input, context) {
    return flexmailResourceRequest({
      context,
      method: "PATCH",
      path: `/interests/${encodeURIComponent(String(input.id))}`,
      body: compactObject({
        name: input.name === undefined ? undefined : requireTrimmedString(input.name, "name"),
        visibility: input.visibility,
        label: trimOptionalString(input.label),
        description: trimOptionalString(input.description),
      }),
    });
  },
  async delete_interest(input, context) {
    await flexmailRequest({
      context,
      method: "DELETE",
      path: `/interests/${encodeURIComponent(String(input.id))}`,
      parseResponse: false,
    });
    return { ok: true };
  },
  list_contact_interest_subscriptions(input, context) {
    return flexmailCollectionRequest({
      context,
      method: "GET",
      path: `/contacts/${encodeURIComponent(String(input.id))}/interest-subscriptions`,
    });
  },
  async add_contact_interest_subscription(input, context) {
    return flexmailCreatedResourceRequest({
      context,
      method: "POST",
      path: `/contacts/${encodeURIComponent(String(input.contactId))}/interest-subscriptions`,
      body: {
        interest_id: input.interestId,
      },
    });
  },
  async remove_contact_interest_subscription(input, context) {
    await flexmailRequest({
      context,
      method: "DELETE",
      path: `/contacts/${encodeURIComponent(String(input.contactId))}/interest-subscriptions/${encodeURIComponent(String(input.interestId))}`,
      parseResponse: false,
    });
    return { ok: true };
  },
  list_contact_preferences(input, context) {
    return flexmailCollectionRequest({
      context,
      method: "GET",
      path: `/contacts/${encodeURIComponent(String(input.id))}/preferences`,
    });
  },
  async add_contact_preference_subscription(input, context) {
    return flexmailCreatedResourceRequest({
      context,
      method: "POST",
      path: "/contact-preference-subscriptions",
      body: {
        contact_id: input.contactId,
        preference_id: input.preferenceId,
      },
    });
  },
  async remove_contact_preference_subscription(input, context) {
    await flexmailRequest({
      context,
      method: "DELETE",
      path: `/contact-preference-subscriptions/${encodeURIComponent(requireTrimmedString(input.id, "id"))}`,
      parseResponse: false,
    });
    return { ok: true };
  },
  list_contact_sources(input, context) {
    return flexmailCollectionRequest({
      context,
      method: "GET",
      path: `/contacts/${encodeURIComponent(String(input.id))}/sources`,
    });
  },
  async list_account_contact_languages(_input, context) {
    return flexmailResourceRequest({
      context,
      method: "GET",
      path: "/account-contact-languages",
    });
  },
  list_interest_labels(_input, context) {
    return flexmailCollectionRequest({
      context,
      method: "GET",
      path: "/interest-labels",
    });
  },
  list_preferences(_input, context) {
    return flexmailCollectionRequest({
      context,
      method: "GET",
      path: "/preferences",
    });
  },
  list_segments(_input, context) {
    return flexmailCollectionRequest({
      context,
      method: "GET",
      path: "/segments",
    });
  },
  list_sources(_input, context) {
    return flexmailCollectionRequest({
      context,
      method: "GET",
      path: "/sources",
    });
  },
  async get_source(input, context) {
    return flexmailResourceRequest({
      context,
      method: "GET",
      path: `/sources/${encodeURIComponent(String(input.id))}`,
    });
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<FlexmailCredentialContext>({
  service,
  handlers: flexmailActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher): Promise<FlexmailCredentialContext> {
    const credential = await requireCustomCredential(context, service);
    return resolveFlexmailCredentialContext(credential.values, fetcher, context.signal);
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: flexmailApiBaseUrl,
  auth: { type: "none" },
  async customizeRequest({ context, headers }) {
    const credential = await requireCustomCredential(context, service);
    const accountId = requireCredentialValue(credential.values, "accountId");
    const personalAccessToken = requireCredentialValue(credential.values, "personalAccessToken");
    headers.set("authorization", buildFlexmailAuthorization(accountId, personalAccessToken));
    headers.set("accept", "application/hal+json, application/json");
    headers.set("user-agent", providerUserAgent);
  },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async customCredential(input, { fetcher, signal }) {
    const context = resolveFlexmailCredentialContext(input.values, fetcher, signal);
    const payload = await flexmailRequest({
      context,
      method: "GET",
      path: "/",
      phase: "validate",
    });
    const payloadRecord = requiredResponseRecord(payload, "Flexmail API root response");
    const user = optionalRecord(payloadRecord.user);
    const firstName = optionalRawString(user?.first_name);
    const lastName = optionalRawString(user?.name);
    const email = optionalRawString(user?.email);
    const company = optionalRawString(user?.company);
    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
    const accountLabel = fullName || email || company || `Flexmail account ${context.accountId}`;

    return {
      profile: {
        accountId: context.accountId,
        displayName: accountLabel,
      },
      grantedScopes: [],
      metadata: compactObject({
        email,
        company,
      }),
    };
  },
};

function resolveFlexmailCredentialContext(
  values: Record<string, string>,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): FlexmailCredentialContext {
  return {
    accountId: requireCredentialValue(values, "accountId"),
    personalAccessToken: requireCredentialValue(values, "personalAccessToken"),
    fetcher,
    signal,
  };
}

async function flexmailCollectionRequest(input: FlexmailRequestInput): Promise<FlexmailCollection> {
  const payload = await flexmailRequest(input);
  const record = requiredResponseRecord(payload, "Flexmail collection response");
  return {
    items: readEmbeddedItems(record),
    total: optionalInteger(record.total),
    limit: optionalInteger(record.limit),
    offset: optionalInteger(record.offset),
    payload: record,
  };
}

async function flexmailResourceRequest(input: FlexmailRequestInput) {
  const resource = await flexmailRequest(input);
  return {
    resource: requiredResponseRecord(resource, "Flexmail resource response"),
  };
}

async function flexmailCreatedResourceRequest(input: FlexmailRequestInput): Promise<FlexmailCreatedResource> {
  const response = await flexmailRawRequest(input);
  await assertFlexmailResponse(response, input.phase ?? "execute");
  const location = response.headers.get("location") ?? undefined;
  return compactObject({
    id: readCreatedId(location),
    location,
  });
}

async function flexmailRequest(input: FlexmailRequestInput) {
  const response = await flexmailRawRequest(input);
  await assertFlexmailResponse(response, input.phase ?? "execute");
  if (input.parseResponse === false || response.status === 204) {
    return {};
  }

  return readSuccessfulJsonResponse(response);
}

async function flexmailRawRequest(input: FlexmailRequestInput) {
  const timeoutHandle = createProviderTimeout(input.context.signal);
  const headers: Record<string, string> = {
    accept: "application/hal+json, application/json",
    authorization: buildFlexmailAuthorization(input.context.accountId, input.context.personalAccessToken),
    "user-agent": providerUserAgent,
  };
  if (input.body !== undefined) {
    headers["content-type"] = "application/json";
  }

  try {
    const url = new URL(input.path, flexmailApiBaseUrl);
    for (const [key, value] of Object.entries(input.query ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    return await input.context.fetcher(url, {
      method: input.method,
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeoutHandle.signal,
    });
  } catch (error) {
    if (timeoutHandle.didTimeout()) {
      throw new ProviderRequestError(504, "Flexmail request timed out");
    }
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(502, error instanceof Error ? error.message : "Flexmail request failed");
  } finally {
    timeoutHandle.cleanup();
  }
}

async function assertFlexmailResponse(response: Response, phase: FlexmailRequestPhase) {
  if (response.ok) {
    return;
  }

  const payload = await readJsonResponse(response).catch(() => undefined);
  const record = optionalRecord(payload);
  const detail = optionalRawString(record?.detail);
  const title = optionalRawString(record?.title);
  const message = detail || title || `Flexmail request failed with HTTP ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    if (phase === "validate") {
      throw new ProviderRequestError(400, message);
    } else {
      throw new ProviderRequestError(response.status, message);
    }
  }

  throw new ProviderRequestError(response.status >= 400 && response.status < 500 ? response.status : 502, message);
}

async function readSuccessfulJsonResponse(response: Response) {
  try {
    return await readJsonResponse(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(502, error instanceof Error ? error.message : "Flexmail returned invalid JSON");
  }
}

async function readJsonResponse(response: Response) {
  const text = await readProviderTextBody(response, "Flexmail response", flexmailMaxResponseBytes);
  if (!text.trim()) {
    return {};
  }

  return JSON.parse(text) as unknown;
}

function readEmbeddedItems(record: Record<string, unknown>) {
  const embedded = optionalRecord(record._embedded);
  const items = embedded?.item;
  return Array.isArray(items) ? items : [];
}

function readCreatedId(location: string | undefined) {
  if (!location) {
    return undefined;
  }

  const segment = location.split("/").filter(Boolean).at(-1);
  if (!segment) {
    return undefined;
  }

  const numericId = Number(segment);
  return Number.isInteger(numericId) ? numericId : segment;
}

function pickQuery(input: Record<string, unknown>, keys: readonly string[]) {
  const query: Record<string, string | number | undefined> = {};
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" || typeof value === "number") {
      query[key] = value;
    }
  }
  return query;
}

function buildFlexmailAuthorization(accountId: string, personalAccessToken: string) {
  return `Basic ${Buffer.from(`${accountId}:${personalAccessToken}`, "utf8").toString("base64")}`;
}

function requireCredentialValue(input: Record<string, string>, fieldName: string) {
  const value = input[fieldName]?.trim();
  if (!value) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value;
}

function trimOptionalString(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new ProviderRequestError(400, "string value is required");
  }
  return value.trim();
}

function requireTrimmedString(value: unknown, fieldName: string): string {
  const trimmed = trimOptionalString(value);
  if (!trimmed) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return trimmed;
}

function readSupportedLanguage(value: unknown): string | undefined {
  const language = trimOptionalString(value);
  if (language === undefined) {
    return undefined;
  }
  if (!supportedLanguageSet.has(language)) {
    throw new ProviderRequestError(400, "language must be one of the Flexmail supported contact languages.");
  }
  return language;
}
