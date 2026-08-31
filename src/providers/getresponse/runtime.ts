import type { CredentialValidationResult } from "../../core/types.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const getresponseRetailApiBaseUrl = "https://api.getresponse.com/v3";
export const getresponseMaxApiBaseUrls = [
  "https://api3.getresponse360.com/v3",
  "https://api3.getresponse360.pl/v3",
] as const;

const getresponseRequestTimeoutMs = 30_000;
const getresponseCredentialHelpUrl = "https://app.getresponse.com/api";

type GetresponseRequestPhase = "validate" | "execute";
type GetresponseQueryValue = string | number | boolean | undefined;
type GetresponseRequestResult = {
  payload: unknown;
  headers: Headers;
  status: number;
};

interface GetresponseInput {
  apiKey: string;
  providerMetadata: Record<string, unknown>;
  input: Record<string, unknown>;
  actionName?: string;
}
type GetresponseActionHandler = (input: GetresponseInput, fetcher: typeof fetch) => Promise<unknown>;

export const getresponseActionHandlers: Record<string, GetresponseActionHandler> = {
  list_campaigns(input, fetcher) {
    return listCampaigns(input, fetcher);
  },
  get_campaign(input, fetcher) {
    return getCampaign(input, fetcher);
  },
  create_campaign(input, fetcher) {
    return createCampaign(input, fetcher);
  },
  update_campaign(input, fetcher) {
    return updateCampaign(input, fetcher);
  },
  list_contacts(input, fetcher) {
    return listContacts(input, fetcher);
  },
  get_contact(input, fetcher) {
    return getContact(input, fetcher);
  },
  create_contact(input, fetcher) {
    return createContact(input, fetcher);
  },
  update_contact(input, fetcher) {
    return updateContact(input, fetcher);
  },
  delete_contact(input, fetcher) {
    return deleteContact(input, fetcher);
  },
  list_newsletters(input, fetcher) {
    return listNewsletters(input, fetcher);
  },
  get_newsletter(input, fetcher) {
    return getNewsletter(input, fetcher);
  },
  get_newsletter_statistics(input, fetcher) {
    return getNewsletterStatistics(input, fetcher);
  },
  list_custom_fields(input, fetcher) {
    return listCustomFields(input, fetcher);
  },
  list_tags(input, fetcher) {
    return listTags(input, fetcher);
  },
} satisfies Record<string, GetresponseActionHandler>;

export async function validateGetresponseCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const apiKey = input.apiKey?.trim();
  if (!apiKey) throw new ProviderRequestError(400, "apiKey is required", undefined, "invalid_input");
  const connection = normalizeGetresponseConnection(input);
  const { payload } = await requestGetresponseJson({
    apiKey,
    connection,
    path: "/accounts",
    fetcher,
    phase: "validate",
  });
  const account = requireRecord(payload, "GetResponse account");
  const accountId = requireString(account.accountId, "account.accountId");
  const accountEmail = optionalString(account.email);
  const companyName = optionalString(account.companyName);

  return {
    profile: { accountId, displayName: companyName ?? accountEmail ?? `GetResponse ${accountId}` },
    metadata: compactObject({
      apiBaseUrl: connection.apiBaseUrl,
      accountId,
      accountType: connection.domain ? "max" : "retail",
      domain: connection.domain,
      parentLogin: connection.parentLogin,
      credentialHelpUrl: getresponseCredentialHelpUrl,
    }),
  };
}

function listCampaigns(input: GetresponseInput, fetcher: typeof fetch) {
  return requestList(input, fetcher, {
    path: "/campaigns",
    query: compactObject({
      "query[name]": optionalInputString(input.input.name),
      "query[isDefault]": optionalInputBoolean(input.input.isDefault),
      ...buildSortQuery(input.input),
      ...buildPageQuery(input.input),
    }),
    collectionName: "campaigns",
    normalize: normalizeCampaign,
  });
}

