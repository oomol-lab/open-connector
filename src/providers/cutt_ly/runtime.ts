import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const cuttlyApiBaseUrl = "https://cutt.ly";
const cuttlyApiPath = "/api/api.php";
const cuttlyValidationProbeUrl = "not-a-valid-url";

type CuttlyMode = "validate" | "execute";
type CuttlyQueryValue = string | number | undefined;
type CuttlyActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const cuttLyActionHandlers: ProviderActionHandlers<"cutt_ly", CuttlyActionHandler> = {
  shorten_url(input, context) {
    return shortenUrl(input, context);
  },
  get_link_analytics(input, context) {
    return getLinkAnalytics(input, context);
  },
};

export async function validateCuttlyCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestCuttlyJson({
    apiKey,
    fetcher,
    signal,
    mode: "validate",
    query: {
      short: cuttlyValidationProbeUrl,
    },
  });

  const status = readNumber(optionalRecord(optionalRecord(payload)?.url)?.status);
  if (status === 4) {
    throw createCuttlyAuthError("validate", "Invalid API key");
  }

  return {
    profile: {
      accountId: "api_key",
      displayName: "Cuttly API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: cuttlyApiBaseUrl,
      validationEndpoint: cuttlyApiPath,
      validationProbe: cuttlyValidationProbeUrl,
      validationStatus: status,
    }),
  };
}

async function shortenUrl(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestCuttlyJson({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
    query: {
      short: requireStringField(input.url, "url"),
      name: optionalString(input.alias),
      userDomain: optionalBoolean(input.useCustomDomain) ? 1 : undefined,
      noTitle: optionalBoolean(input.disableTitle) ? 1 : undefined,
      public: optionalBoolean(input.publicStats) ? 1 : undefined,
    },
  });

  const urlPayload = optionalRecord(optionalRecord(payload)?.url);
  if (!urlPayload) {
    throw new ProviderRequestError(502, "Cuttly returned an invalid shortening response");
  }

  const status = readNumber(urlPayload.status);
  switch (status) {
    case 1:
      throw new ProviderRequestError(400, "Cuttly reports that the URL has already been shortened.");
    case 2:
      throw new ProviderRequestError(400, "Cuttly reports that the URL is invalid.");
    case 3:
      throw new ProviderRequestError(400, "Cuttly reports that the requested alias is already taken.");
    case 4:
      throw createCuttlyAuthError("execute", "Invalid API key");
    case 5:
      throw new ProviderRequestError(400, "Cuttly reports that the URL failed validation.");
    case 6:
      throw new ProviderRequestError(400, "Cuttly reports that the URL belongs to a blocked domain.");
    case 8:
      throw new ProviderRequestError(429, "Cuttly reports that the monthly shortening limit has been reached.");
    case 7:
      return compactObject({
        shortUrl: requireStringField(urlPayload.shortLink, "shortLink"),
        url: requireStringField(urlPayload.fullLink, "fullLink"),
        title: optionalString(urlPayload.title),
        createdAt: optionalString(urlPayload.date),
      });
    default:
      throw new ProviderRequestError(502, `Cuttly returned an unknown shortening status: ${status ?? "unknown"}`);
  }
}

