import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { isIP } from "node:net";
import { nullableString, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
  requiredResponseRecord,
} from "../provider-runtime.ts";

const service = "abuseipdb";
const abuseipdbApiBaseUrl = "https://api.abuseipdb.com/api/v2";
const abuseipdbDefaultRequestTimeoutMs = 30_000;
const abuseipdbValidationIpAddress = "8.8.8.8";

type AbuseipdbRequestPhase = "validate" | "execute";

interface AbuseipdbActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type AbuseipdbActionHandler = (input: Record<string, unknown>, context: AbuseipdbActionContext) => Promise<unknown>;

export const abuseipdbActionHandlers: ProviderActionHandlers<"abuseipdb", AbuseipdbActionHandler> = {
  check_ip(input, context) {
    return executeCheckIp(input, context);
  },
  get_reports(input, context) {
    return executeGetReports(input, context);
  },
  check_block(input, context) {
    return executeCheckBlock(input, context);
  },
  blacklist(input, context) {
    return executeBlacklist(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<AbuseipdbActionContext>({
  service,
  handlers: abuseipdbActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<AbuseipdbActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestAbuseipdbJson({
      apiKey: input.apiKey,
      path: "/check",
      query: {
        ipAddress: abuseipdbValidationIpAddress,
        maxAgeInDays: "30",
      },
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      phase: "validate",
    });
    const body = requiredResponseRecord(payload, "abuseipdb validation response");
    requiredResponseRecord(body.data, "abuseipdb validation response data");

    return {
      profile: {
        accountId: "api_key",
        displayName: "AbuseIPDB API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: abuseipdbApiBaseUrl,
        validationEndpoint: "/check",
        validationIpAddress: abuseipdbValidationIpAddress,
      },
    };
  },
};

async function executeCheckIp(input: Record<string, unknown>, context: AbuseipdbActionContext): Promise<unknown> {
  const verbose = optionalBoolean(input.verbose);
  const payload = await requestAbuseipdbJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: "/check",
    query: {
      ipAddress: readInputIpAddress(input.ipAddress, "ipAddress"),
      maxAgeInDays: stringifyInteger(input.maxAgeInDays),
      verbose: verbose === undefined ? undefined : String(verbose),
    },
    context,
    phase: "execute",
  });
  const body = requiredResponseRecord(payload, "abuseipdb check response");
  const data = requiredResponseRecord(body.data, "abuseipdb check response data");

  return {
    ip: normalizeIpSummary(data),
    reports: verbose ? normalizeReportList(data.reports, "abuseipdb check response reports") : null,
  };
}

async function executeGetReports(input: Record<string, unknown>, context: AbuseipdbActionContext): Promise<unknown> {
  const payload = await requestAbuseipdbJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: "/reports",
    query: {
      ipAddress: readInputIpAddress(input.ipAddress, "ipAddress"),
      maxAgeInDays: stringifyInteger(input.maxAgeInDays),
      page: stringifyInteger(input.page),
      perPage: stringifyInteger(input.perPage),
    },
    context,
    phase: "execute",
  });
  const body = requiredResponseRecord(payload, "abuseipdb reports response");
  const data = requiredResponseRecord(body.data, "abuseipdb reports response data");

  return {
    reports: normalizeReportList(data.results, "abuseipdb reports response results"),
    pagination: {
      total: readInteger(data.total, "total"),
      page: readInteger(data.page, "page"),
      count: readInteger(data.count, "count"),
      perPage: readInteger(data.perPage, "perPage"),
      lastPage: readInteger(data.lastPage, "lastPage"),
      nextPageUrl: nullableString(data.nextPageUrl) ?? null,
      previousPageUrl: nullableString(data.previousPageUrl) ?? null,
    },
  };
}

async function executeCheckBlock(input: Record<string, unknown>, context: AbuseipdbActionContext): Promise<unknown> {
  const payload = await requestAbuseipdbJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: "/check-block",
    query: {
      network: readInputCidr(input.network, "network"),
      maxAgeInDays: stringifyInteger(input.maxAgeInDays),
    },
    context,
    phase: "execute",
  });
  const body = requiredResponseRecord(payload, "abuseipdb check-block response");
  const data = requiredResponseRecord(body.data, "abuseipdb check-block response data");
  const reportedAddressPayload = data.reportedAddress ?? data.reportedAddresses;

  return {
    block: {
      networkAddress: readString(data.networkAddress, "networkAddress"),
      netmask: readString(data.netmask, "netmask"),
      minAddress: readString(data.minAddress, "minAddress"),
      maxAddress: readString(data.maxAddress, "maxAddress"),
      numPossibleHosts: readInteger(data.numPossibleHosts, "numPossibleHosts"),
      addressSpaceDesc: readString(data.addressSpaceDesc, "addressSpaceDesc"),
    },
    reportedAddresses: normalizeReportedAddressList(reportedAddressPayload, "abuseipdb check-block reportedAddress"),
  };
}

