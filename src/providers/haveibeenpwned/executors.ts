import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalRecord,
  optionalString,
  rawStringOrNull,
  requiredString,
} from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  isAbortLikeError,
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
  requiredResponseRecord,
} from "../provider-runtime.ts";

const service = "haveibeenpwned";
const haveibeenpwnedApiBaseUrl = "https://haveibeenpwned.com/api/v3";
const haveibeenpwnedDefaultRequestTimeoutMs = 30_000;

type HaveIBeenPwnedRequestPhase = "validate" | "execute";
type HaveIBeenPwnedActionContext = ApiKeyProviderContext;
type HaveIBeenPwnedActionHandler = (
  input: Record<string, unknown>,
  context: HaveIBeenPwnedActionContext,
) => Promise<unknown>;

interface HaveIBeenPwnedSubscription {
  SubscriptionName: string;
  Description: string;
  SubscribedUntil: string;
  Rpm: number;
  DomainSearchMaxBreachedAccounts: number;
  MaxBreachedDomains: number | null;
  IncludesStealerLogs: boolean;
  IncludesBulkDomainAdd: boolean;
  IncludesAutoSubdomainVerification: boolean;
  IncludesCustomerDomains: boolean;
  IncludesKAnon: boolean;
}

export const haveibeenpwnedActionHandlers: ProviderActionHandlers<"haveibeenpwned", HaveIBeenPwnedActionHandler> = {
  list_breaches(input, context) {
    return executeListBreaches(input, context);
  },
  get_breach(input, context) {
    return executeGetBreach(input, context);
  },
  get_latest_breach(_input, context) {
    return executeGetLatestBreach(context);
  },
  list_data_classes(_input, context) {
    return executeListDataClasses(context);
  },
  search_breached_account(input, context) {
    return executeSearchBreachedAccount(input, context);
  },
  list_pastes_for_account(input, context) {
    return executeListPastesForAccount(input, context);
  },
  get_subscription_status(_input, context) {
    return executeGetSubscriptionStatus(context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, haveibeenpwnedActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const subscription = normalizeSubscription(
      await requestHaveIBeenPwnedJson({
        apiKey: input.apiKey,
        path: "/subscription/status",
        fetcher,
        signal,
        phase: "validate",
      }),
    );

    return {
      profile: {
        displayName: subscription.SubscriptionName,
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: haveibeenpwnedApiBaseUrl,
        validationEndpoint: "/subscription/status",
        subscriptionName: subscription.SubscriptionName,
        subscribedUntil: subscription.SubscribedUntil,
        rpm: subscription.Rpm,
        includesKAnon: subscription.IncludesKAnon,
        includesStealerLogs: subscription.IncludesStealerLogs,
      }),
    };
  },
};

async function executeListBreaches(
  input: Record<string, unknown>,
  context: HaveIBeenPwnedActionContext,
): Promise<unknown> {
  const payload = await requestHaveIBeenPwnedJson({
    ...context,
    path: "/breaches",
    query: compactObject({
      Domain: optionalString(input.domain),
      IsSpamList: stringifyOptionalBoolean(input.isSpamList),
    }),
    phase: "execute",
  });

  return {
    breaches: normalizeBreachArray(payload, "HIBP /breaches response"),
  };
}

async function executeGetBreach(
  input: Record<string, unknown>,
  context: HaveIBeenPwnedActionContext,
): Promise<unknown> {
  const name = requiredString(input.name, "name", providerInputError);
  const payload = await requestHaveIBeenPwnedJson({
    ...context,
    path: `/breach/${encodeURIComponent(name)}`,
    phase: "execute",
  });

  return {
    breach: normalizeBreach(payload, "HIBP /breach/{name} response"),
  };
}

async function executeGetLatestBreach(context: HaveIBeenPwnedActionContext): Promise<unknown> {
  const payload = await requestHaveIBeenPwnedJson({
    ...context,
    path: "/latestBreach",
    phase: "execute",
  });

  return {
    breach: normalizeBreach(payload, "HIBP /latestBreach response"),
  };
}

async function executeListDataClasses(context: HaveIBeenPwnedActionContext): Promise<unknown> {
  const payload = await requestHaveIBeenPwnedJson({
    ...context,
    path: "/dataClasses",
    phase: "execute",
  });

  return {
    dataClasses: requireStringArray(payload, "HIBP /dataClasses response"),
  };
}

