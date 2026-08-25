import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

export const supadataApiBaseUrl = "https://api.supadata.ai/v1";

type SupadataRequestPhase = "validate" | "execute";
type SupadataActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type SupadataActionHandler = (input: Record<string, unknown>, context: SupadataActionContext) => Promise<unknown>;

const supadataActionPaths: Record<string, string> = {
  get_account: "/me",
  search_youtube: "/youtube/search",
  get_youtube_video: "/youtube/video",
  get_youtube_channel: "/youtube/channel",
  list_youtube_channel_videos: "/youtube/channel/videos",
  get_youtube_playlist: "/youtube/playlist",
  list_youtube_playlist_videos: "/youtube/playlist/videos",
  get_youtube_transcript: "/youtube/transcript",
  scrape_web_page: "/web/scrape",
  map_web_links: "/web/map",
};

export const supadataActionHandlers: ProviderActionHandlers<"supadata", SupadataActionHandler> = {
  get_account(_input, context) {
    return supadataGet(supadataActionPaths.get_account, {}, context, "execute");
  },
  search_youtube(input, context) {
    return supadataGet(supadataActionPaths.search_youtube, input, context, "execute");
  },
  get_youtube_video(input, context) {
    return supadataGet(supadataActionPaths.get_youtube_video, input, context, "execute");
  },
  get_youtube_channel(input, context) {
    return supadataGet(supadataActionPaths.get_youtube_channel, input, context, "execute");
  },
  list_youtube_channel_videos(input, context) {
    return supadataGet(supadataActionPaths.list_youtube_channel_videos, input, context, "execute");
  },
  get_youtube_playlist(input, context) {
    return supadataGet(supadataActionPaths.get_youtube_playlist, input, context, "execute");
  },
  list_youtube_playlist_videos(input, context) {
    return supadataGet(supadataActionPaths.list_youtube_playlist_videos, input, context, "execute");
  },
  get_youtube_transcript(input, context) {
    return supadataGet(supadataActionPaths.get_youtube_transcript, input, context, "execute");
  },
  scrape_web_page(input, context) {
    return supadataGet(supadataActionPaths.scrape_web_page, input, context, "execute");
  },
  map_web_links(input, context) {
    return supadataGet(supadataActionPaths.map_web_links, input, context, "execute");
  },
};

export async function validateSupadataCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const account = optionalRecord(
    await supadataGet(
      supadataActionPaths.get_account,
      {},
      {
        apiKey,
        fetcher,
        signal,
      },
      "validate",
    ),
  );
  if (!account) {
    throw new ProviderRequestError(502, "Supadata account response was not an object");
  }

  const organizationId = optionalString(account.organizationId);
  const plan = optionalString(account.plan);
  return {
    profile: {
      accountId: organizationId ?? "api_key",
      displayName: organizationId ?? plan ?? "Supadata API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: supadataActionPaths.get_account,
      apiBaseUrl: supadataApiBaseUrl,
      organizationId,
      plan,
      maxCredits: optionalNumber(account.maxCredits),
      usedCredits: optionalNumber(account.usedCredits),
    }),
  };
}

async function supadataGet(
  path: string,
  query: Record<string, unknown>,
  context: SupadataActionContext,
  phase: SupadataRequestPhase,
): Promise<unknown> {
  const url = new URL(`${supadataApiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, String(item));
      }
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(url, {
      method: "GET",
      headers: supadataHeaders(context.apiKey),
      signal: context.signal,
    });
    payload = await readSupadataPayload(response);
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Supadata request failed: ${error.message}` : "Supadata request failed",
    );
  }

  if (!response.ok) {
    throw createSupadataError(response, payload, phase);
  }

  return payload;
}

async function readSupadataPayload(response: Response): Promise<unknown> {
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

function supadataHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    "user-agent": providerUserAgent,
    "x-api-key": apiKey,
  };
}

function createSupadataError(response: Response, payload: unknown, phase: SupadataRequestPhase): ProviderRequestError {
  const message = extractSupadataErrorMessage(payload) ?? response.statusText;
  if (response.status === 429) {
    return new ProviderRequestError(429, message || "Supadata rate limit exceeded", payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message || "Supadata API key is invalid", payload);
  }
  if (phase === "execute" && response.status === 401) {
    return new ProviderRequestError(401, message || "Supadata API key is invalid", payload);
  }
  if (response.status === 400) {
    return new ProviderRequestError(400, message || "Supadata request is invalid", payload);
  }
  if (response.status === 402) {
    return new ProviderRequestError(402, message || "Supadata plan upgrade is required", payload);
  }
  if (response.status === 404) {
    return new ProviderRequestError(404, message || "Supadata resource was not found", payload);
  }
  return new ProviderRequestError(response.status || 502, message || "Supadata request failed", payload);
}

function extractSupadataErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }
  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }
  const message = optionalString(record.message);
  const details = optionalString(record.details);
  if (message && details) {
    return `${message}: ${details}`;
  }
  return message ?? details ?? optionalString(record.error);
}
