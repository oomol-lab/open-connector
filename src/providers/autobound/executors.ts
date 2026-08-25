import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
  setSearchParams,
} from "../provider-runtime.ts";

const service = "autobound";
const autoboundApiBaseUrl = "https://signals.autobound.ai";

type AutoboundRequestPhase = "validate" | "execute";
type QueryValue = string | number | boolean | undefined;
type AutoboundActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface AutoboundRequestInput {
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  path: string;
  method?: "GET" | "POST";
  query?: Record<string, QueryValue>;
  body?: Record<string, unknown>;
  phase: AutoboundRequestPhase;
}

export const autoboundActionHandlers: ProviderActionHandlers<"autobound", AutoboundActionHandler> = {
  async get_account(_input, context) {
    const payload = await requestAutoboundJson({
      context,
      path: "/v1/account",
      phase: "execute",
    });

    return {
      account: normalizeAccount(payload),
    };
  },

  async list_signal_types(input, context) {
    const payload = await requestAutoboundJson({
      context,
      path: "/v1/signals/types",
      query: {
        include_counts: optionalBoolean(input.includeCounts),
        association: optionalString(input.association),
        since: optionalString(input.since),
      },
      phase: "execute",
    });

    return normalizeSignalTypesResponse(payload);
  },

  async enrich_company(input, context) {
    const identifier = readCompanyIdentifier(input);
    const payload = await requestAutoboundJson({
      context,
      path: "/v1/companies/enrich",
      method: "POST",
      body: compactObject({
        domain: identifier.domain,
        company_name: identifier.companyName,
        linkedin_url: identifier.linkedinUrl,
        signal_types: readOptionalSignalTypes(input.signalTypes),
        detected_after: optionalString(input.detectedAfter),
        limit: optionalInteger(input.limit),
      }),
      phase: "execute",
    });

    return {
      company: normalizeCompany(optionalRecord(payload.company)),
      signals: readSignalArray(payload.signals),
      signalSummary: normalizeSignalSummary(payload.signal_summary),
      coverage: optionalRecord(payload.coverage) ?? null,
    };
  },

  async search_companies(input, context) {
    const requestedOffset = optionalInteger(input.offset) ?? 0;
    const requestedLimit = optionalInteger(input.limit) ?? 20;
    const payload = await requestAutoboundJson({
      context,
      path: "/v1/companies/search",
      method: "POST",
      body: compactObject({
        signal_types: readRequiredSignalTypes(input.signalTypes),
        signal_subtype: optionalString(input.signalSubtype),
        detected_after: optionalString(input.detectedAfter),
        detected_before: optionalString(input.detectedBefore),
        limit: optionalInteger(input.limit),
        offset: optionalInteger(input.offset),
        signals_per_entity: optionalInteger(input.signalsPerEntity),
      }),
      phase: "execute",
    });

    return {
      companies: readCompanySearchResults(payload.companies),
      offset: optionalInteger(payload.offset) ?? requestedOffset,
      limit: optionalInteger(payload.limit) ?? requestedLimit,
      hasMore: optionalBoolean(payload.has_more) ?? false,
    };
  },

  async enrich_contact(input, context) {
    const identifier = readContactIdentifier(input);
    const payload = await requestAutoboundJson({
      context,
      path: "/v1/contacts/enrich",
      method: "POST",
      body: compactObject({
        contact_email: identifier.contactEmail,
        contact_linkedin_url: identifier.contactLinkedinUrl,
        signal_types: readOptionalSignalTypes(input.signalTypes),
        detected_after: optionalString(input.detectedAfter),
        limit: optionalInteger(input.limit),
      }),
      phase: "execute",
    });

    return {
      contact: normalizeContact(optionalRecord(payload.contact)),
      company: normalizeCompany(optionalRecord(payload.company)),
      contactSignals: readSignalArray(payload.contact_signals),
      signalSummary: normalizeSignalSummary(payload.signal_summary),
      total: optionalInteger(payload.total) ?? null,
      coverage: optionalRecord(payload.coverage) ?? null,
    };
  },

  async search_contacts(input, context) {
    const requestedOffset = optionalInteger(input.offset) ?? 0;
    const requestedLimit = optionalInteger(input.limit) ?? 20;
    const payload = await requestAutoboundJson({
      context,
      path: "/v1/contacts/search",
      method: "POST",
      body: compactObject({
        signal_types: readRequiredSignalTypes(input.signalTypes),
        signal_subtype: optionalString(input.signalSubtype),
        detected_after: optionalString(input.detectedAfter),
        detected_before: optionalString(input.detectedBefore),
        limit: optionalInteger(input.limit),
        offset: optionalInteger(input.offset),
        signals_per_entity: optionalInteger(input.signalsPerEntity),
      }),
      phase: "execute",
    });

    return {
      contacts: readContactSearchResults(payload.contacts),
      offset: optionalInteger(payload.offset) ?? requestedOffset,
      limit: optionalInteger(payload.limit) ?? requestedLimit,
      hasMore: optionalBoolean(payload.has_more) ?? false,
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<ApiKeyProviderContext>({
  service,
  handlers: autoboundActionHandlers,
  async createContext(context, fetcher): Promise<ApiKeyProviderContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
      transitFiles: context.transitFiles,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestAutoboundJson({
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      path: "/v1/account",
      phase: "validate",
    });
    const account = normalizeAccount(payload);

    return {
      profile: {
        accountId: optionalString(account.customerId),
        displayName:
          optionalString(account.customerName) ?? optionalString(account.customerId) ?? "Autobound Signal API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: autoboundApiBaseUrl,
        validationEndpoint: "/v1/account",
        customerId: optionalString(account.customerId),
        customerName: optionalString(account.customerName),
        rateLimit: optionalInteger(account.rateLimit),
        creditBalance: optionalInteger(account.creditBalance),
      }),
    };
  },
};

async function requestAutoboundJson(input: AutoboundRequestInput): Promise<Record<string, unknown>> {
  const url = new URL(input.path, autoboundApiBaseUrl);
  setSearchParams(url, stringifyQuery(input.query ?? {}));

  let response: Response;
  try {
    response = await input.context.fetcher(url, {
      method: input.method ?? "GET",
      headers: compactObject({
        accept: "application/json",
        "content-type": input.body ? "application/json" : undefined,
        "user-agent": providerUserAgent,
        "x-api-key": input.context.apiKey,
      }) as Record<string, string>,
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      isAbortError(error) ? 504 : 502,
      error instanceof Error ? `Autobound request failed: ${error.message}` : "Autobound request failed",
    );
  }

  const payload = await readAutoboundPayload(response);
  if (!response.ok) {
    throw buildAutoboundError(response.status, payload, input.phase);
  }

  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "Autobound returned a non-object JSON response");
  }

  return record;
}

async function readAutoboundPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Autobound returned invalid JSON");
  }
}