async function getCampaign(input: GetresponseInput, fetcher: typeof fetch) {
  const campaignId = requireInputString(input.input.campaignId, "campaignId");
  const { payload } = await requestForAction(input, fetcher, {
    path: `/campaigns/${encodeURIComponent(campaignId)}`,
  });
  return { campaign: normalizeCampaign(payload) };
}

async function createCampaign(input: GetresponseInput, fetcher: typeof fetch) {
  const { payload } = await requestForAction(input, fetcher, {
    path: "/campaigns",
    method: "POST",
    body: buildCampaignBody(input.input),
  });
  return { campaign: normalizeCampaign(payload) };
}

async function updateCampaign(input: GetresponseInput, fetcher: typeof fetch) {
  const campaignId = requireInputString(input.input.campaignId, "campaignId");
  const { payload } = await requestForAction(input, fetcher, {
    path: `/campaigns/${encodeURIComponent(campaignId)}`,
    method: "POST",
    body: buildCampaignBody(input.input),
  });
  return { campaign: normalizeCampaign(payload) };
}

function listContacts(input: GetresponseInput, fetcher: typeof fetch) {
  return requestList(input, fetcher, {
    path: "/contacts",
    query: compactObject({
      "query[email]": optionalInputString(input.input.email),
      "query[name]": optionalInputString(input.input.name),
      "query[campaignId]": optionalInputString(input.input.campaignId),
      "query[createdOn][from]": optionalInputString(input.input.createdFrom),
      "query[createdOn][to]": optionalInputString(input.input.createdTo),
      "query[changedOn][from]": optionalInputString(input.input.changedFrom),
      "query[changedOn][to]": optionalInputString(input.input.changedTo),
      additionalFlags: input.input.exactMatch === true ? "exactMatch" : undefined,
      ...buildSortQuery(input.input),
      ...buildPageQuery(input.input),
    }),
    collectionName: "contacts",
    normalize: normalizeContact,
  });
}

async function getContact(input: GetresponseInput, fetcher: typeof fetch) {
  const contactId = requireInputString(input.input.contactId, "contactId");
  const { payload } = await requestForAction(input, fetcher, {
    path: `/contacts/${encodeURIComponent(contactId)}`,
  });
  return { contact: normalizeContact(payload) };
}

async function createContact(input: GetresponseInput, fetcher: typeof fetch) {
  await requestForAction(input, fetcher, {
    path: "/contacts",
    method: "POST",
    body: buildContactBody(input.input, true),
  });
  return { accepted: true };
}

async function updateContact(input: GetresponseInput, fetcher: typeof fetch) {
  const contactId = requireInputString(input.input.contactId, "contactId");
  const { payload } = await requestForAction(input, fetcher, {
    path: `/contacts/${encodeURIComponent(contactId)}`,
    method: "POST",
    body: buildContactBody(input.input, false),
  });
  return { contact: normalizeContact(payload) };
}

async function deleteContact(input: GetresponseInput, fetcher: typeof fetch) {
  const contactId = requireInputString(input.input.contactId, "contactId");
  await requestForAction(input, fetcher, {
    path: `/contacts/${encodeURIComponent(contactId)}`,
    method: "DELETE",
  });
  return { deleted: true, contactId };
}

function listNewsletters(input: GetresponseInput, fetcher: typeof fetch) {
  return requestList(input, fetcher, {
    path: "/newsletters",
    query: compactObject({
      "query[name]": optionalInputString(input.input.name),
      "query[subject]": optionalInputString(input.input.subject),
      "query[status]": optionalInputString(input.input.status),
      "query[type]": optionalInputString(input.input.type),
      "query[campaignId]": optionalInputString(input.input.campaignId),
      "query[createdOn][from]": optionalInputString(input.input.createdFrom),
      "query[createdOn][to]": optionalInputString(input.input.createdTo),
      "query[sendOn][from]": optionalInputString(input.input.sentFrom),
      "query[sendOn][to]": optionalInputString(input.input.sentTo),
      ...buildSortQuery(input.input),
      ...buildPageQuery(input.input),
    }),
    collectionName: "newsletters",
    normalize: normalizeNewsletter,
  });
}