async function executeBlacklist(input: Record<string, unknown>, context: AbuseipdbActionContext): Promise<unknown> {
  const payload = await requestAbuseipdbJson<Record<string, unknown>>({
    apiKey: context.apiKey,
    path: "/blacklist",
    query: {
      limit: stringifyInteger(input.limit),
      ipVersion: stringifyInteger(input.ipVersion),
      confidenceMinimum: stringifyInteger(input.confidenceMinimum),
      onlyCountries: serializeStringList(input.onlyCountries),
      exceptCountries: serializeStringList(input.exceptCountries),
    },
    context,
    phase: "execute",
  });
  const body = requiredResponseRecord(payload, "abuseipdb blacklist response");
  const meta = optionalRecord(body.meta);
  const generatedAt =
    optionalString(meta?.generatedAt) ?? optionalString(body.generatedAt) ?? optionalString(body.generated_at);

  if (!generatedAt) {
    throw new ProviderRequestError(502, "abuseipdb blacklist response missing generatedAt", payload);
  }

  return {
    entries: normalizeBlacklistEntries(body.data),
    generatedAt,
  };
}

function buildAbuseipdbUrl(path: string, query: Record<string, string | undefined>): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${abuseipdbApiBaseUrl}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function requestAbuseipdbJson<T>(input: {
  apiKey: string;
  path: string;
  query?: Record<string, string | undefined>;
  context: AbuseipdbActionContext;
  phase: AbuseipdbRequestPhase;
}): Promise<T> {
  let response: Response;
  let payload: unknown;
  const signal = input.context.signal
    ? AbortSignal.any([input.context.signal, AbortSignal.timeout(abuseipdbDefaultRequestTimeoutMs)])
    : AbortSignal.timeout(abuseipdbDefaultRequestTimeoutMs);
  try {
    response = await input.context.fetcher(buildAbuseipdbUrl(input.path, input.query ?? {}), {
      method: "GET",
      headers: {
        Key: input.apiKey,
        Accept: "application/json",
        "User-Agent": providerUserAgent,
      },
      signal,
    });
    payload = await readAbuseipdbPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "AbuseIPDB request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `AbuseIPDB request failed: ${error.message}` : "AbuseIPDB request failed",
    );
  }

  if (!response.ok) {
    throw createAbuseipdbError(response, payload, input.phase);
  }

  return payload as T;
}

async function readAbuseipdbPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "AbuseIPDB returned invalid JSON");
  }
}

function createAbuseipdbError(
  response: Response,
  payload: unknown,
  phase: AbuseipdbRequestPhase,
): ProviderRequestError {
  const message = extractAbuseipdbErrorMessage(payload) ?? `AbuseIPDB request failed with status ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (response.status === 402) {
    return new ProviderRequestError(isRateLimitLike402Message(message) ? 429 : 402, message, payload);
  }

  if (phase === "validate" && response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }

  if (phase === "execute" && response.status === 401) {
    return new ProviderRequestError(401, message, payload);
  }

  if (phase === "execute" && response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status || 502, message, payload);
}

function extractAbuseipdbErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const topLevelMessage = optionalString(record.message);
  if (topLevelMessage) {
    return topLevelMessage;
  }

  if (!Array.isArray(record.errors)) {
    return undefined;
  }

  for (const item of record.errors) {
    const errorRecord = optionalRecord(item);
    if (!errorRecord) {
      continue;
    }

    const detail = optionalString(errorRecord.detail);
    if (detail) {
      return detail;
    }

    const message = optionalString(errorRecord.message);
    if (message) {
      return message;
    }

    const title = optionalString(errorRecord.title);
    if (title) {
      return title;
    }
  }

  return undefined;
}

function normalizeIpSummary(record: Record<string, unknown>): Record<string, unknown> {
  return {
    ipAddress: readString(record.ipAddress, "ipAddress"),
    isPublic: readBoolean(record.isPublic, "isPublic"),
    ipVersion: readInteger(record.ipVersion, "ipVersion"),
    abuseConfidenceScore: readInteger(record.abuseConfidenceScore, "abuseConfidenceScore"),
    totalReports: readInteger(record.totalReports, "totalReports"),
    numDistinctUsers: readInteger(record.numDistinctUsers, "numDistinctUsers"),
    countryCode: nullableString(record.countryCode) ?? null,
    usageType: nullableString(record.usageType) ?? null,
    isp: nullableString(record.isp) ?? null,
    domain: nullableString(record.domain) ?? null,
    hostnames: readStringArray(record.hostnames),
    lastReportedAt: nullableString(record.lastReportedAt) ?? null,
  };
}

function normalizeReportList(value: unknown, label: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} must be an array`);
  }

  return value.map((item) => {
    const record = requiredResponseRecord(item, label);
    return {
      reportedAt: readString(record.reportedAt, "reportedAt"),
      comment: readString(record.comment, "comment"),
      categories: readIntegerArray(record.categories, "categories"),
      reporterId: readInteger(record.reporterId, "reporterId"),
      reporterCountryCode: nullableString(record.reporterCountryCode) ?? null,
      reporterCountryName: nullableString(record.reporterCountryName) ?? null,
    };
  });
}