function buildAutoboundError(status: number, payload: unknown, phase: AutoboundRequestPhase): ProviderRequestError {
  const message = readAutoboundMessage(payload) ?? `Autobound request failed with status ${status || 500}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message, payload);
  }
  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function readAutoboundMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return (
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.detail) ??
    optionalString(record.title)
  );
}

function normalizeAccount(payload: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    customerId: optionalString(payload.customer_id),
    customerName: optionalString(payload.customer_name),
    rateLimit: optionalInteger(payload.rate_limit),
    creditBalance: optionalInteger(payload.credit_balance),
    raw: payload,
  });
}

function normalizeCompany(payload: Record<string, unknown> | undefined | null): Record<string, unknown> | null {
  if (!payload) {
    return null;
  }

  return compactObject({
    name: optionalString(payload.name),
    domain: optionalString(payload.domain),
    linkedinUrl: optionalString(payload.linkedin_url) ?? optionalString(payload.linkedinUrl),
    raw: payload,
  });
}

function normalizeContact(payload: Record<string, unknown> | undefined | null): Record<string, unknown> | null {
  if (!payload) {
    return null;
  }

  const company = optionalRecord(payload.company);
  return compactObject({
    email: optionalString(payload.email),
    linkedinUrl: optionalString(payload.linkedin_url) ?? optionalString(payload.linkedinUrl),
    name: optionalString(payload.name),
    title: optionalString(payload.title),
    ...(company ? { company: normalizeCompany(company) } : {}),
    raw: payload,
  });
}

function normalizeSignal(payload: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    signalId: optionalString(payload.signal_id),
    signalType: optionalString(payload.signal_type),
    signalSubtype: optionalString(payload.signal_subtype),
    signalName: optionalString(payload.signal_name),
    detectedAt: optionalString(payload.detected_at),
    association: optionalString(payload.association),
    company: normalizeCompany(optionalRecord(payload.company)),
    contact: normalizeContact(optionalRecord(payload.contact)),
    data: optionalRecord(payload.data) ?? {},
    raw: payload,
  });
}

function normalizeSignalSummary(payload: unknown): Record<string, unknown> | null {
  const record = optionalRecord(payload);
  if (!record) {
    return null;
  }

  return compactObject({
    total: optionalInteger(record.total),
    byType: readIntegerRecord(record.by_type),
  });
}

function normalizeSignalTypesResponse(payload: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    signalTypes: readSignalTypeEntries(payload.signal_types),
    totalSignals: optionalInteger(payload.total_signals),
    countedAt: optionalString(payload.counted_at),
  });
}

function readSignalTypeEntries(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeSignalTypeEntry(item))
    .filter((entry): entry is Record<string, unknown> => !!entry);
}

function normalizeSignalTypeEntry(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    const type = value.trim();
    return type ? { type } : null;
  }

  const record = optionalRecord(value);
  if (!record) {
    return null;
  }

  const type = optionalString(record.type);
  if (!type) {
    return null;
  }

  return compactObject({
    type,
    association: optionalString(record.association),
    description: optionalString(record.description),
    count: optionalInteger(record.count),
    refreshCadence: optionalString(record.refresh_cadence),
    refreshHours: optionalInteger(record.refresh_hours),
  });
}

function readSignalArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => optionalRecord(item))
    .filter((item): item is Record<string, unknown> => item !== undefined)
    .map((item) => normalizeSignal(item));
}

function readCompanySearchResults(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => optionalRecord(item))
    .filter((item): item is Record<string, unknown> => item !== undefined)
    .map((item) =>
      compactObject({
        name: optionalString(item.name),
        domain: optionalString(item.domain),
        linkedinUrl: optionalString(item.linkedin_url),
        signalCount: optionalInteger(item.signal_count),
        mostRecentSignalAt: optionalString(item.most_recent_signal_at),
        signals: readSignalArray(item.signals),
        raw: item,
      }),
    );
}

function readContactSearchResults(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => optionalRecord(item))
    .filter((item): item is Record<string, unknown> => item !== undefined)
    .map((item) =>
      compactObject({
        email: optionalString(item.email),
        linkedinUrl: optionalString(item.linkedin_url),
        name: optionalString(item.name),
        title: optionalString(item.title),
        company: normalizeCompany(optionalRecord(item.company)),
        signalCount: optionalInteger(item.signal_count),
        mostRecentSignalAt: optionalString(item.most_recent_signal_at),
        signals: readSignalArray(item.signals),
        raw: item,
      }),
    );
}

function readRequiredSignalTypes(value: unknown): string[] {
  const signalTypes = readOptionalSignalTypes(value);
  if (!signalTypes || signalTypes.length === 0) {
    throw new ProviderRequestError(400, "signalTypes must contain at least one value");
  }

  return signalTypes;
}

function readOptionalSignalTypes(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const signalTypes = value.map((item) => optionalString(item)).filter((item): item is string => !!item);
  return signalTypes.length > 0 ? signalTypes : undefined;
}

function readCompanyIdentifier(input: Record<string, unknown>): Record<string, string> {
  const identifier = compactObject({
    domain: optionalString(input.domain),
    companyName: optionalString(input.companyName),
    linkedinUrl: optionalString(input.linkedinUrl),
  }) as Record<string, string>;

  if (Object.keys(identifier).length === 0) {
    throw new ProviderRequestError(400, "Provide at least one of domain, companyName, or linkedinUrl.");
  }

  return identifier;
}

function readContactIdentifier(input: Record<string, unknown>): Record<string, string> {
  const identifier = compactObject({
    contactEmail: optionalString(input.contactEmail),
    contactLinkedinUrl: optionalString(input.contactLinkedinUrl),
  }) as Record<string, string>;

  if (Object.keys(identifier).length === 0) {
    throw new ProviderRequestError(400, "Provide at least one of contactEmail or contactLinkedinUrl.");
  }

  return identifier;
}

function readIntegerRecord(value: unknown): Record<string, number> | undefined {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }

  const output: Record<string, number> = {};
  for (const [key, child] of Object.entries(record)) {
    const integer = optionalInteger(child);
    if (integer !== undefined) {
      output[key] = integer;
    }
  }
  return output;
}

function stringifyQuery(input: Record<string, QueryValue>): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, value === undefined ? undefined : String(value)]),
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://signals.autobound.ai",
  auth: { type: "api_key_header", name: "x-api-key" },
});
