import type {
  CredentialValidationResult,
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { LeadmagicActionName } from "./actions.ts";

import {
  compactObject,
  optionalBoolean,
  optionalBooleanOrNull,
  optionalIntegerOrNull,
  optionalNumber,
  optionalRecord,
  optionalString,
  optionalStringOrNull,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "leadmagic";
const leadmagicApiBaseUrl = "https://api.leadmagic.io/v1";
const leadmagicDefaultRequestTimeoutMs = 30_000;

type LeadmagicMode = "validate" | "execute";
type LeadmagicActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

interface LeadmagicRequestInput {
  method: "GET" | "POST";
  path: string;
  body?: Record<string, unknown>;
  mode: LeadmagicMode;
}

export const leadmagicActionHandlers: Record<LeadmagicActionName, LeadmagicActionHandler> = {
  async get_credits(_input, context) {
    return normalizeCredits(
      await requestLeadmagicJson(
        {
          method: "GET",
          path: "/credits",
          mode: "execute",
        },
        context,
      ),
    );
  },
  async validate_email(input, context) {
    return normalizeEmailValidation(
      await requestLeadmagicJson(
        {
          method: "POST",
          path: "/people/email-validation",
          mode: "execute",
          body: {
            email: readNonEmptyString(input.email, "email"),
          },
        },
        context,
      ),
    );
  },
  async find_work_email(input, context) {
    validateFindWorkEmailInput(input);
    return normalizeWorkEmail(
      await requestLeadmagicJson(
        {
          method: "POST",
          path: "/people/email-finder",
          mode: "execute",
          body: buildFindWorkEmailBody(input),
        },
        context,
      ),
    );
  },
  async find_mobile(input, context) {
    validateAnyPresent(input, ["profileUrl", "workEmail", "personalEmail"], "profileUrl, workEmail, or personalEmail");
    return normalizeMobile(
      await requestLeadmagicJson(
        {
          method: "POST",
          path: "/people/mobile-finder",
          mode: "execute",
          body: compactObject({
            profile_url: optionalString(input.profileUrl),
            work_email: optionalString(input.workEmail),
            personal_email: optionalString(input.personalEmail),
          }),
        },
        context,
      ),
    );
  },
  async enrich_profile(input, context) {
    return normalizeProfile(
      await requestLeadmagicJson(
        {
          method: "POST",
          path: "/people/profile-search",
          mode: "execute",
          body: compactObject({
            profile_url: readNonEmptyString(input.profileUrl, "profileUrl"),
            extended_response: optionalBoolean(input.extendedResponse),
          }),
        },
        context,
      ),
    );
  },
  async enrich_company(input, context) {
    validateAnyPresent(
      input,
      ["companyDomain", "profileUrl", "companyName"],
      "companyDomain, profileUrl, or companyName",
    );
    return normalizeCompany(
      await requestLeadmagicJson(
        {
          method: "POST",
          path: "/companies/company-search",
          mode: "execute",
          body: compactObject({
            company_domain: optionalString(input.companyDomain),
            profile_url: optionalString(input.profileUrl),
            company_name: optionalString(input.companyName),
          }),
        },
        context,
      ),
    );
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, leadmagicActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    return validateLeadmagicCredential({
      apiKey: input.apiKey,
      fetcher,
      signal,
    });
  },
};

async function validateLeadmagicCredential(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<CredentialValidationResult> {
  const account = normalizeCredits(
    await requestLeadmagicJson(
      {
        method: "GET",
        path: "/credits",
        mode: "validate",
      },
      context,
    ),
  );

  return {
    profile: {
      accountId: service,
      displayName: `LeadMagic (${formatCredits(account.credits)} credits)`,
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: leadmagicApiBaseUrl,
      validationEndpoint: "/credits",
      credits: account.credits,
    },
  };
}

async function requestLeadmagicJson(
  input: LeadmagicRequestInput,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
): Promise<Record<string, unknown>> {
  const timeout = createProviderTimeout(context.signal, leadmagicDefaultRequestTimeoutMs);

  try {
    const response = await context.fetcher(buildLeadmagicUrl(input.path), {
      method: input.method,
      headers: buildLeadmagicHeaders(context.apiKey, Boolean(input.body)),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: timeout.signal,
    });
    const payload = await readLeadmagicPayload(response);

    if (!response.ok) {
      throw createLeadmagicError(response.status, payload, input.mode);
    }

    const record = optionalRecord(payload);
    if (!record) {
      throw new ProviderRequestError(502, "LeadMagic returned an invalid payload");
    }

    return record;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "LeadMagic request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `LeadMagic request failed: ${error.message}` : "LeadMagic request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function buildLeadmagicUrl(path: string): string {
  return new URL(path.replace(/^\//, ""), `${leadmagicApiBaseUrl}/`).toString();
}

function buildLeadmagicHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  return compactObject({
    accept: "application/json",
    "content-type": hasBody ? "application/json" : undefined,
    "user-agent": providerUserAgent,
    "X-API-Key": apiKey,
  }) as Record<string, string>;
}

async function readLeadmagicPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (response.ok) {
      throw new ProviderRequestError(502, "LeadMagic returned invalid JSON");
    }
    return { message: text };
  }
}

function createLeadmagicError(status: number, payload: unknown, mode: LeadmagicMode): ProviderRequestError {
  const message = readLeadmagicErrorMessage(payload) ?? `LeadMagic request failed with HTTP ${status}`;
  if (status === 401 || status === 403) {
    return mode === "validate"
      ? new ProviderRequestError(400, message, payload)
      : new ProviderRequestError(401, message, payload);
  }
  if (status === 402) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 404) {
    return new ProviderRequestError(mode === "validate" ? 400 : 404, message, payload);
  }
  if (status === 408 || status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? status : 502, message, payload);
}

function readLeadmagicErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const errors = record.errors;
  if (Array.isArray(errors)) {
    const firstError = optionalRecord(errors[0]);
    const title = optionalString(firstError?.title);
    const detail = optionalString(firstError?.detail);
    if (title || detail) {
      return [title, detail].filter(Boolean).join(" ");
    }
  }

  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.detail);
}

function normalizeCredits(payload: Record<string, unknown>): { credits: number; raw: Record<string, unknown> } {
  const credits = optionalNumber(payload.credits);
  if (credits === undefined) {
    throw new ProviderRequestError(502, "LeadMagic credits response is missing credits");
  }

  return {
    credits,
    raw: payload,
  };
}

function normalizeEmailValidation(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    email: optionalStringOrNull(payload.email),
    emailStatus: optionalStringOrNull(payload.email_status),
    isDomainCatchAll: optionalBooleanOrNull(payload.is_domain_catch_all),
    creditsConsumed: nullableNumber(payload.credits_consumed),
    message: optionalStringOrNull(payload.message),
    mxRecord: optionalStringOrNull(payload.mx_record),
    mxProvider: optionalStringOrNull(payload.mx_provider),
    mxGateway: optionalStringOrNull(payload.mx_gateway),
    mxGatewayType: optionalStringOrNull(payload.mx_gateway_type),
    mxSecurityGateway: optionalBooleanOrNull(payload.mx_security_gateway),
    company: pickPrefixObject(payload, "company_"),
    raw: payload,
  };
}