async function getNewsletter(input: GetresponseInput, fetcher: typeof fetch) {
  const newsletterId = requireInputString(input.input.newsletterId, "newsletterId");
  const { payload } = await requestForAction(input, fetcher, {
    path: `/newsletters/${encodeURIComponent(newsletterId)}`,
  });
  return { newsletter: normalizeNewsletter(payload) };
}

async function getNewsletterStatistics(input: GetresponseInput, fetcher: typeof fetch) {
  const newsletterId = requireInputString(input.input.newsletterId, "newsletterId");
  const { payload, headers } = await requestForAction(input, fetcher, {
    path: `/newsletters/${encodeURIComponent(newsletterId)}/statistics`,
    query: compactObject({
      "query[groupBy]": optionalInputString(input.input.groupBy),
      "query[createdOn][from]": optionalInputString(input.input.createdFrom),
      "query[createdOn][to]": optionalInputString(input.input.createdTo),
      ...buildPageQuery(input.input),
    }),
  });
  return {
    statistics: requireArray(payload, "GetResponse newsletter statistics").map(normalizeNewsletterStatistic),
    pagination: readPagination(headers),
  };
}

function listCustomFields(input: GetresponseInput, fetcher: typeof fetch) {
  return requestList(input, fetcher, {
    path: "/custom-fields",
    query: compactObject({
      "query[name]": optionalInputString(input.input.name),
      ...(input.input.sortOrder ? { "sort[name]": optionalInputString(input.input.sortOrder) } : {}),
      ...buildPageQuery(input.input),
    }),
    collectionName: "customFields",
    normalize: normalizeCustomField,
  });
}

function listTags(input: GetresponseInput, fetcher: typeof fetch) {
  return requestList(input, fetcher, {
    path: "/tags",
    query: compactObject({
      "query[name]": optionalInputString(input.input.name),
      "query[createdAt][from]": optionalInputString(input.input.createdFrom),
      "query[createdAt][to]": optionalInputString(input.input.createdTo),
      ...buildSortQuery(input.input),
      ...buildPageQuery(input.input),
    }),
    collectionName: "tags",
    normalize: normalizeTag,
  });
}

async function requestList<T>(
  input: GetresponseInput,
  fetcher: typeof fetch,
  options: {
    path: string;
    query: Record<string, GetresponseQueryValue>;
    collectionName: string;
    normalize(value: unknown): T;
  },
) {
  const { payload, headers } = await requestForAction(input, fetcher, {
    path: options.path,
    query: options.query,
  });
  return {
    [options.collectionName]: requireArray(payload, `GetResponse ${options.collectionName}`).map(options.normalize),
    pagination: readPagination(headers),
  };
}

function requestForAction(
  input: GetresponseInput,
  fetcher: typeof fetch,
  request: {
    path: string;
    method?: "GET" | "POST" | "DELETE";
    query?: Record<string, GetresponseQueryValue>;
    body?: Record<string, unknown>;
  },
) {
  return requestGetresponseJson({
    apiKey: input.apiKey,
    connection: readStoredConnection(input.providerMetadata),
    fetcher,
    phase: "execute",
    ...request,
  });
}