async function executeSearchBreachedAccount(
  input: Record<string, unknown>,
  context: HaveIBeenPwnedActionContext,
): Promise<unknown> {
  const emailAddress = requiredString(input.emailAddress, "emailAddress", providerInputError);

  try {
    const payload = await requestHaveIBeenPwnedJson({
      ...context,
      path: `/breachedAccount/${encodeURIComponent(emailAddress)}`,
      query: compactObject({
        truncateResponse: "false",
        Domain: optionalString(input.domain),
        IncludeUnverified: stringifyOptionalBoolean(input.includeUnverified),
      }),
      phase: "execute",
    });

    return {
      breaches: normalizeBreachArray(payload, "HIBP /breachedAccount/{email} response"),
    };
  } catch (error) {
    if (error instanceof ProviderRequestError && error.status === 404) {
      return {
        breaches: [],
      };
    }
    throw error;
  }
}

async function executeListPastesForAccount(
  input: Record<string, unknown>,
  context: HaveIBeenPwnedActionContext,
): Promise<unknown> {
  const emailAddress = requiredString(input.emailAddress, "emailAddress", providerInputError);

  try {
    const payload = await requestHaveIBeenPwnedJson({
      ...context,
      path: `/pasteAccount/${encodeURIComponent(emailAddress)}`,
      phase: "execute",
    });

    return {
      pastes: normalizePasteArray(payload, "HIBP /pasteAccount/{email} response"),
    };
  } catch (error) {
    if (error instanceof ProviderRequestError && error.status === 404) {
      return {
        pastes: [],
      };
    }
    throw error;
  }
}

async function executeGetSubscriptionStatus(context: HaveIBeenPwnedActionContext): Promise<unknown> {
  const payload = await requestHaveIBeenPwnedJson({
    ...context,
    path: "/subscription/status",
    phase: "execute",
  });

  return {
    subscription: normalizeSubscription(payload),
  };
}

async function requestHaveIBeenPwnedJson(input: {
  apiKey: string;
  path: string;
  fetcher: typeof fetch;
  phase: HaveIBeenPwnedRequestPhase;
  signal?: AbortSignal;
  query?: Record<string, string | undefined>;
}): Promise<unknown> {
  const timeoutSignal = AbortSignal.timeout(haveibeenpwnedDefaultRequestTimeoutMs);
  const signal = input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;

  try {
    const response = await input.fetcher(buildHaveIBeenPwnedUrl(input.path, input.query ?? {}), {
      method: "GET",
      headers: {
        accept: "application/json",
        "hibp-api-key": input.apiKey,
        "user-agent": providerUserAgent,
      },
      signal,
    });
    const payload = await readHaveIBeenPwnedPayload(response);

    if (!response.ok) {
      throw createHaveIBeenPwnedError(response, payload, input.phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Have I Been Pwned request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `Have I Been Pwned request failed: ${error.message}`
        : "Have I Been Pwned request failed",
    );
  }
}

function buildHaveIBeenPwnedUrl(path: string, query: Record<string, string | undefined> = {}): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${haveibeenpwnedApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function readHaveIBeenPwnedPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createHaveIBeenPwnedError(
  response: Response,
  payload: unknown,
  phase: HaveIBeenPwnedRequestPhase,
): ProviderRequestError {
  const message =
    extractHaveIBeenPwnedErrorMessage(payload) ?? `Have I Been Pwned request failed with status ${response.status}`;

  if (response.status === 429) {
    const retryAfter = response.headers.get("retry-after")?.trim();
    return new ProviderRequestError(
      429,
      retryAfter ? `${message} Retry after ${retryAfter} seconds.` : message,
      payload,
    );
  }
  if (phase === "validate" && response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && response.status === 401) {
    return new ProviderRequestError(401, message, payload);
  }
  if (phase === "execute" && response.status === 400) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && response.status === 404) {
    return new ProviderRequestError(404, message, payload);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status || 502, message, payload);
}

function extractHaveIBeenPwnedErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  const message = optionalString(record?.message);
  if (message) {
    return message;
  }

  return optionalString(record?.error);
}

