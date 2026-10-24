import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-executors.ts";

import { sha256Hex } from "../../core/aws-sigv4.ts";
import { objectArray, optionalInteger, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  ProviderRequestError,
  parseProviderJsonBodyText,
  providerResponseError,
  providerUserAgent,
  readProviderErrorTextBody,
  readProviderJsonBody,
  requiredInputNumber,
  requiredResponseRecord,
  runProviderRequest,
  setSearchParams,
} from "../provider-runtime.ts";

interface WisburgRequestInput {
  path: string;
  query?: Record<string, string | undefined>;
}

/** Output key a detail action nests its resource under. */
export type WisburgDetailKey = "report" | "article" | "log";

export const wisburgApiBaseUrl = "https://api-omen.wisburg.com";

export const wisburgActionHandlers: ProviderActionHandlers<"wisburg", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  list_reports: (input, context) => listWisburgResource(input, context, "api/reports"),
  get_report: (input, context) => getWisburgResource(input, context, "api/reports", "report"),
  list_archives: (input, context) => listWisburgResource(input, context, "api/archives"),
  get_archive: (input, context) => getWisburgResource(input, context, "api/archives", "report"),
  list_company_reports: (input, context) => listWisburgResource(input, context, "api/company-reports"),
  get_company_report: (input, context) => getWisburgResource(input, context, "api/company-reports", "report"),
  list_earnings_calls: (input, context) => listWisburgResource(input, context, "api/earningscalls"),
  get_earnings_call: (input, context) => getWisburgResource(input, context, "api/earningscalls", "report"),
  list_articles: (input, context) => listWisburgResource(input, context, "api/articles"),
  get_article: (input, context) => getWisburgResource(input, context, "api/articles", "article"),
  list_market_daily: (input, context) => listWisburgResource(input, context, "api/market-daily"),
  list_feed: (input, context) => listWisburgResource(input, context, "api/feed"),
  list_images: (input, context) => listWisburgResource(input, context, "api/images"),
  list_am_reports: (input, context) => listWisburgResource(input, context, "api/am-reports"),
  get_am_report: (input, context) => getWisburgResource(input, context, "api/am-reports", "report"),
  list_mikko_logs: (input, context) => listWisburgResource(input, context, "api/mikko-logs"),
  get_mikko_log: (input, context) => getWisburgResource(input, context, "api/mikko-logs", "log"),
};

export async function validateWisburgCredential(
  input: { apiKey: string },
  { fetcher, signal }: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  try {
    await wisburgRequest({ apiKey: input.apiKey, fetcher, signal }, { path: "api/feed", query: { first: "1" } });
  } catch (error) {
    if (error instanceof ProviderRequestError && error.status === 401) {
      throw new ProviderRequestError(400, error.message, error.details);
    }
    // A 403 proves the key was accepted; the feed is simply outside this key's subscription.
    if (!(error instanceof ProviderRequestError) || error.status !== 403) throw error;
  }
  return {
    profile: {
      accountId: `wisburg:${sha256Hex(input.apiKey).slice(0, 32)}`,
      displayName: "Wisburg API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: wisburgApiBaseUrl,
      validationEndpoint: "/api/feed",
      credentialHelpUrl: "https://open-docs.wisburg.com/docs/getting-started/first-call",
    },
  };
}

async function listWisburgResource(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  path: string,
): Promise<Record<string, unknown>> {
  const envelope = await wisburgRequest(context, {
    path,
    query: {
      first: optionalInteger(input.first)?.toString(),
      after: optionalString(input.after),
      query: optionalString(input.query),
      startTime: optionalString(input.startTime),
      endTime: optionalString(input.endTime),
    },
  });
  const data = requiredResponseRecord(envelope.data, "Wisburg list data");
  const pageInfo = requiredResponseRecord(data.page_info, "Wisburg list page_info");
  const endCursor = pageInfo.end_cursor;
  if (endCursor != null && typeof endCursor !== "string") {
    throw providerResponseError("Wisburg list page_info.end_cursor must be a string");
  }
  return {
    requestId: optionalString(envelope.request_id) ?? "",
    items: objectArray(data.items, "Wisburg list data.items", providerResponseError),
    pageInfo: { endCursor: optionalString(endCursor) },
  };
}

async function getWisburgResource(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
  path: string,
  key: WisburgDetailKey,
): Promise<Record<string, unknown>> {
  const id = requiredInputNumber(input.id, "id");
  const envelope = await wisburgRequest(context, { path: `${path}/${id}` });
  return {
    requestId: optionalString(envelope.request_id) ?? "",
    [key]: requiredResponseRecord(envelope.data, "Wisburg detail data"),
  };
}

async function wisburgRequest(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  input: WisburgRequestInput,
): Promise<Record<string, unknown>> {
  return runProviderRequest({ signal: context.signal, label: "Wisburg" }, async (signal) => {
    const url = new URL(input.path, `${wisburgApiBaseUrl}/`);
    setSearchParams(url, input.query ?? {});
    const response = await context.fetcher(url, {
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal,
    });
    if (!response.ok) {
      throw await readWisburgHttpError(response);
    }
    const payload = await readProviderJsonBody(response, {
      emptyBody: {},
      invalidJsonMessage: "Wisburg returned invalid JSON",
    });
    const envelope = requiredResponseRecord(payload, "Wisburg response");
    const code = optionalNumber(envelope.code);
    if (code !== undefined && code !== 200) {
      throw mapWisburgError(code, envelope);
    }
    // The envelope marks failure as status 1 even when the code field disagrees; fall back to the 1002 internal-error code when none is present.
    if (optionalNumber(envelope.status) === 1) {
      throw mapWisburgError(code ?? 1002, envelope);
    }
    return envelope;
  });
}

// Keep the HTTP status for non-JSON gateway error pages; the JSON envelope, when present, only supplies the code and message.
async function readWisburgHttpError(response: Response): Promise<ProviderRequestError> {
  const text = await readProviderErrorTextBody(response, "Wisburg error response");
  const parsed = parseProviderJsonBodyText(text, {
    emptyBody: {},
    invalidJsonMessage: "Wisburg returned invalid JSON",
    invalidJsonFallback: () => ({}),
  });
  const envelope = optionalRecord(parsed) ?? {};
  return mapWisburgError(optionalNumber(envelope.code) ?? response.status, envelope);
}

function mapWisburgError(code: number, envelope: Record<string, unknown>): ProviderRequestError {
  const message = optionalString(envelope.message) ?? `Wisburg request failed (${code})`;
  // Besides the documented 401/403/404/429 codes, a bare gateway 4xx such as 414 stays a client error.
  if (code >= 400 && code < 500) {
    return new ProviderRequestError(code, message, envelope);
  }
  // 1001 marks invalid parameters and 1004 an out-of-range pagination cursor.
  if (code === 1001 || code === 1004) {
    return new ProviderRequestError(400, message, envelope);
  }
  return new ProviderRequestError(502, message, envelope);
}
