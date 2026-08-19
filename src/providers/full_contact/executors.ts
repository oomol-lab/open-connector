import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineProviderExecutors,
  defineProviderProxy,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const fullContactApiBaseUrl = "https://api.fullcontact.com/v3";

const fullContactDefaultRequestTimeoutMs = 30_000;
const fullContactMaxResponseBytes = 10 * 1024 * 1024;

type FullContactMode = "validate" | "execute";
type FullContactActionHandler = (
  input: Record<string, unknown>,
  context: FullContactRequestContext,
) => Promise<unknown>;

interface FullContactRequestContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export const fullContactActionHandlers: ProviderActionHandlers<"full_contact", FullContactActionHandler> = {
  async enrich_person(input, context) {
    const payload = await requestFullContactJson(
      {
        endpoint: "person.enrich",
        body: toFullContactPayload(input),
        mode: "execute",
      },
      context,
    );

    return normalizePersonEnrichPayload(payload);
  },
  async enrich_company(input, context) {
    const payload = await requestFullContactJson(
      {
        endpoint: "company.enrich",
        body: {
          domain: requireString(input.domain, "domain"),
        },
        mode: "execute",
      },
      context,
    );

    return normalizeCompanyEnrichPayload(payload);
  },
  async verify_match(input, context) {
    const payload = await requestFullContactJson(
      {
        endpoint: "verify.match",
        body: toFullContactPayload(input),
        mode: "execute",
      },
      context,
    );

    return {
      city: optionalBoolean(payload.city) ?? null,
      region: optionalBoolean(payload.region) ?? null,
      country: optionalBoolean(payload.country) ?? null,
      continent: optionalBoolean(payload.continent) ?? null,
      postalCode: optionalBoolean(payload.postalCode) ?? null,
      familyName: optionalBoolean(payload.familyName) ?? null,
      givenName: optionalBoolean(payload.givenName) ?? null,
      phone: optionalBoolean(payload.phone) ?? null,
      email: optionalBoolean(payload.email) ?? null,
      social: optionalBoolean(payload.social) ?? null,
      maid: optionalBoolean(payload.maid) ?? null,
      nonId: optionalBoolean(payload.nonId) ?? null,
      raw: payload,
    };
  },
  async verify_signals(input, context) {
    const payload = await requestFullContactJson(
      {
        endpoint: "verify.signals",
        body: toFullContactPayload(input),
        mode: "execute",
      },
      context,
    );

    return {
      emails: Array.isArray(payload.emails) ? payload.emails : null,
      personIds: Array.isArray(payload.personIds) ? payload.personIds : null,
      name: optionalRecord(payload.name) ?? null,
      socialProfiles: optionalRecord(payload.socialProfiles) ?? null,
      demographics: optionalRecord(payload.demographics) ?? null,
      employment: optionalRecord(payload.employment) ?? null,
      locations: Array.isArray(payload.locations) ? payload.locations : null,
      raw: payload,
    };
  },
  async verify_activity(input, context) {
    const payload = await requestFullContactJson(
      {
        endpoint: "verify.activity",
        body: toFullContactPayload(input),
        mode: "execute",
      },
      context,
    );

    return {
      emails: optionalNumber(payload.emails) ?? null,
      raw: payload,
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<FullContactRequestContext>({
  service: "full_contact",
  handlers: fullContactActionHandlers,
  skipDnsValidation: true,
  async createContext(context: ExecutionContext, fetcher): Promise<FullContactRequestContext> {
    const credential = await requireApiKeyCredential(context, "full_contact");
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "full_contact",
  baseUrl: fullContactApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json");
    headers.set("user-agent", providerUserAgent);
  },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input) {
    if (!input.apiKey.trim()) {
      throw new ProviderRequestError(400, "FullContact API key is required");
    }
    return {
      profile: {
        displayName: "FullContact API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: fullContactApiBaseUrl,
        validationMode: "format_only",
      },
    };
  },
};

async function requestFullContactJson(
  input: {
    endpoint: string;
    body: Record<string, unknown>;
    mode: FullContactMode;
  },
  context: FullContactRequestContext,
) {
  const timeoutHandle = createProviderTimeout(context.signal, fullContactDefaultRequestTimeoutMs);

  try {
    const response = await context.fetcher(new URL(input.endpoint, `${fullContactApiBaseUrl}/`), {
      method: "POST",
      headers: buildFullContactHeaders(context.apiKey),
      body: JSON.stringify(stripUndefined(input.body)),
      signal: timeoutHandle.signal,
    });
    const payload = await readFullContactPayload(response);

    if (!response.ok) {
      throw createFullContactError(response.status, payload, input.mode);
    }

    const payloadObject = optionalRecord(payload);
    if (!payloadObject) {
      throw new ProviderRequestError(502, "FullContact returned an invalid payload");
    }

    return payloadObject;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeoutHandle.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "FullContact request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `FullContact request failed: ${error.message}` : "FullContact request failed",
    );
  } finally {
    timeoutHandle.cleanup();
  }
}

function buildFullContactHeaders(apiKey: string) {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
    "user-agent": providerUserAgent,
  };
}

async function readFullContactPayload(response: Response) {
  const text = await readProviderTextBody(response, "FullContact response", fullContactMaxResponseBytes);
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "FullContact returned invalid JSON");
    }
    return { message: text };
  }
}

