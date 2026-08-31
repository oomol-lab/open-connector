import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalRecord,
  optionalString,
} from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  runProviderRequest,
} from "../provider-runtime.ts";

const service = "klazify";
const klazifyApiBaseUrl = "https://www.klazify.com/api";

type KlazifyPhase = "validate" | "execute";
type KlazifyActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface NormalizedKlazifyResponse {
  success: boolean;
  domain: Record<string, unknown>;
  company?: Record<string, unknown> | null;
  domainRegistrationData?: Record<string, unknown> | null;
  technologies?: string[];
  socialMedia?: Record<string, unknown> | null;
  similarDomains?: string[];
  apiUsage?: Record<string, unknown> | null;
  raw: Record<string, unknown>;
}

export const klazifyActionHandlers: ProviderActionHandlers<"klazify", KlazifyActionHandler> = {
  categorize_url(input, context) {
    return runKlazifyLookup({
      input,
      context,
      path: "/categorize",
      normalize: (payload) => {
        const normalized = normalizeKlazifyResponse(payload);
        return compactObject({
          success: normalized.success,
          domain: normalized.domain,
          company: normalized.company ?? null,
          domainRegistrationData:
            normalized.domainRegistrationData == null ? undefined : normalized.domainRegistrationData,
          similarDomains: normalized.similarDomains ?? [],
          raw: normalized.raw,
        });
      },
    });
  },
  get_iab_categories(input, context) {
    return runKlazifyLookup({
      input,
      context,
      path: "/domain_iab_categories",
      normalize: (payload) => {
        const normalized = normalizeKlazifyResponse(payload);
        return {
          success: normalized.success,
          domain: normalized.domain,
          raw: normalized.raw,
        };
      },
    });
  },
  get_company_data(input, context) {
    return runKlazifyLookup({
      input,
      context,
      path: "/domain_company",
      normalize: (payload) => {
        const normalized = normalizeKlazifyResponse(payload);
        return {
          success: normalized.success,
          domain: normalized.domain,
          company: normalized.company ?? null,
          raw: normalized.raw,
        };
      },
    });
  },
  get_tech_stack(input, context) {
    return runKlazifyLookup({
      input,
      context,
      path: "/domain_tech",
      normalize: (payload) => {
        const normalized = normalizeKlazifyResponse(payload);
        return {
          success: normalized.success,
          domain: normalized.domain,
          company: normalized.company ?? null,
          technologies: normalized.technologies ?? [],
          raw: normalized.raw,
        };
      },
    });
  },
  get_domain_logo(input, context) {
    return runKlazifyLookup({
      input,
      context,
      path: "/domain_logo",
      normalize: (payload) => {
        const normalized = normalizeKlazifyResponse(payload);
        return {
          success: normalized.success,
          domain: normalized.domain,
          raw: normalized.raw,
        };
      },
    });
  },
  get_domain_expiration(input, context) {
    return runKlazifyLookup({
      input,
      context,
      path: "/domain_expiration",
      normalize: (payload) => {
        const normalized = normalizeKlazifyResponse(payload);
        return {
          success: normalized.success,
          domain: normalized.domain,
          domainRegistrationData: normalized.domainRegistrationData ?? null,
          raw: normalized.raw,
        };
      },
    });
  },
  get_social_media_links(input, context) {
    return runKlazifyLookup({
      input,
      context,
      path: "/domain_social_media",
      normalize: (payload) => {
        const normalized = normalizeKlazifyResponse(payload);
        return {
          success: normalized.success,
          domain: normalized.domain,
          socialMedia: normalized.socialMedia ?? null,
          raw: normalized.raw,
        };
      },
    });
  },
  get_similar_domains(input, context) {
    return runKlazifyLookup({
      input,
      context,
      path: "/similar_domain",
      normalize: (payload) => {
        const normalized = normalizeKlazifyResponse(payload);
        return {
          success: normalized.success,
          domain: normalized.domain,
          similarDomains: normalized.similarDomains ?? [],
          apiUsage: normalized.apiUsage ?? null,
          raw: normalized.raw,
        };
      },
    });
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, klazifyActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateKlazifyCredential({
      apiKey: input.apiKey,
      fetcher,
      signal,
    });
  },
};

