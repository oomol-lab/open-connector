import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalNumber,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "scrapingdog";
const scrapingdogBaseUrl = "https://api.scrapingdog.com";

type ScrapingdogPhase = "validate" | "execute";
type ScrapingdogQueryValue = string | number | boolean | undefined;
type ScrapingdogActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const scrapingdogActionHandlers: ProviderActionHandlers<"scrapingdog", ScrapingdogActionHandler> = {
  async fetch_html(input, context): Promise<unknown> {
    const response = await requestScrapingdogRaw(
      "scrape",
      compactObject({
        url: requiredString(input.url, "url", invalidInputError),
        dynamic: optionalBoolean(input.dynamic),
      }),
      context,
    );
    const body = await response.text();
    if (!response.ok) {
      throw createScrapingdogError(response.status, body, "execute");
    }

    return compactObject({
      html: body,
      statusCode: response.status,
      contentType: response.headers.get("content-type") ?? undefined,
    });
  },
  async google_search(input, context): Promise<unknown> {
    const payload = await requestScrapingdogJson(
      "google",
      compactObject({
        query: requiredString(input.query, "query", invalidInputError),
        domain: optionalString(input.domain),
        country: optionalString(input.country),
        cr: optionalString(input.cr),
        uule: optionalString(input.uule),
        location: optionalString(input.location),
        language: optionalString(input.language),
        lr: optionalString(input.lr),
        ludocid: optionalString(input.ludocid),
        lsig: optionalString(input.lsig),
        kgmid: optionalString(input.kgmid),
        si: optionalString(input.si),
        ibp: optionalString(input.ibp),
        uds: optionalString(input.uds),
        tbs: optionalString(input.tbs),
        safe: optionalString(input.safe),
        nfpr: optionalBooleanAsInteger(input.nfpr),
        filter: optionalBooleanAsInteger(input.filter),
        page: optionalNumber(input.page),
        results: optionalNumber(input.results),
        advance_search: optionalBoolean(input.advanceSearch),
        mob_search: optionalBoolean(input.mobSearch),
        html: optionalBoolean(input.html),
      }),
      context,
      "execute",
    );

    return { data: readObject(payload, "Scrapingdog response") };
  },
  async google_maps_search(input, context): Promise<unknown> {
    const payload = await requestScrapingdogJson(
      "google_maps",
      compactObject({
        query: requiredString(input.query, "query", invalidInputError),
        ll: optionalString(input.ll),
        domain: optionalString(input.domain),
        language: optionalString(input.language),
        country: optionalString(input.country),
        page: optionalNumber(input.page),
      }),
      context,
      "execute",
    );

    return { data: readObject(payload, "Scrapingdog response") };
  },
  async google_maps_place(input, context): Promise<unknown> {
    const placeId = optionalString(input.placeId);
    const dataId = optionalString(input.dataId);
    if (!placeId && !dataId) {
      throw new ProviderRequestError(400, "placeId or dataId is required");
    }

    const payload = await requestScrapingdogJson(
      "google_maps/places",
      compactObject({
        data_id: dataId,
        place_id: placeId,
        country: optionalString(input.country),
        type: optionalString(input.type) ?? (dataId ? "place" : undefined),
      }),
      context,
      "execute",
    );

    return { data: readObject(payload, "Scrapingdog response") };
  },
  async google_scholar_search(input, context): Promise<unknown> {
    const payload = await requestScrapingdogJson(
      "google_scholar",
      compactObject({
        query: requiredString(input.query, "query", invalidInputError),
        html: optionalBoolean(input.html),
        country: optionalString(input.country),
        language: optionalString(input.language),
        lr: optionalString(input.lr),
        cites: optionalString(input.cites),
        cluster: optionalString(input.cluster),
        as_ylo: optionalString(input.asYlo),
        as_yhi: optionalString(input.asYhi),
        as_sdt: optionalString(input.asSdt),
        safe: optionalString(input.safe),
        filter: optionalBooleanAsInteger(input.filter),
        as_vis: optionalBooleanAsInteger(input.asVis),
        as_rr: optionalBooleanAsInteger(input.asRr),
        page: optionalNumber(input.page),
        results: optionalNumber(input.results),
      }),
      context,
      "execute",
    );

    return { data: readObject(payload, "Scrapingdog response") };
  },
  async get_account_usage(_input, context): Promise<unknown> {
    return { usage: await requestScrapingdogAccount(context, "execute") };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, scrapingdogActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const usage = await requestScrapingdogAccount(
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      "validate",
    );

    return {
      profile: {
        accountId: "scrapingdog",
        displayName: "Scrapingdog API Key",
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: "/account",
        apiBaseUrl: scrapingdogBaseUrl,
        usage,
      },
    };
  },
};

async function requestScrapingdogAccount(
  context: ApiKeyProviderContext,
  phase: ScrapingdogPhase,
): Promise<Record<string, unknown>> {
  const payload = await requestScrapingdogJson("account", {}, context, phase);
  return readObject(payload, "Scrapingdog account response");
}

async function requestScrapingdogJson(
  path: string,
  query: Record<string, ScrapingdogQueryValue>,
  context: ApiKeyProviderContext,
  phase: ScrapingdogPhase,
): Promise<unknown> {
  const response = await requestScrapingdogRaw(path, query, context);
  const body = await response.text();
  if (!response.ok) {
    throw createScrapingdogError(response.status, body, phase);
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Scrapingdog returned invalid JSON");
  }
}

async function requestScrapingdogRaw(
  path: string,
  query: Record<string, ScrapingdogQueryValue>,
  context: ApiKeyProviderContext,
): Promise<Response> {
  try {
    return await context.fetcher(buildScrapingdogUrl(path, query, context.apiKey), {
      method: "GET",
      headers: {
        accept: "*/*",
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      isTimeoutNetworkError(error) ? 504 : 502,
      error instanceof Error ? `Scrapingdog request failed: ${error.message}` : "Scrapingdog request failed",
    );
  }
}

function buildScrapingdogUrl(path: string, query: Record<string, ScrapingdogQueryValue>, apiKey: string): URL {
  const url = new URL(path, ensureTrailingSlash(scrapingdogBaseUrl));
  url.searchParams.set("api_key", apiKey);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function createScrapingdogError(status: number, body: string, phase: ScrapingdogPhase): ProviderRequestError {
  const message = extractScrapingdogMessage(body) ?? `Scrapingdog request failed with ${status}`;
  if (phase === "validate" && [400, 401, 403].includes(status)) {
    return new ProviderRequestError(400, message);
  }
  if (status === 403) {
    return new ProviderRequestError(429, message);
  }
  return new ProviderRequestError(status || 500, message);
}

function extractScrapingdogMessage(body: string): string | undefined {
  const trimmed = body.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const record = optionalRecord(parsed);
    if (record) {
      return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.detail);
    }
  } catch {}

  return trimmed;
}

function readObject(value: unknown, fieldName: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${fieldName} is invalid`);
  }
  return record;
}

function optionalBooleanAsInteger(value: unknown): number | undefined {
  const booleanValue = optionalBoolean(value);
  if (booleanValue === undefined) {
    return undefined;
  }
  return booleanValue ? 1 : 0;
}

function invalidInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

function isTimeoutNetworkError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}