async function requestGetresponseJson(input: {
  apiKey: string;
  connection: GetresponseConnection;
  path: string;
  fetcher: typeof fetch;
  phase: GetresponseRequestPhase;
  method?: "GET" | "POST" | "DELETE";
  query?: Record<string, GetresponseQueryValue>;
  body?: Record<string, unknown>;
}): Promise<GetresponseRequestResult> {
  const timeout = createProviderTimeout(undefined, getresponseRequestTimeoutMs);
  const url = buildGetresponseUrl(input.connection.apiBaseUrl, input.path, input.query);
  const method = input.method ?? "GET";
  const headers = new Headers({
    accept: "application/json",
    "user-agent": providerUserAgent,
    "x-auth-token": `api-key ${input.apiKey}`,
  });
  if (input.body) headers.set("content-type", "application/json");
  if (input.connection.domain) headers.set("x-domain", input.connection.domain);
  if (input.connection.parentLogin) {
    headers.set("x-parent-login", input.connection.parentLogin);
  }

  try {
    const response = await input.fetcher(url, {
      method,
      headers,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readGetresponsePayload(response);
    if (!response.ok) {
      throw createGetresponseError(response.status, payload, input.phase);
    }
    return { payload, headers: response.headers, status: response.status };
  } catch (error) {
    if (error instanceof ProviderRequestError && error.code !== undefined) throw error;
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "GetResponse request timed out", undefined, "provider_error");
    }
    throw new ProviderRequestError(502, "GetResponse request failed", undefined, "provider_error");
  } finally {
    timeout.cleanup();
  }
}

type GetresponseConnection = {
  apiBaseUrl: string;
  domain?: string;
  parentLogin?: string;
};

function normalizeGetresponseConnection(input: Record<string, string>): GetresponseConnection {
  const maxApiBaseUrl = optionalTrimmed(input.maxApiBaseUrl);
  const domain = optionalTrimmed(input.domain);
  const parentLogin = optionalTrimmed(input.parentLogin);

  if (Boolean(maxApiBaseUrl) !== Boolean(domain)) {
    throw new ProviderRequestError(
      400,
      "maxApiBaseUrl and domain must be provided together for GetResponse MAX",
      undefined,
      "invalid_input",
    );
  }

  return {
    apiBaseUrl: maxApiBaseUrl ? normalizeMaxApiBaseUrl(maxApiBaseUrl) : getresponseRetailApiBaseUrl,
    domain: domain ? normalizeGetresponseDomain(domain) : undefined,
    parentLogin,
  };
}

function readStoredConnection(providerMetadata: Record<string, unknown> | undefined): GetresponseConnection {
  const apiBaseUrl = optionalString(providerMetadata?.apiBaseUrl);
  if (!apiBaseUrl) {
    throw new ProviderRequestError(
      500,
      "getresponse connection is missing apiBaseUrl metadata",
      undefined,
      "provider_error",
    );
  }
  try {
    const normalizedApiBaseUrl =
      apiBaseUrl === getresponseRetailApiBaseUrl ? apiBaseUrl : normalizeMaxApiBaseUrl(apiBaseUrl);
    const domain = optionalString(providerMetadata?.domain);
    if (normalizedApiBaseUrl !== getresponseRetailApiBaseUrl && !domain) {
      throw new ProviderRequestError(
        500,
        "getresponse MAX connection is missing domain metadata",
        undefined,
        "provider_error",
      );
    }
    return {
      apiBaseUrl: normalizedApiBaseUrl,
      domain: domain ? normalizeGetresponseDomain(domain) : undefined,
      parentLogin: optionalString(providerMetadata?.parentLogin),
    };
  } catch (error) {
    if (error instanceof ProviderRequestError && error.code === "invalid_input") {
      throw new ProviderRequestError(500, "getresponse connection metadata is invalid", undefined, "provider_error");
    }
    throw error;
  }
}