function normalizeReportedAddressList(value: unknown, label: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} must be an array`);
  }

  return value.map((item) => {
    const record = requiredResponseRecord(item, label);
    return {
      ipAddress: readString(record.ipAddress, "ipAddress"),
      numReports: readInteger(record.numReports, "numReports"),
      mostRecentReport: nullableString(record.mostRecentReport) ?? null,
      abuseConfidenceScore: readInteger(record.abuseConfidenceScore, "abuseConfidenceScore"),
      countryCode: nullableString(record.countryCode) ?? null,
    };
  });
}

function normalizeBlacklistEntries(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "abuseipdb blacklist data must be an array");
  }

  return value.map((item) => requiredResponseRecord(item, "abuseipdb blacklist entry"));
}

function readInputString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (parsed) {
    return parsed;
  }
  throw new ProviderRequestError(400, `${fieldName} is required`);
}

function readInputIpAddress(value: unknown, fieldName: string): string {
  const parsed = readInputString(value, fieldName);
  if (isIP(parsed) === 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a valid IPv4 or IPv6 address`);
  }
  return parsed;
}

function readInputCidr(value: unknown, fieldName: string): string {
  const parsed = readInputString(value, fieldName);
  if (!isValidCidr(parsed)) {
    throw new ProviderRequestError(400, `${fieldName} must be a valid IPv4 or IPv6 CIDR block`);
  }
  return parsed;
}

function isValidCidr(value: string): boolean {
  const parts = value.split("/");
  if (parts.length !== 2) {
    return false;
  }

  const [address, prefixText] = parts;
  const ipVersion = isIP(address ?? "");
  if (ipVersion === 0 || prefixText == null || prefixText.trim() === "") {
    return false;
  }

  const prefix = Number(prefixText);
  if (!Number.isInteger(prefix) || prefix < 0) {
    return false;
  }

  return prefix <= (ipVersion === 4 ? 32 : 128);
}

function readString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new ProviderRequestError(502, `AbuseIPDB response missing string field: ${fieldName}`);
  }
  return parsed;
}

function readInteger(value: unknown, fieldName: string): number {
  const parsed = optionalInteger(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(502, `AbuseIPDB response missing integer field: ${fieldName}`);
  }
  return parsed;
}

function readBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new ProviderRequestError(502, `AbuseIPDB response missing boolean field: ${fieldName}`);
  }
  return value;
}

function readStringArray(value: unknown): string[] {
  if (value == null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "hostnames must be an array");
  }

  return value.map((item) => readString(item, "hostnames"));
}

function readIntegerArray(value: unknown, fieldName: string): number[] {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${fieldName} must be an array`);
  }

  return value.map((item) => readInteger(item, fieldName));
}

function stringifyInteger(value: unknown): string | undefined {
  const parsed = optionalInteger(value);
  if (parsed === undefined) {
    return undefined;
  }
  return String(parsed);
}

function serializeStringList(value: unknown): string | undefined {
  if (value == null) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, "country filters must be arrays");
  }

  const values = value
    .map((item) => readInputString(item, "country code"))
    .map((item) => item.trim())
    .filter((item) => item !== "");

  return values.length > 0 ? values.join(",") : undefined;
}

function isRateLimitLike402Message(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("quota") || normalized.includes("upgrade") || normalized.includes("plan");
}