function createFullContactError(status: number, payload: unknown, mode: FullContactMode) {
  const message = readFullContactErrorMessage(payload) ?? `FullContact request failed with ${status}`;

  if (status === 402 || status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (mode === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message);
  }

  if (mode === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(401, message);
  }

  if ([400, 404, 422].includes(status)) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message);
}

function readFullContactErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const error = optionalRecord(record.error);
  return (
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.detail) ??
    optionalString(record.statusText) ??
    optionalString(error?.message) ??
    optionalString(error?.detail)
  );
}

function normalizePersonEnrichPayload(payload: Record<string, unknown>) {
  return {
    ...normalizeQueueFields(payload),
    fullName: optionalString(payload.fullName) ?? null,
    ageRange: optionalString(payload.ageRange) ?? null,
    gender: optionalString(payload.gender) ?? null,
    location: optionalString(payload.location) ?? null,
    title: optionalString(payload.title) ?? null,
    organization: optionalString(payload.organization) ?? null,
    twitter: optionalString(payload.twitter) ?? null,
    linkedin: optionalString(payload.linkedin) ?? null,
    facebook: optionalString(payload.facebook) ?? null,
    bio: optionalString(payload.bio) ?? null,
    avatar: optionalString(payload.avatar) ?? null,
    website: optionalString(payload.website) ?? null,
    details: optionalRecord(payload.details) ?? null,
    raw: payload,
  };
}

function normalizeCompanyEnrichPayload(payload: Record<string, unknown>) {
  return {
    ...normalizeQueueFields(payload),
    name: optionalString(payload.name) ?? null,
    location: optionalString(payload.location) ?? null,
    twitter: optionalString(payload.twitter) ?? null,
    linkedin: optionalString(payload.linkedin) ?? null,
    facebook: optionalString(payload.facebook) ?? null,
    bio: optionalString(payload.bio) ?? null,
    logo: optionalString(payload.logo) ?? null,
    website: optionalString(payload.website) ?? null,
    founded: optionalInteger(payload.founded) ?? null,
    employees: optionalInteger(payload.employees) ?? null,
    locale: optionalString(payload.locale) ?? null,
    category: optionalString(payload.category) ?? null,
    details: optionalRecord(payload.details) ?? null,
    raw: payload,
  };
}

function normalizeQueueFields(payload: Record<string, unknown>) {
  return {
    queued: payload.status === 202 || Boolean(payload.requestId),
    requestId: optionalString(payload.requestId) ?? null,
    message: optionalString(payload.message) ?? null,
  };
}