function normalizeMaxApiBaseUrl(value: string) {
  let normalized = value.trim();
  while (normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  if (!getresponseMaxApiBaseUrls.includes(normalized as (typeof getresponseMaxApiBaseUrls)[number])) {
    throw new ProviderRequestError(
      400,
      `maxApiBaseUrl must be ${getresponseMaxApiBaseUrls.join(" or ")}`,
      undefined,
      "invalid_input",
    );
  }
  return normalized;
}

function normalizeGetresponseDomain(value: string) {
  const normalized = value.trim().toLowerCase();
  if (
    !normalized ||
    normalized.includes(":") ||
    normalized.includes("/") ||
    normalized.includes("?") ||
    normalized.includes("#") ||
    !normalized.includes(".")
  ) {
    throw new ProviderRequestError(
      400,
      "domain must contain only the GetResponse MAX account domain",
      undefined,
      "invalid_input",
    );
  }
  return normalized;
}

function buildCampaignBody(input: Record<string, unknown>) {
  return compactObject({
    name: optionalInputString(input.name),
    languageCode: optionalInputString(input.languageCode),
    optinTypes: input.apiOptIn ? { api: optionalInputString(input.apiOptIn) } : undefined,
  });
}

function buildContactBody(input: Record<string, unknown>, requireIdentity: boolean) {
  const email = optionalInputString(input.email);
  const campaignId = optionalInputString(input.campaignId);
  if (requireIdentity && (!email || !campaignId)) {
    throw new ProviderRequestError(400, "email and campaignId are required", undefined, "invalid_input");
  }
  return compactObject({
    email,
    name: optionalInputString(input.name),
    campaign: campaignId ? { campaignId } : undefined,
    ipAddress: requireIdentity ? optionalInputString(input.ipAddress) : undefined,
    dayOfCycle: optionalNullableString(input.dayOfCycle),
    scoring: optionalNullableNumber(input.scoring),
    note: requireIdentity ? undefined : optionalNullableText(input.note),
    tags: mapContactTags(input.tags),
    customFieldValues: mapContactCustomFields(input.customFields),
  });
}

function mapContactTags(value: unknown) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "tags must be an array", undefined, "invalid_input");
  }
  return value.map((item) => {
    const record = requireInputRecord(item, "contact tag");
    return { tagId: requireInputString(record.tagId, "tagId") };
  });
}

function mapContactCustomFields(value: unknown) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "customFields must be an array", undefined, "invalid_input");
  }
  return value.map((item) => {
    const record = requireInputRecord(item, "contact custom field");
    const values = requireInputArray(record.values, "custom field values").map((entry) =>
      requireInputText(entry, "custom field value"),
    );
    return {
      customFieldId: requireInputString(record.customFieldId, "customFieldId"),
      value: values,
    };
  });
}

function buildSortQuery(input: Record<string, unknown>) {
  const sortBy = optionalInputString(input.sortBy);
  const sortOrder = optionalInputString(input.sortOrder);
  return sortBy && sortOrder ? { [`sort[${sortBy}]`]: sortOrder } : {};
}

function buildPageQuery(input: Record<string, unknown>) {
  return compactObject({
    page: optionalInputInteger(input.page),
    perPage: optionalInputInteger(input.perPage),
  });
}

