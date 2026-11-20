import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  requiredResponseRecord,
  isAbortLikeError,
  runProviderRequest,
  ProviderRequestError,
  providerResponseError,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";
export const search1apiBaseUrl = "https://api.search1api.com";
export async function readSearch1apiJson(response: Response, crawlBatch = false): Promise<Record<string, unknown>> {
  const value: unknown = await response.json().catch((error: unknown) => {
    if (isAbortLikeError(error)) throw error;
    return undefined;
  });
  const body = optionalRecord(value);
  if (!response.ok || body?.ok === false) {
    const detail =
      optionalString(body?.message) ?? optionalString(body?.detail) ?? optionalString(body?.error_description);
    const code = optionalString(body?.error) ?? optionalString(body?.title);
    throw new ProviderRequestError(
      response.ok ? 502 : response.status,
      `Search1API request failed: ${[code, detail].filter(Boolean).join(": ") || `HTTP ${response.status}`}`,
      withRetryAfterSeconds(response),
      response.status === 429 ? "rate_limited" : "provider_error",
    );
  }
  if (crawlBatch) {
    if (!Array.isArray(value)) throw providerResponseError("Search1API batch crawl response must be an array");
    return { results: value };
  }
  return requiredResponseRecord(value, "Search1API response");
}
export function requestSearch1api(
  token: string,
  name: string,
  input: Record<string, unknown>,
  fetcher: typeof fetch,
  parentSignal?: AbortSignal,
): Promise<Record<string, unknown>> {
  return runProviderRequest(
    { label: "Search1API", signal: parentSignal, timeoutMs: name === "ask" ? 45000 : undefined },
    async (signal) => {
      const batch = name.endsWith("_batch");
      const action = batch ? name.slice(0, -6) : name;
      const path =
        action === "get_deepcrawl" ? `/deepcrawl/status/${encodeURIComponent(String(input.taskId))}` : `/${action}`;
      const url = new URL(path, search1apiBaseUrl);
      const method = ["health", "usage", "get_deepcrawl"].includes(action) ? "GET" : "POST";
      if (action === "usage" && input.period !== undefined) url.searchParams.set("period", String(input.period));
      const response = await fetcher(url, {
        method,
        headers: {
          "accept": "application/json",
          "content-type": "application/json",
          ...(action === "health" ? {} : { authorization: `Bearer ${token}` }),
        },
        body: method === "POST" ? JSON.stringify(batch ? input.requests : input) : undefined,
        signal,
      });
      return readSearch1apiJson(response, name === "crawl_batch");
    },
  );
}