function normalizeWorkEmail(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    email: optionalStringOrNull(payload.email),
    status: optionalStringOrNull(payload.status),
    creditsConsumed: nullableNumber(payload.credits_consumed),
    message: optionalStringOrNull(payload.message),
    employmentVerified: optionalBooleanOrNull(payload.employment_verified),
    mxRecord: optionalStringOrNull(payload.mx_record),
    mxProvider: optionalStringOrNull(payload.mx_provider),
    hasMx: optionalBooleanOrNull(payload.has_mx),
    company: pickPrefixObject(payload, "company_"),
    raw: payload,
  };
}

function normalizeMobile(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    profileUrl: optionalStringOrNull(payload.profile_url),
    email: optionalStringOrNull(payload.email),
    mobileNumber: optionalStringOrNull(payload.mobile_number),
    creditsConsumed: nullableNumber(payload.credits_consumed),
    message: optionalStringOrNull(payload.message),
    raw: payload,
  };
}

function normalizeProfile(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    profileUrl: optionalStringOrNull(payload.profile_url),
    firstName: optionalStringOrNull(payload.first_name),
    lastName: optionalStringOrNull(payload.last_name),
    fullName: optionalStringOrNull(payload.full_name),
    professionalTitle: optionalStringOrNull(payload.professional_title),
    bio: optionalStringOrNull(payload.bio),
    location: optionalStringOrNull(payload.location),
    country: optionalStringOrNull(payload.country),
    followersRange: optionalStringOrNull(payload.followers_range),
    companyName: optionalStringOrNull(payload.company_name),
    companyIndustry: optionalStringOrNull(payload.company_industry),
    companyWebsite: optionalStringOrNull(payload.company_website),
    totalTenureYears: optionalStringOrNull(payload.total_tenure_years),
    totalTenureMonths: optionalStringOrNull(payload.total_tenure_months),
    workExperience: readObjectArray(payload.work_experience),
    education: readObjectArray(payload.education),
    certifications: readObjectArray(payload.certifications),
    raw: payload,
  };
}

