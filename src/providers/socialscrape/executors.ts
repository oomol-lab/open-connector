import type { QueryValue } from "../../core/request.ts";
import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-executors.ts";

import { optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { queryParams } from "../../core/request.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  defaultProviderRequestTimeoutMs,
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
  readProviderJsonBody,
  requiredInputString,
  runProviderRequest,
} from "../provider-runtime.ts";

const service = "socialscrape";
const apiBaseUrl = "https://api.socialscrape.dev";

/** SocialScrape holds a request for about 25 seconds before answering with a job, so the first call waits longer. */
const firstRequestTimeoutMs = 40_000;
/** How long a queued job is polled before the action gives up, and how often. */
const jobWaitMs = 90_000;
const jobPollIntervalMs = 3_000;
const jobIdPattern = /^job_[A-Za-z0-9]+$/;
/** The error codes that mean the key itself was refused. */
const credentialErrorCodes = new Set(["unauthorized", "forbidden"]);

type Handler = ProviderRuntimeHandler<ApiKeyProviderContext>;
type RequestPhase = "validate" | "execute";
type SocialscrapeContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;

/** A successful SocialScrape answer: the `data` object and the request details around it. */
interface SocialscrapeAnswer {
  status: number;
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

/**
 * Call SocialScrape and return the finished answer.
 *
 * A request still running after about 25 seconds is answered with a job
 * (HTTP 202, `data.object: "job"`) on any endpoint. That job is polled here,
 * for free, until it finishes or the wait budget runs out, so an action never
 * hands a job back as if it were the result.
 */
async function socialscrapeRequest(
  path: string,
  context: SocialscrapeContext,
  query: Record<string, QueryValue> = {},
  phase: RequestPhase = "execute",
): Promise<SocialscrapeAnswer> {
  let answer = await socialscrapeFetch(path, context, query, phase, firstRequestTimeoutMs);
  if (!isJob(answer)) {
    return answer;
  }

  const jobId = optionalString(answer.data.job_id) ?? "";
  if (!jobIdPattern.test(jobId)) {
    throw providerResponseError("SocialScrape queued a job without a usable job id");
  }
  const jobPath = `/v1/jobs/${jobId}`;
  const startedAt = Date.now();
  const remainingMs = (): number => jobWaitMs - (Date.now() - startedAt);
  const stillRunning = (): ProviderRequestError =>
    new ProviderRequestError(
      504,
      `SocialScrape job ${jobId} was still running after ${Math.round(jobWaitMs / 1000)} seconds`,
      { jobId, pollUrl: new URL(jobPath, apiBaseUrl).toString() },
    );
  for (;;) {
    if (remainingMs() <= 0 || context.signal?.aborted) {
      throw stillRunning();
    }
    await sleep(Math.min(jobPollIntervalMs, remainingMs()), context.signal);
    // The sleep may have used up the budget, and a poll must not outlive what is left of it.
    const remaining = remainingMs();
    if (remaining <= 0 || context.signal?.aborted) {
      throw stillRunning();
    }
    try {
      answer = await socialscrapeFetch(
        jobPath,
        context,
        {},
        phase,
        Math.min(defaultProviderRequestTimeoutMs, remaining),
      );
    } catch (error) {
      // A poll that timed out says nothing about the job: try again while the budget lasts.
      if (error instanceof ProviderRequestError && error.status === 504) {
        continue;
      }
      throw error;
    }
    if (!isJob(answer)) {
      return answer;
    }
  }
}

/** Whether an answer is a job that is still running, not a result. */
function isJob(answer: SocialscrapeAnswer): boolean {
  return answer.status === 202 || answer.data.object === "job";
}

/** Wait, ending early when the caller gives up. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = (): void => {
      globalThis.clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const timer = globalThis.setTimeout(done, ms);
    signal?.addEventListener("abort", done, { once: true });
  });
}

/** Send one request and read its envelope. */
async function socialscrapeFetch(
  path: string,
  context: SocialscrapeContext,
  query: Record<string, QueryValue>,
  phase: RequestPhase,
  timeoutMs?: number,
): Promise<SocialscrapeAnswer> {
  return runProviderRequest({ label: "SocialScrape", signal: context.signal, timeoutMs }, async (signal) => {
    const url = new URL(path, apiBaseUrl);
    for (const [key, value] of Object.entries(queryParams(query))) url.searchParams.set(key, value);
    const response = await context.fetcher(url.toString(), {
      headers: { accept: "application/json", "user-agent": providerUserAgent, "x-api-key": context.apiKey },
      signal,
    });
    if (!response.ok) {
      // An error is classified by its status even when a proxy or gateway answered without JSON.
      const payload = await readProviderJsonBody(response, {
        emptyBody: "",
        trimEmptyBody: false,
        invalidJsonMessage: "SocialScrape returned invalid JSON",
        invalidJsonFallback: (text) => text.slice(0, 500),
      });
      throw socialscrapeRequestError(response.status, optionalRecord(payload), payload, phase);
    }
    const payload = await readProviderJsonBody(response, {
      emptyBody: "",
      trimEmptyBody: false,
      invalidJsonMessage: "SocialScrape returned invalid JSON",
    });
    const envelope = optionalRecord(payload);
    const data = optionalRecord(envelope?.data);
    if (!envelope || !data) {
      throw providerResponseError("SocialScrape returned an answer without a data object");
    }
    return {
      status: response.status,
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
  const code = optionalString(error?.code);
  const message = optionalString(error?.message) ?? `SocialScrape request failed with HTTP ${status}`;
  if (status === 402) {
    return new ProviderRequestError(402, message, payload, "insufficient_credit");
  }
  if (status === 401 || status === 403) {
    // SocialScrape also answers 403 for content it cannot return (`private`, `age_restricted`).
    // Only a refused key is a credential problem; a new key cannot fix the rest.
    if (code !== undefined && !credentialErrorCodes.has(code)) {
      return new ProviderRequestError(status, message, payload, "invalid_input");
    }
    if (phase === "validate") {
      return new ProviderRequestError(400, message, payload);
    }
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message, payload);
}