function buildGetresponseUrl(apiBaseUrl: string, path: string, query?: Record<string, GetresponseQueryValue>) {
  const url = new URL(`${apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function normalizeCampaign(value: unknown) {
  const campaign = requireRecord(value, "GetResponse campaign");
  return {
    campaignId: requireString(campaign.campaignId, "campaign.campaignId"),
    name: requireString(campaign.name, "campaign.name"),
    languageCode: optionalString(campaign.languageCode) ?? null,
    isDefault: optionalBooleanLike(campaign.isDefault),
    createdOn: optionalString(campaign.createdOn) ?? null,
    raw: campaign,
  };
}

function normalizeCampaignReference(value: unknown) {
  const campaign = optionalRecord(value);
  if (!campaign) return null;
  return {
    campaignId: requireString(campaign.campaignId, "campaign.campaignId"),
    name: optionalString(campaign.name) ?? null,
  };
}

function normalizeContact(value: unknown) {
  const contact = requireRecord(value, "GetResponse contact");
  return {
    contactId: requireString(contact.contactId, "contact.contactId"),
    email: requireString(contact.email, "contact.email"),
    name: optionalString(contact.name) ?? null,
    campaign: normalizeCampaignReference(contact.campaign),
    origin: optionalString(contact.origin) ?? null,
    createdOn: optionalString(contact.createdOn) ?? null,
    changedOn: optionalString(contact.changedOn) ?? null,
    raw: contact,
  };
}

function normalizeNewsletter(value: unknown) {
  const newsletter = requireRecord(value, "GetResponse newsletter");
  return {
    newsletterId: requireString(newsletter.newsletterId, "newsletter.newsletterId"),
    name: optionalString(newsletter.name) ?? null,
    subject: optionalString(newsletter.subject) ?? null,
    type: optionalString(newsletter.type) ?? null,
    status: optionalString(newsletter.status) ?? null,
    campaign: normalizeCampaignReference(newsletter.campaign),
    sendOn: optionalString(newsletter.sendOn) ?? null,
    createdOn: optionalString(newsletter.createdOn) ?? null,
    raw: redactNewsletterSecrets(newsletter),
  };
}

function redactNewsletterSecrets(newsletter: Record<string, unknown>) {
  const sendSettings = optionalRecord(newsletter.sendSettings);
  const externalLexpad = optionalRecord(sendSettings?.externalLexpad);
  if (!sendSettings || !externalLexpad || !Object.hasOwn(externalLexpad, "dataSourceToken")) {
    return newsletter;
  }
  const safeExternalLexpad = { ...externalLexpad };
  delete safeExternalLexpad.dataSourceToken;
  return {
    ...newsletter,
    sendSettings: {
      ...sendSettings,
      externalLexpad: safeExternalLexpad,
    },
  };
}

function normalizeNewsletterStatistic(value: unknown) {
  const statistic = requireRecord(value, "GetResponse newsletter statistics row");
  return {
    timeInterval: optionalString(statistic.timeInterval) ?? null,
    sent: optionalResponseInteger(statistic.sent, "statistics.sent") ?? null,
    totalOpened: optionalResponseInteger(statistic.totalOpened, "statistics.totalOpened") ?? null,
    totalHumanOpened: optionalResponseInteger(statistic.totalHumanOpened, "statistics.totalHumanOpened") ?? null,
    uniqueOpened: optionalResponseInteger(statistic.uniqueOpened, "statistics.uniqueOpened") ?? null,
    uniqueHumanOpened: optionalResponseInteger(statistic.uniqueHumanOpened, "statistics.uniqueHumanOpened") ?? null,
    totalClicked: optionalResponseInteger(statistic.totalClicked, "statistics.totalClicked") ?? null,
    totalHumanClicked: optionalResponseInteger(statistic.totalHumanClicked, "statistics.totalHumanClicked") ?? null,
    uniqueClicked: optionalResponseInteger(statistic.uniqueClicked, "statistics.uniqueClicked") ?? null,
    uniqueHumanClicked: optionalResponseInteger(statistic.uniqueHumanClicked, "statistics.uniqueHumanClicked") ?? null,
    goals: optionalResponseInteger(statistic.goals, "statistics.goals") ?? null,
    uniqueGoals: optionalResponseInteger(statistic.uniqueGoals, "statistics.uniqueGoals") ?? null,
    forwarded: optionalResponseInteger(statistic.forwarded, "statistics.forwarded") ?? null,
    unsubscribed: optionalResponseInteger(statistic.unsubscribed, "statistics.unsubscribed") ?? null,
    bounced: optionalResponseInteger(statistic.bounced, "statistics.bounced") ?? null,
    complaints: optionalResponseInteger(statistic.complaints, "statistics.complaints") ?? null,
    raw: statistic,
  };
}

function normalizeCustomField(value: unknown) {
  const customField = requireRecord(value, "GetResponse custom field");
  return {
    customFieldId: requireString(customField.customFieldId, "customField.customFieldId"),
    name: requireString(customField.name, "customField.name"),
    type: optionalString(customField.type) ?? null,
    format: optionalString(customField.format) ?? null,
    raw: customField,
  };
}

function normalizeTag(value: unknown) {
  const tag = requireRecord(value, "GetResponse tag");
  return {
    tagId: requireString(tag.tagId, "tag.tagId"),
    name: requireString(tag.name, "tag.name"),
    createdAt: optionalString(tag.createdAt) ?? null,
    raw: tag,
  };
}

function readPagination(headers: Headers) {
  return {
    currentPage: readHeaderInteger(headers, "CurrentPage"),
    totalPages: readHeaderInteger(headers, "TotalPages"),
    totalCount: readHeaderInteger(headers, "TotalCount"),
  };
}

function readHeaderInteger(headers: Headers, name: string) {
  const value = headers.get(name);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

async function readGetresponsePayload(response: Response) {
  if (response.status === 202 || response.status === 204) return null;
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "GetResponse returned invalid JSON", undefined, "provider_error");
  }
}

function createGetresponseError(status: number, payload: unknown, phase: GetresponseRequestPhase) {
  const message = readGetresponseErrorMessage(payload) ?? `GetResponse request failed (${status})`;
  const providerCode = readGetresponseErrorCode(payload);
  if (status === 401 || (status === 403 && providerCode === 1014)) {
    return new ProviderRequestError(
      phase === "validate" ? 400 : status,
      phase === "validate" ? `GetResponse credential validation failed: ${message}` : message,
      undefined,
      phase === "validate" ? "invalid_input" : "credential_expired",
    );
  }
  if (status === 429) return new ProviderRequestError(429, message, undefined, "rate_limited");
  if (providerCode === 1016) return new ProviderRequestError(429, message, undefined, "rate_limited");
  if (providerCode === 1017 || providerCode === 1018) {
    return new ProviderRequestError(502, message, undefined, "provider_error");
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(
      400,
      `GetResponse credential validation failed: ${message}`,
      undefined,
      "invalid_input",
    );
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, undefined, "invalid_input");
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message, undefined, "provider_error");
}

function readGetresponseErrorMessage(payload: unknown) {
  const record = optionalRecord(payload);
  return optionalString(record?.message) ?? optionalString(record?.codeDescription) ?? optionalString(record?.error);
}

function readGetresponseErrorCode(payload: unknown) {
  const value = optionalRecord(payload)?.code;
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function requireRecord(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${fieldName} is invalid`, undefined, "provider_error");
  }
  return record;
}

function requireArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${fieldName} is invalid`, undefined, "provider_error");
  }
  return value;
}

function requireString(value: unknown, fieldName: string) {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(502, `${fieldName} is missing`, undefined, "provider_error");
  }
  return text;
}

function requireInputString(value: unknown, fieldName: string) {
  const text = optionalInputString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`, undefined, "invalid_input");
  }
  return text;
}

function requireInputRecord(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(400, `${fieldName} must be an object`, undefined, "invalid_input");
  }
  return record;
}

function requireInputArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array`, undefined, "invalid_input");
  }
  return value;
}

function requireInputText(value: unknown, fieldName: string) {
  if (typeof value !== "string") {
    throw new ProviderRequestError(400, `${fieldName} must be a string`, undefined, "invalid_input");
  }
  return value;
}

function optionalTrimmed(value: string | undefined) {
  return value?.trim() || undefined;
}

function optionalInputString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalInputBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function optionalInputInteger(value: unknown) {
  return optionalInteger(value);
}

function optionalResponseInteger(value: unknown, fieldName: string) {
  if (value == null) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(502, `${fieldName} is invalid`, undefined, "provider_error");
  }
  return value;
}

function optionalNullableString(value: unknown) {
  if (value === null) return null;
  return optionalInputString(value);
}

function optionalNullableText(value: unknown) {
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
}

function optionalNullableNumber(value: unknown) {
  if (value === null) return null;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalBooleanLike(value: unknown) {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}