function normalizeCompany(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    companyName: optionalStringOrNull(payload.companyName),
    companyId: optionalIntegerOrNull(payload.companyId),
    industry: optionalStringOrNull(payload.industry),
    employeeCount: optionalIntegerOrNull(payload.employeeCount),
    employeeRange: optionalStringOrNull(payload.employeeRange),
    founded: optionalIntegerOrNull(payload.founded),
    headquarters: optionalRecord(payload.headquarters) ?? null,
    revenue: optionalStringOrNull(payload.revenue),
    funding: optionalStringOrNull(payload.funding),
    followerCount: optionalIntegerOrNull(payload.followerCount),
    twitterUrl: optionalStringOrNull(payload.twitter_url),
    facebookUrl: optionalStringOrNull(payload.facebook_url),
    b2bProfileUrl: optionalStringOrNull(payload.b2b_profile_url),
    logoUrl: optionalStringOrNull(payload.logo_url),
    description: optionalStringOrNull(payload.description),
    specialties: readStringArray(payload.specialties),
    competitors: readStringArray(payload.competitors),
    raw: payload,
  };
}

function buildFindWorkEmailBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    first_name: optionalString(input.firstName),
    last_name: optionalString(input.lastName),
    full_name: optionalString(input.fullName),
    domain: optionalString(input.domain),
    company_name: optionalString(input.companyName),
  });
}

function validateFindWorkEmailInput(input: Record<string, unknown>): void {
  const hasName = hasText(input.fullName) || hasText(input.firstName) || hasText(input.lastName);
  const hasCompany = hasText(input.domain) || hasText(input.companyName);
  if (!hasName || !hasCompany) {
    throw new ProviderRequestError(400, "a name field and domain or companyName are required");
  }
}

function validateAnyPresent(input: Record<string, unknown>, keys: string[], label: string): void {
  if (!keys.some((key) => hasText(input[key]))) {
    throw new ProviderRequestError(400, `${label} is required`);
  }
}

function pickPrefixObject(input: Record<string, unknown>, prefix: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (key.startsWith(prefix)) {
      result[key] = value;
    }
  }
  return result;
}

function readObjectArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => optionalRecord(item) ?? { value: item });
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function nullableNumber(value: unknown): number | null {
  return optionalNumber(value) ?? null;
}

function readNonEmptyString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function hasText(value: unknown): boolean {
  return Boolean(optionalString(value));
}

function formatCredits(credits: number): string {
  return Number.isInteger(credits) ? String(credits) : String(Number(credits.toFixed(2)));
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.leadmagic.io/v1",
  auth: { type: "api_key_header", name: "x-api-key" },
});
