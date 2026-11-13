import type { QueryValue } from "../../core/request.ts";
import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-executors.ts";

import { optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { queryParams } from "../../core/request.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
  readProviderJsonBody,
  requiredInputString,
  runProviderRequest,
} from "../provider-runtime.ts";

const service = "socialscrape";
const apiBaseUrl = "https://api.socialscrape.dev";

type Handler = ProviderRuntimeHandler<ApiKeyProviderContext>;
type RequestPhase = "validate" | "execute";

/** A successful SocialScrape answer: the `data` object and the request details around it. */
interface SocialscrapeAnswer {
  data: Record<string, unknown>;
  meta: Record<string, unknown>;
}

const socialscrapeActionHandlers: ProviderActionHandlers<"socialscrape", Handler> = {
  async get_credits(_input, context) {
    const { data, meta } = await socialscrapeRequest("/v1/account/credits", context);
    return { creditsRemaining: data.credits_remaining, teamId: data.team_id, meta };
  },
  async get_transcript(input, context) {
    const { data, meta } = await socialscrapeRequest("/v1/transcript", context, {
      url: requiredInputString(input.url, "url"),
      language: optionalString(input.language),
    });
    // A transcript this action asks for is answered in one request. SocialScrape only queues a job
    // for long audio it was explicitly allowed to transcribe, which this action never asks for.
    if (data.object === "job") {
      throw providerResponseError("SocialScrape queued a transcription job instead of returning a transcript");
    }
    return { transcript: data, meta };
  },
  async get_profile(input, context) {
    const platform = requiredInputString(input.platform, "platform");
    const { data, meta } = await socialscrapeRequest(`/v1/${encodeURIComponent(platform)}/profile`, context, {
      handle: bareHandle(input.handle),
    });
    return { profile: data, meta };
  },
  async list_profile_posts(input, context) {
    const platform = requiredInputString(input.platform, "platform");
    // TikTok publishes videos only, so its list lives under /profile/videos.
    const list = platform === "tiktok" ? "videos" : "posts";
    const { data, meta } = await socialscrapeRequest(`/v1/${encodeURIComponent(platform)}/profile/${list}`, context, {
      handle: bareHandle(input.handle),
      cursor: optionalString(input.cursor),
    });
    if (!Array.isArray(data.items)) {
      throw providerResponseError("SocialScrape list_profile_posts returned no list of posts");
    }
    return {
      posts: data.items,
      cursor: optionalString(data.cursor) ?? null,
      hasMore: optionalBoolean(data.has_more) ?? false,
      meta,
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, socialscrapeActionHandlers, {
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: apiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const { data } = await socialscrapeRequest(
      "/v1/account/credits",
      { apiKey: input.apiKey, fetcher, signal },
      {},
      "validate",
    );
    const teamId = optionalString(data.team_id);
    return {
      profile: {
        accountId: teamId ? `socialscrape:team:${teamId}` : "socialscrape-api-key",
        displayName: teamId ? `SocialScrape ${teamId}` : "SocialScrape API Key",
      },
      metadata: {
        apiBaseUrl,
        validationEndpoint: "/v1/account/credits",
        creditsRemaining: optionalInteger(data.credits_remaining),
      },
    };
  },
};

/** Read a handle input without its leading at sign. */
function bareHandle(value: unknown): string {
  const handle = requiredInputString(value, "handle");
  return handle.startsWith("@") ? handle.slice(1) : handle;
}

async function socialscrapeRequest(
  path: string,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  query: Record<string, QueryValue> = {},
  phase: RequestPhase = "execute",
): Promise<SocialscrapeAnswer> {
  return runProviderRequest({ label: "SocialScrape", signal: context.signal }, async (signal) => {
    const url = new URL(path, apiBaseUrl);
    for (const [key, value] of Object.entries(queryParams(query))) url.searchParams.set(key, value);
    const response = await context.fetcher(url.toString(), {
      headers: { accept: "application/json", "user-agent": providerUserAgent, "x-api-key": context.apiKey },
      signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: "",
      trimEmptyBody: false,
      invalidJsonMessage: "SocialScrape returned invalid JSON",
    });
    const envelope = optionalRecord(payload);
    if (!response.ok) {
      throw socialscrapeRequestError(response.status, envelope, payload, phase);
    }
    const data = optionalRecord(envelope?.data);
    if (!envelope || !data) {
      throw providerResponseError("SocialScrape returned an answer without a data object");
    }
    return {
      data,
      meta: {
        requestId: optionalString(envelope.request_id) ?? "",
        creditsCharged: optionalInteger(envelope.credits_charged) ?? 0,
        creditsRemaining: optionalInteger(envelope.credits_remaining) ?? null,
        cached: optionalBoolean(envelope.cached) ?? false,
      },
    };
  });
}

/**
 * Turn a SocialScrape error answer, `{ error: { code, message, retryable } }`,
 * into the execution error the runtime can express.
 */
function socialscrapeRequestError(
  status: number,
  envelope: Record<string, unknown> | undefined,
  payload: unknown,
  phase: RequestPhase,
): ProviderRequestError {
  const error = optionalRecord(envelope?.error);
  const message = optionalString(error?.message) ?? `SocialScrape request failed with HTTP ${status}`;
  if (status === 402) {
    return new ProviderRequestError(402, message, payload, "insufficient_credit");
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message, payload);
}
