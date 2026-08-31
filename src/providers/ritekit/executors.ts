import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalBoolean, optionalInteger, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
  requiredInputString,
} from "../provider-runtime.ts";

const service = "ritekit";
const apiBaseUrl = "https://api.ritekit.com";
const maxResponseBytes = 10 * 1024 * 1024;
type RiteKitPhase = "validate" | "execute";
type QueryEntry = [string, unknown];

export const riteKitActionHandlers: ProviderActionHandlers<
  "ritekit",
  (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>
> = {
  async get_hashtag_stats(input, context) {
    const payload = await requestRiteKit(context, "/v1/stats/multiple-hashtags", [
      ["tags", readInputStrings(input.tags).join(",")],
    ]);
    return {
      code: readInteger(payload.code),
      message: readText(payload.message),
      hashtags: readStrings(payload.hashtags),
      stats: normalizeMetrics(payload.stats),
      colorLabels: readStrings(payload.color),
    };
  },
  async auto_hashtag(input, context) {
    const payload = await requestRiteKit(context, "/v1/stats/auto-hashtag", [
      ["post", requiredInputString(input.post, "post")],
      ["maxHashtags", input.maxHashtags],
      ["hashtagPosition", input.hashtagPosition],
    ]);
    return { code: readInteger(payload.code), message: readText(payload.message), post: readText(payload.post) ?? "" };
  },
  async suggest_hashtags_for_text(input, context) {
    return requestSuggestions(context, "/v1/stats/hashtag-suggestions", [
      ["text", requiredInputString(input.text, "text")],
    ]);
  },
  async suggest_hashtags_for_url(input, context) {
    return requestSuggestions(context, "/v2/stats/hashtags-for-url", [["url", input.pageUrl]]);
  },
  async suggest_hashtags_for_image(input, context) {
    return requestSuggestions(context, "/v1/stats/hashtag-suggestions-image", [["image", input.imageUrl]]);
  },
  async list_trending_hashtags(input, context) {
    const payload = await requestRiteKit(context, "/v1/search/trending", [
      ["green", booleanQuery(input.green)],
      ["latin", booleanQuery(input.latin)],
    ]);
    return {
      code: readInteger(payload.code),
      message: readText(payload.message),
      hashtags: normalizeTrending(payload.tags),
    };
  },
  async clean_banned_instagram_hashtags(input, context) {
    const payload = await requestRiteKit(context, "/v2/instagram/hashtags-cleaner", [
      ["post", requiredInputString(input.post, "post")],
    ]);
    return {
      message: readText(payload.message),
      post: readText(payload.post) ?? "",
      bannedHashtags: readStrings(payload.bannedHashtags),
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, riteKitActionHandlers, {
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: apiBaseUrl,
  auth: { type: "api_key_query", name: "client_id" },
  skipDnsValidation: true,
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestRiteKit(
      { apiKey: input.apiKey, fetcher, signal },
      "/v1/search/trending",
      [
        ["green", "1"],
        ["latin", "1"],
      ],
      "validate",
    );
    return {
      profile: { accountId: "ritekit", displayName: "RiteKit Client ID" },
      grantedScopes: [],
      metadata: {
        validationEndpoint: "/v1/search/trending",
        sampleTagCount: normalizeTrending(payload.tags).length,
      },
    };
  },
};

async function requestSuggestions(
  context: ApiKeyProviderContext,
  path: string,
  query: QueryEntry[],
): Promise<Record<string, unknown>> {
  const payload = await requestRiteKit(context, path, query);
  return {
    code: readInteger(payload.code),
    message: readText(payload.message),
    hashtags: normalizeMetrics(payload.data ?? payload.hashtags),
  };
}

async function requestRiteKit(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  path: string,
  query: QueryEntry[],
  phase: RiteKitPhase = "execute",
): Promise<Record<string, unknown>> {
  const url = new URL(path, apiBaseUrl);
  url.searchParams.set("client_id", context.apiKey);
  for (const [name, value] of query) {
    if (value != null && value !== "") url.searchParams.set(name, String(value));
  }
  const timeout = createProviderTimeout(context.signal);
  try {
    const response = await context.fetcher(url, {
      method: "GET",
      headers: { accept: "application/json", "user-agent": providerUserAgent },
      signal: timeout.signal,
    });
    const payload = await readPayload(response);
    const record = optionalRecord(payload);
    if (!response.ok || record?.result === false) throw createError(response.status, payload, phase);
    if (!record) throw new ProviderRequestError(502, "RiteKit returned an invalid payload");
    return record;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout()) throw new ProviderRequestError(504, "RiteKit request timed out");
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `RiteKit request failed: ${error.message}` : "RiteKit request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await readProviderTextBody(response, "RiteKit response", maxResponseBytes);
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "RiteKit returned invalid JSON");
  }
}

function createError(status: number, payload: unknown, phase: RiteKitPhase): ProviderRequestError {
  const record = optionalRecord(payload);
  const payloadCode = optionalInteger(record?.code);
  const effectiveStatus = payloadCode !== undefined && payloadCode >= 400 ? payloadCode : status;
  const message =
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    optionalString(record?.error_description) ??
    `RiteKit request failed with status ${effectiveStatus || 500}`;
  if (effectiveStatus === 429) return new ProviderRequestError(429, message);
  if (phase === "validate" && effectiveStatus >= 400 && effectiveStatus < 500)
    return new ProviderRequestError(400, message);
  if (effectiveStatus === 401 || effectiveStatus === 403) return new ProviderRequestError(effectiveStatus, message);
  if (effectiveStatus >= 400 && effectiveStatus < 500) return new ProviderRequestError(effectiveStatus, message);
  return new ProviderRequestError(effectiveStatus >= 400 ? effectiveStatus : 502, message);
}

function normalizeMetrics(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const record = optionalRecord(item);
        if (!record) return [];
        const tag = readText(record.tag) ?? readText(record.hashtag) ?? "";
        return [
          {
            hashtag: readText(record.hashtag) ?? tag,
            tag,
            tweets: optionalNumber(record.tweets) ?? null,
            exposure: optionalNumber(record.exposure) ?? null,
            retweets: optionalNumber(record.retweets) ?? null,
            images: optionalNumber(record.images) ?? null,
            links: optionalNumber(record.links) ?? null,
            mentions: optionalNumber(record.mentions) ?? null,
            color: optionalInteger(record.color) ?? null,
            mediaCount: optionalNumber(record.mediaCount) ?? null,
            raw: record,
          },
        ];
      })
    : [];
}

function normalizeTrending(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const record = optionalRecord(item);
        return record
          ? [
              {
                tag: readText(record.tag) ?? "",
                tweets: optionalNumber(record.tweets) ?? null,
                exposure: optionalNumber(record.exposure) ?? null,
                retweets: optionalNumber(record.retweets) ?? null,
                links: optionalNumber(record.links) ?? null,
                photos: optionalNumber(record.photos) ?? null,
                mentions: optionalNumber(record.mentions) ?? null,
                color: optionalInteger(record.color) ?? null,
                raw: record,
              },
            ]
          : [];
      })
    : [];
}

function readStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim())
    : [];
}
function readInputStrings(value: unknown): string[] {
  if (!Array.isArray(value)) throw new ProviderRequestError(400, "tags must be an array");
  return value.map((item) => requiredInputString(item, "tag"));
}
function readText(value: unknown): string | null {
  return optionalString(value) ?? null;
}
function readInteger(value: unknown): number | null {
  return optionalInteger(value) ?? null;
}
function booleanQuery(value: unknown): string | undefined {
  const boolean = optionalBoolean(value);
  return boolean === undefined ? undefined : boolean ? "1" : "0";
}
