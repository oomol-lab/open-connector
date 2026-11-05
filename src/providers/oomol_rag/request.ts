import type { ProviderFetch } from "../provider-runtime.ts";

import { optionalRawString, optionalRecord } from "../../core/cast.ts";
import {
  ProviderRequestError,
  readProviderJsonBody,
  runProviderRequest,
  providerUserAgent,
} from "../provider-runtime.ts";

export interface OomolRagContext {
  apiKey: string;
  teamId: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

export async function requestOomolRag(
  context: OomolRagContext,
  input: {
    path: string;
    method?: "GET" | "POST" | "DELETE";
    query?: Record<string, string | number | undefined>;
    body?: unknown;
  },
): Promise<unknown> {
  const url = new URL(input.path, "https://knowledge-base.oomol.com");
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return runProviderRequest({ signal: context.signal, label: "OOMOL RAG" }, async (signal) => {
    const headers = new Headers({
      authorization: `Bearer ${context.apiKey}`,
      "x-oo-team-id": context.teamId,
      accept: "application/json",
      "user-agent": providerUserAgent,
    });
    if (input.body !== undefined) headers.set("content-type", "application/json");
    const response = await context.fetcher(url, {
      method: input.method ?? "GET",
      headers,
      signal,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: undefined,
      invalidJsonMessage: "OOMOL RAG returned invalid JSON",
      invalidJsonFallback: response.ok ? undefined : () => null,
    });
    if (!response.ok) {
      const record = optionalRecord(payload);
      const message =
        optionalRawString(record?.error) ??
        optionalRawString(record?.message) ??
        `OOMOL RAG request failed with status ${response.status}`;
      throw new ProviderRequestError(response.status, message.replaceAll(context.apiKey, "[REDACTED]"));
    }
    return payload;
  });
}