function toFullContactPayload(input: Record<string, unknown>) {
  const payload: Record<string, unknown> = {
    ...input,
    phone: trimOptionalString(input.phone),
    phones: trimStringArray(input.phones),
    location: trimRecordFields(input.location, [
      "addressLine1",
      "addressLine2",
      "city",
      "region",
      "regionCode",
      "postalCode",
    ]),
    name: trimRecordFields(input.name, ["full", "given", "family"]),
    profiles: normalizeProfiles(input.profiles),
    maids: trimStringArray(input.maids),
    placekey: trimOptionalString(input.placekey),
    recordId: trimOptionalString(input.recordId),
    personId: trimOptionalString(input.personId),
    partnerId: trimOptionalString(input.partnerId),
    panoramaId: trimOptionalString(input.panoramaId),
    confidence: trimOptionalString(input.confidence),
    dataFilter: trimStringArray(input.dataFilter),
    li_nonid: trimOptionalString(input.liNonId),
  };
  delete payload.liNonId;
  validateMultiFieldInput(payload);
  return compactObject(payload);
}

function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item));
  }

  const record = optionalRecord(value);
  if (!record) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(record)
      .filter(([, child]) => child !== undefined)
      .map(([key, child]) => [key, stripUndefined(child)]),
  );
}

function requireString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value.trim();
}

function trimOptionalString(value: unknown): unknown {
  return typeof value === "string" ? value.trim() : value;
}

function trimStringArray(value: unknown): unknown {
  return Array.isArray(value) ? value.map(trimOptionalString) : value;
}

function trimRecordFields(value: unknown, fields: readonly string[]): unknown {
  const record = optionalRecord(value);
  if (!record) {
    return value;
  }
  const normalized = { ...record };
  for (const field of fields) {
    normalized[field] = trimOptionalString(record[field]);
  }
  return normalized;
}

function normalizeProfiles(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }
  return value.map((profile) => trimRecordFields(profile, ["service", "username", "userid"]));
}

function validateMultiFieldInput(input: Record<string, unknown>): void {
  const location = optionalRecord(input.location);
  if (location) {
    const hasAddress = hasText(location.addressLine1);
    const hasCity = hasText(location.city);
    const hasRegion = hasText(location.region) || hasText(location.regionCode);
    const hasPostalCode = hasText(location.postalCode);
    if (!hasAddress || !((hasCity && hasRegion) || hasPostalCode)) {
      throw new ProviderRequestError(
        400,
        "location requires addressLine1 plus postalCode, or addressLine1 plus city and region/regionCode",
      );
    }
  }

  const name = optionalRecord(input.name);
  if (name && !hasText(name.full) && !(hasText(name.given) && hasText(name.family))) {
    throw new ProviderRequestError(400, "name requires full, or both given and family");
  }

  if (Array.isArray(input.profiles)) {
    for (const value of input.profiles) {
      const profile = optionalRecord(value);
      if (!profile) {
        continue;
      }
      const hasService = hasText(profile.service);
      if (!hasText(profile.url) && !(hasService && (hasText(profile.username) || hasText(profile.userid)))) {
        throw new ProviderRequestError(400, "profile requires url, or service plus username/userid");
      }
    }
  }

  const hasStandaloneIdentifier =
    hasText(input.email) ||
    hasNonEmptyArray(input.emails) ||
    hasText(input.phone) ||
    hasNonEmptyArray(input.phones) ||
    hasNonEmptyArray(input.profiles) ||
    hasNonEmptyArray(input.maids) ||
    hasText(input.placekey) ||
    hasText(input.recordId) ||
    hasText(input.personId) ||
    hasText(input.partnerId) ||
    hasText(input.li_nonid) ||
    hasText(input.panoramaId);
  if (!hasStandaloneIdentifier && !(name && location)) {
    throw new ProviderRequestError(
      400,
      "at least one identifier is required; name-only or location-only queries must include both name and location",
    );
  }
}

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasNonEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}
