import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderFetch } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { createProviderTimeout, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const getyoutubetranscriptApiBaseUrl = "https://getyoutubetranscript.com/api/v1";

type RequestPhase = "validate" | "execute";
type ActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type ActionHandler = (input: Record<string, unknown>, context: ActionContext) => Promise<unknown>;

export const getyoutubetranscriptActionHandlers: ProviderActionHandlers<"getyoutubetranscript", ActionHandler> = {
  get_credits(_input, context) {
    return apiGet("/credits", {}, context, "execute");
  },
  get_youtube_transcript(input, context) {
    return apiGet(
      "/transcript",
      { v: input.video, language: input.language, timestamps: input.timestamps === true ? "true" : undefined },
      context,
      "execute",
    );
  },
  search_youtube(input, context) {
    return apiGet(
      "/search",
      input.pageToken === undefined
        ? { q: input.query, type: input.type }
        : { page_token: input.pageToken, type: input.type },
      context,
      "execute",
    );
  },
  list_youtube_channel_videos(input, context) {
    return apiGet(
      "/channel/videos",
      input.continuation === undefined ? { channel: input.channel } : { continuation: input.continuation },
      context,
      "execute",
    );
  },
  get_youtube_playlist(input, context) {
    return apiGet(
      "/playlist",
      input.continuation === undefined ? { list: input.list } : { continuation: input.continuation },
      context,
      "execute",
    );
  },
};

export async function validateGetyoutubetranscriptCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  // /credits costs no credits, so validating a key is free.
  const credits = optionalRecord(await apiGet("/credits", {}, { apiKey, fetcher, signal }, "validate"));
  if (!credits) {
    throw new ProviderRequestError(502, "GetYouTubeTranscript credits response was not an object");
  }
  const plan = optionalString(credits.plan);
  return {
    profile: {
      accountId: "api_key",
      displayName: plan ? `GetYouTubeTranscript (${plan} plan)` : "GetYouTubeTranscript API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/credits",
      apiBaseUrl: getyoutubetranscriptApiBaseUrl,
      plan,
      planCreditsLeft: optionalNumber(credits.plan_credits_left),
      topupCreditsLeft: optionalNumber(credits.topup_credits_left),
    }),
  };
}

/** GET a path and return the `data` object from the `{ success, data }` envelope. */
async function apiGet(
  path: string,
  query: Record<string, unknown>,
  context: ActionContext,
  phase: RequestPhase,
): Promise<unknown> {
  const url = new URL(`${getyoutubetranscriptApiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  let response: Response;
  let payload: unknown;
  // Bounds the fetch and the body read so a stalled upstream can't leave the action pending.
  const timeout = createProviderTimeout(context.signal);
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    payload = await readPayload(response);
  } catch (error) {
    if (timeout.didTimeout()) {
      throw new ProviderRequestError(504, "GetYouTubeTranscript request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `GetYouTubeTranscript request failed: ${error.message}`
        : "GetYouTubeTranscript request failed",
    );
  } finally {
    timeout.cleanup();
  }

  const envelope = optionalRecord(payload);
  if (!response.ok || envelope?.success === false) {
    throw createError(response, payload, phase);
  }
  if (!envelope || !("data" in envelope)) {
    throw new ProviderRequestError(502, "GetYouTubeTranscript response did not include data", payload);
  }
  return envelope.data;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createError(response: Response, payload: unknown, phase: RequestPhase): ProviderRequestError {
  const record = optionalRecord(payload);
  const message = optionalString(record?.message) ?? optionalString(record?.code) ?? response.statusText;
  const status = response.ok ? 502 : response.status;
  if (status === 429) {
    return new ProviderRequestError(429, message || "GetYouTubeTranscript rate limit exceeded", payload);
  }
  if (status === 401 || status === 403) {
    // A rejected key during validation is a bad input, not an expired session.
    return new ProviderRequestError(
      phase === "validate" ? 400 : 401,
      message || "GetYouTubeTranscript API key is invalid",
      payload,
    );
  }
  if (status === 400 || status === 402 || status === 404) {
    return new ProviderRequestError(status, message || "GetYouTubeTranscript request failed", payload);
  }
  return new ProviderRequestError(status || 502, message || "GetYouTubeTranscript request failed", payload);
}