async function validateKlazifyCredential(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<CredentialValidationResult> {
  await requestKlazifyJson({
    apiKey: context.apiKey,
    path: "/categorize",
    body: {
      url: "https://www.google.com",
    },
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "validate",
  });

  return {
    profile: {
      accountId: "api_key",
      displayName: "Klazify API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: klazifyApiBaseUrl,
      validationPath: "/categorize",
    },
  };
}

async function runKlazifyLookup(input: {
  input: Record<string, unknown>;
  context: ApiKeyProviderContext;
  path: string;
  normalize: (payload: Record<string, unknown>) => Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const payload = await requestKlazifyJson({
    apiKey: input.context.apiKey,
    path: input.path,
    body: buildKlazifyLookupBody(input.input),
    fetcher: input.context.fetcher,
    signal: input.context.signal,
    phase: "execute",
  });

  return input.normalize(payload);
}

function buildKlazifyLookupBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    url: requireKlazifyUrl(input),
    refresh: optionalBoolean(input.refresh),
  });
}

async function requestKlazifyJson(input: {
  apiKey: string;
  path: string;
  body: Record<string, unknown>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: KlazifyPhase;
}): Promise<Record<string, unknown>> {
  return runProviderRequest({ signal: input.signal, label: "Klazify" }, async (signal) => {
    const response = await input.fetcher(buildKlazifyUrl(input.path), {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(input.body),
      signal,
    });
    const payload = await readKlazifyPayload(response);

    if (!response.ok) {
      throw createKlazifyError(response.status, payload, input.phase);
    }

    if (payload.success === false) {
      throw createKlazifyError(response.status, payload, input.phase);
    }

    return payload;
  });
}

function buildKlazifyUrl(path: string): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return new URL(normalizedPath, `${klazifyApiBaseUrl}/`);
}

async function readKlazifyPayload(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (text.trim() === "") {
    throw new ProviderRequestError(502, "Klazify returned an empty response");
  }

  try {
    const payload = JSON.parse(text) as unknown;
    const record = optionalRecord(payload);
    if (!record) {
      throw new ProviderRequestError(502, "Klazify returned a non-object payload");
    }
    return record;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(502, "Klazify returned invalid JSON");
  }
}

function createKlazifyError(
  status: number,
  payload: Record<string, unknown>,
  phase: KlazifyPhase,
): ProviderRequestError {
  const message =
    optionalString(payload.message)?.trim() ?? optionalString(payload.error)?.trim() ?? "Klazify request failed";
  const normalizedMessage = message.toLowerCase();

  if (status === 401 || status === 403) {
    return new ProviderRequestError(phase === "validate" ? 400 : 401, message);
  }

  if (status === 429 || normalizedMessage.includes("rate limit")) {
    return new ProviderRequestError(429, message);
  }

  if (status >= 400 && status < 500) {
    return new ProviderRequestError(status, message);
  }

  if (phase === "execute") {
    if (
      normalizedMessage.includes("unauthorized") ||
      normalizedMessage.includes("api key") ||
      normalizedMessage.includes("bearer")
    ) {
      return new ProviderRequestError(401, message);
    }

    if (normalizedMessage.includes("/unreachable") || normalizedMessage.includes("/no indexable content")) {
      return new ProviderRequestError(400, message);
    }
  }

  if (phase === "validate" && status < 400) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(status || 500, message);
}

function normalizeKlazifyResponse(payload: Record<string, unknown>): NormalizedKlazifyResponse {
  const domainRaw = optionalRecord(payload.domain) ?? {};
  const socialRaw = optionalRecord(domainRaw.social_media) ?? optionalRecord(payload.social_media) ?? undefined;
  const companyRaw = optionalRecord(optionalRecord(payload.objects)?.company);
  const domainRegistrationRaw = optionalRecord(payload.domain_registration_data);
  const similarDomains =
    readStringArray(payload.similar) ??
    readStringArray(payload.similar_domains) ??
    readStringArray(domainRaw.similar_domains) ??
    [];
  const company = companyRaw ? normalizeCompany(companyRaw) : null;
  const socialMedia = socialRaw ? normalizeSocialMedia(socialRaw) : null;

  return {
    success: payload.success !== false,
    domain: {
      domainUrl:
        readNullableString(domainRaw.domain_url) ??
        readNullableString(optionalRecord(payload.domain)?.domain_url) ??
        null,
      logoUrl: readNullableString(domainRaw.logo_url) ?? null,
      categories: normalizeCategories(domainRaw.categories),
      socialMedia,
      raw: domainRaw,
    },
    company,
    domainRegistrationData: domainRegistrationRaw ? normalizeDomainRegistration(domainRegistrationRaw) : null,
    technologies: company?.tech ?? [],
    socialMedia,
    similarDomains,
    apiUsage: normalizeApiUsage(optionalRecord(payload.api_usage)),
    raw: payload,
  };
}