async function getLinkAnalytics(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const payload = await requestCuttlyJson({
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
    query: {
      stats: requireStringField(input.shortUrl, "shortUrl"),
      date_from: optionalString(input.dateFrom),
      date_to: optionalString(input.dateTo),
    },
  });

  const statsPayload = optionalRecord(optionalRecord(payload)?.stats);
  if (!statsPayload) {
    throw new ProviderRequestError(502, "Cuttly returned an invalid analytics response");
  }

  const status = readNumber(statsPayload.status);
  if (status !== undefined && status !== 1) {
    const message = extractCuttlyMessage(payload, "Cuttly returned an invalid analytics response");
    if (status === 4) {
      throw createCuttlyAuthError("execute", message);
    }
    throw mapCuttlyMessageToError(message, "execute");
  }

  const devicesPayload = optionalRecord(statsPayload.devices);
  const botsValue = statsPayload.bots;

  return compactObject({
    shortUrl: requireStringField(statsPayload.shortLink, "shortLink"),
    url: requireStringField(statsPayload.fullLink, "fullLink"),
    title: optionalString(statsPayload.title),
    createdAt: optionalString(statsPayload.date),
    totalClicks: readCount(statsPayload.clicks),
    facebookClicks: readCount(statsPayload.facebook),
    twitterClicks: readCount(statsPayload.twitter),
    linkedinClicks: readCount(statsPayload.linkedin),
    otherClicks: readCount(statsPayload.rest),
    botClicks: readBotCount(botsValue),
    referrers: readReferrers(optionalRecord(statsPayload.refs)?.ref),
    countries: readTaggedBreakdown(devicesPayload?.geo),
    deviceTypes: readTaggedBreakdown(devicesPayload?.dev),
    operatingSystems: readTaggedBreakdown(devicesPayload?.sys),
    browsers: readTaggedBreakdown(devicesPayload?.bro),
    brands: readTaggedBreakdown(devicesPayload?.brand),
    languages: readTaggedBreakdown(devicesPayload?.lang),
    bots: readBots(botsValue),
  });
}

async function requestCuttlyJson(input: {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  mode: CuttlyMode;
  query: Record<string, CuttlyQueryValue>;
}): Promise<unknown> {
  const url = buildCuttlyUrl(input.apiKey, input.query);

  let response: Response;
  let payload: unknown;
  try {
    response = await input.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: input.signal,
    });
    payload = await readCuttlyPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    const errorMessage = error instanceof Error ? error.message : "Unknown transport error";
    const normalizedMessage = errorMessage.toLowerCase();
    const isTimeout =
      (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) ||
      normalizedMessage.includes("timeout") ||
      normalizedMessage.includes("timed out");
    throw new ProviderRequestError(isTimeout ? 504 : 502, `Cuttly request failed: ${errorMessage}`);
  }

  if (!response.ok) {
    throw mapCuttlyTransportError(response, payload, input.mode);
  }

  maybeThrowCuttlyPayloadError(payload, input.mode);
  return payload;
}

