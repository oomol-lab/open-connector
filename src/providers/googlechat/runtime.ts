import type { GoogleQueryValue } from "../googledrive/runtime-request.ts";
import type { OAuthProviderContext } from "../provider-runtime.ts";

import { googleJsonRequest } from "../googledrive/runtime-request.ts";

export const googleChatApiBaseUrl = "https://chat.googleapis.com/v1";

const service = "googlechat";

export type GoogleChatRuntimeContext = OAuthProviderContext;

interface GoogleChatRequestInput {
  context: Pick<GoogleChatRuntimeContext, "accessToken" | "fetcher" | "signal">;
  method?: string;
  query?: Record<string, GoogleQueryValue>;
  body?: unknown;
}

/** Send an authenticated JSON request on behalf of the Google Chat connection, to Chat or another Google API. */
export function googleChatJsonRequest<T>(url: string, input: GoogleChatRequestInput): Promise<T> {
  return googleJsonRequest<T>(url, {
    accessToken: input.context.accessToken,
    fetcher: input.context.fetcher,
    signal: input.context.signal,
    method: input.method,
    query: input.query,
    body: input.body,
    service,
  });
}

/** Percent-encode each segment of a resource name such as spaces/{space}, keeping the separators. */
export function encodeResourceName(name: string): string {
  return name
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function stripPrefix(value: string, prefix: string): string {
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}