function normalizeCategories(value: unknown): Array<Record<string, unknown>> {
  const categories = Array.isArray(value) ? value : [];
  return categories.map((item) => {
    const raw = optionalRecord(item) ?? {};
    return {
      name: optionalString(raw.name) ?? "",
      confidence: optionalNumber(raw.confidence) ?? null,
      iabCategory: readNullableString(raw.IAB) ?? readNullableString(raw.IAB12) ?? readNullableString(raw.iab) ?? null,
      raw,
    };
  });
}

function normalizeSocialMedia(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    facebookUrl: readNullableString(raw.facebook_url) ?? readNullableString(raw.facebook) ?? null,
    twitterUrl: readNullableString(raw.twitter_url) ?? readNullableString(raw.twitter) ?? null,
    instagramUrl: readNullableString(raw.instagram_url) ?? readNullableString(raw.instagram) ?? null,
    youtubeUrl: readNullableString(raw.youtube_url) ?? readNullableString(raw.youtube) ?? null,
    linkedinUrl: readNullableString(raw.linkedin_url) ?? readNullableString(raw.linkedin) ?? null,
    githubUrl: readNullableString(raw.github_url) ?? readNullableString(raw.github) ?? null,
    pinterestUrl: readNullableString(raw.pinterest_url) ?? readNullableString(raw.pinterest) ?? null,
    mediumUrl: readNullableString(raw.medium_url) ?? readNullableString(raw.medium) ?? null,
    raw,
  };
}

function normalizeCompany(raw: Record<string, unknown>): Record<string, unknown> & { tech: string[] } {
  const tech = readStringArray(raw.tech_stack) ?? readStringArray(raw.tech) ?? [];
  return {
    name: readNullableString(raw.name),
    city: readNullableString(raw.city),
    stateCode: readNullableString(raw.stateCode) ?? readNullableString(raw.state_code) ?? null,
    countryCode: readNullableString(raw.countryCode) ?? readNullableString(raw.country_code) ?? null,
    employeesRange: readNullableString(raw.employeesRange) ?? readNullableString(raw.employees_range) ?? null,
    revenue: readNullableStringOrNumber(raw.revenue),
    raised: readNullableStringOrNumber(raw.raised),
    tags: readStringArray(raw.tags) ?? [],
    tech,
    raw,
  };
}

function normalizeDomainRegistration(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    domainAgeDate: readNullableString(raw.domain_age_date),
    domainAgeDaysAgo: optionalInteger(raw.domain_age_days_ago) ?? null,
    domainExpirationDate: readNullableString(raw.domain_expiration_date),
    domainExpirationDaysLeft: optionalInteger(raw.domain_expiration_days_left) ?? null,
    raw,
  };
}

function normalizeApiUsage(raw: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!raw) {
    return null;
  }

  return {
    remainingApiCalls: optionalInteger(raw.remaining_api_calls) ?? null,
    thisMonthApiCalls: optionalInteger(raw.this_month_api_calls) ?? null,
    raw,
  };
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map((item) => optionalString(item)?.trim()).filter((item): item is string => Boolean(item));
}

function readNullableStringOrNumber(value: unknown): string | number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number" || typeof value === "string") {
    return value;
  }

  return null;
}

function readNullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return optionalString(value) ?? null;
}

function requireKlazifyUrl(input: Record<string, unknown>): string {
  const url = optionalString(input.url)?.trim();
  if (!url) {
    throw new ProviderRequestError(400, "url is required");
  }

  return url;
}