function normalizeBreachArray(value: unknown, label: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} must be an array`);
  }

  return value.map((item, index) => normalizeBreach(item, `${label}[${index}]`));
}

function normalizeBreach(value: unknown, label: string): Record<string, unknown> {
  const record = requiredResponseRecord(value, label);

  return {
    Name: requireString(record.Name, `${label}.Name`),
    Title: requireString(record.Title, `${label}.Title`),
    Domain: requireString(record.Domain, `${label}.Domain`),
    BreachDate: requireString(record.BreachDate, `${label}.BreachDate`),
    AddedDate: requireString(record.AddedDate, `${label}.AddedDate`),
    ModifiedDate: requireString(record.ModifiedDate, `${label}.ModifiedDate`),
    PwnCount: requireInteger(record.PwnCount, `${label}.PwnCount`),
    Description: requireString(record.Description, `${label}.Description`),
    DataClasses: requireStringArray(record.DataClasses, `${label}.DataClasses`),
    IsVerified: requireBoolean(record.IsVerified, `${label}.IsVerified`),
    IsFabricated: requireBoolean(record.IsFabricated, `${label}.IsFabricated`),
    IsSensitive: requireBoolean(record.IsSensitive, `${label}.IsSensitive`),
    IsRetired: requireBoolean(record.IsRetired, `${label}.IsRetired`),
    IsSpamList: requireBoolean(record.IsSpamList, `${label}.IsSpamList`),
    IsMalware: requireBoolean(record.IsMalware, `${label}.IsMalware`),
    IsSubscriptionFree: requireBoolean(record.IsSubscriptionFree, `${label}.IsSubscriptionFree`),
    IsStealerLog: requireBoolean(record.IsStealerLog, `${label}.IsStealerLog`),
    LogoPath: requireString(record.LogoPath, `${label}.LogoPath`),
    Attribution: rawStringOrNull(record.Attribution),
  };
}

function normalizePasteArray(value: unknown, label: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} must be an array`);
  }

  return value.map((item, index) => normalizePaste(item, `${label}[${index}]`));
}

function normalizePaste(value: unknown, label: string): Record<string, unknown> {
  const record = requiredResponseRecord(value, label);

  return {
    Source: requireString(record.Source, `${label}.Source`),
    Id: requireString(record.Id, `${label}.Id`),
    Title: rawStringOrNull(record.Title),
    Date: rawStringOrNull(record.Date),
    EmailCount: requireInteger(record.EmailCount, `${label}.EmailCount`),
  };
}

function normalizeSubscription(value: unknown): HaveIBeenPwnedSubscription {
  const record = requiredResponseRecord(value, "HIBP /subscription/status response");

  return {
    SubscriptionName: requireString(record.SubscriptionName, "subscription.SubscriptionName"),
    Description: requireString(record.Description, "subscription.Description"),
    SubscribedUntil: requireString(record.SubscribedUntil, "subscription.SubscribedUntil"),
    Rpm: requireInteger(record.Rpm, "subscription.Rpm"),
    DomainSearchMaxBreachedAccounts: requireInteger(
      record.DomainSearchMaxBreachedAccounts,
      "subscription.DomainSearchMaxBreachedAccounts",
    ),
    MaxBreachedDomains:
      record.MaxBreachedDomains == null
        ? null
        : requireInteger(record.MaxBreachedDomains, "subscription.MaxBreachedDomains"),
    IncludesStealerLogs: requireBoolean(record.IncludesStealerLogs, "subscription.IncludesStealerLogs"),
    IncludesBulkDomainAdd: requireBoolean(record.IncludesBulkDomainAdd, "subscription.IncludesBulkDomainAdd"),
    IncludesAutoSubdomainVerification: requireBoolean(
      record.IncludesAutoSubdomainVerification,
      "subscription.IncludesAutoSubdomainVerification",
    ),
    IncludesCustomerDomains: requireBoolean(record.IncludesCustomerDomains, "subscription.IncludesCustomerDomains"),
    IncludesKAnon: requireBoolean(record.IncludesKAnon, "subscription.IncludesKAnon"),
  };
}

function requireString(value: unknown, label: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(502, `${label} must be a non-empty string`);
  }
  return text;
}

function requireInteger(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new ProviderRequestError(502, `${label} must be a non-negative integer`);
  }
  return parsed;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(502, `${label} must be a boolean`);
  }
  return value;
}

function requireStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} must be an array`);
  }
  return value.map((item, index) => requireString(item, `${label}[${index}]`));
}

function stringifyOptionalBoolean(value: unknown): string | undefined {
  const parsed = optionalBoolean(value);
  return parsed === undefined ? undefined : String(parsed);
}