function buildCuttlyUrl(apiKey: string, query: Record<string, CuttlyQueryValue>): URL {
  const url = new URL(cuttlyApiPath, cuttlyApiBaseUrl);
  url.searchParams.set("key", apiKey);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function readCuttlyPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function maybeThrowCuttlyPayloadError(payload: unknown, mode: CuttlyMode): void {
  if (isAuthFalse(payload)) {
    throw createCuttlyAuthError(mode, "Invalid API key");
  }

  const objectPayload = optionalRecord(payload);
  const hasKnownWrapper = objectPayload?.url !== undefined || objectPayload?.stats !== undefined;
  if (hasKnownWrapper) {
    return;
  }

  const message = extractCuttlyMessage(payload, "");
  if (message) {
    throw mapCuttlyMessageToError(message, mode);
  }
}

function isAuthFalse(payload: unknown): boolean {
  return optionalRecord(payload)?.auth === false;
}

function mapCuttlyTransportError(response: Response, payload: unknown, mode: CuttlyMode): ProviderRequestError {
  const message = extractCuttlyMessage(payload, `Cuttly request failed with status ${response.status}`);
  if (response.status === 401 || response.status === 403 || isAuthFalse(payload)) {
    return createCuttlyAuthError(mode, message);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status === 400) {
    return mapCuttlyMessageToError(message, mode);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function mapCuttlyMessageToError(message: string, mode: CuttlyMode): ProviderRequestError {
  const normalized = message.trim().toLowerCase();
  if (
    normalized.includes("invalid api key") ||
    normalized.includes("api key is incorrect") ||
    normalized.includes("auth:false")
  ) {
    return createCuttlyAuthError(mode, message);
  }
  if (
    normalized.includes("too many requests") ||
    normalized.includes("monthly link limit") ||
    normalized.includes("shortening limit") ||
    normalized.includes("subscription has expired") ||
    normalized.includes("insufficient subscription level")
  ) {
    return new ProviderRequestError(429, message);
  }
  if (
    normalized.includes("incorrect date format") ||
    normalized.includes("didn't pass the validation") ||
    normalized.includes("blocked domain") ||
    normalized.includes("already been shortened") ||
    normalized.includes("already taken") ||
    normalized.includes("not a link") ||
    normalized.includes("url does not exist") ||
    normalized.includes("do not own")
  ) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(502, message);
}

function createCuttlyAuthError(mode: CuttlyMode, message: string): ProviderRequestError {
  return new ProviderRequestError(mode === "validate" ? 400 : 401, message);
}

function extractCuttlyMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "string") {
    return payload.trim() || fallback;
  }
  const objectPayload = optionalRecord(payload);
  for (const key of ["message", "error", "msg", "errorMessage"] as const) {
    const message = optionalString(objectPayload?.[key]);
    if (message) {
      return message;
    }
  }
  return fallback;
}

function requireStringField(value: unknown, fieldName: string): string {
  const stringValue = optionalString(value);
  if (!stringValue) {
    throw new ProviderRequestError(502, `Cuttly response is missing ${fieldName}`);
  }
  return stringValue;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function readCount(value: unknown): number {
  const parsed = readNumber(value);
  if (parsed === undefined) {
    return 0;
  }
  return Math.max(0, Math.trunc(parsed));
}

function readReferrers(value: unknown): Array<{ domain: string; clicks: number }> {
  return readObjectList(value)
    .map((entry) => {
      const domain = optionalString(entry.link) ?? optionalString(entry.domain);
      return domain ? { domain, clicks: readCount(entry.clicks) } : null;
    })
    .filter((entry): entry is { domain: string; clicks: number } => entry !== null);
}

function readTaggedBreakdown(value: unknown): Array<{ tag: string; clicks: number }> {
  return readObjectList(value)
    .map((entry) => {
      const tag = optionalString(entry.tag);
      return tag ? { tag, clicks: readCount(entry.clicks) } : null;
    })
    .filter((entry): entry is { tag: string; clicks: number } => entry !== null);
}

function readBots(value: unknown): Array<{ name: string; clicks: number }> {
  const objectValue = optionalRecord(value);
  const nestedValue = objectValue?.bots ?? objectValue?.items ?? value;
  return readObjectList(nestedValue)
    .map((entry) => {
      const name = optionalString(entry.name);
      return name ? { name, clicks: readCount(entry.clicks) } : null;
    })
    .filter((entry): entry is { name: string; clicks: number } => entry !== null);
}

function readBotCount(value: unknown): number {
  const directCount = readNumber(value);
  if (directCount !== undefined) {
    return Math.max(0, Math.trunc(directCount));
  }
  const objectValue = optionalRecord(value);
  const nestedCount =
    readNumber(objectValue?.clicks) ?? readNumber(objectValue?.total) ?? readNumber(objectValue?.totalClicks);
  if (nestedCount !== undefined) {
    return Math.max(0, Math.trunc(nestedCount));
  }
  return readBots(value).reduce((sum, entry) => sum + entry.clicks, 0);
}

function readObjectList(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }
  const objectValue = optionalRecord(value);
  if (!objectValue) {
    return [];
  }
  if (looksLikeBreakdownEntry(objectValue)) {
    return [objectValue];
  }
  return Object.values(objectValue).filter(isRecord);
}

function looksLikeBreakdownEntry(value: Record<string, unknown>): boolean {
  return "clicks" in value && ("tag" in value || "link" in value || "domain" in value || "name" in value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
