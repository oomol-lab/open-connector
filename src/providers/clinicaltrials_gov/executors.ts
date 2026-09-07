import type { ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import {
  createProviderFetch,
  createProviderProxyUrl,
  createProviderTimeout,
  defineProviderExecutors,
  mapProviderActionSources,
  normalizeProviderProxyHeaders,
  providerUserAgent,
  ProviderRequestError,
  readProviderProxyErrorMessage,
  readProviderProxyResponse,
  toProviderProxyError,
} from "../provider-runtime.ts";
import {
  clinicalTrialsGovActionHandlers,
  clinicalTrialsGovApiBaseUrl,
  maxRedirects,
  maxResponseBytes,
} from "./runtime.ts";
const service = "clinicaltrials_gov";
const clinicalTrialsGovOrigin = "https://clinicaltrials.gov";
const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const proxyFetch = createProviderFetch({ skipDnsValidation: true });
interface ClinicalTrialsContext {
  fetcher: typeof fetch;
}
const handlers = mapProviderActionSources(
  service,
  clinicalTrialsGovActionHandlers,
  (_name, handler) => (input: Record<string, unknown>, context: ClinicalTrialsContext) =>
    handler(input, context.fetcher),
);
export const executors: ProviderExecutors = defineProviderExecutors<ClinicalTrialsContext>({
  service,
  handlers,
  createContext: (_context, fetcher) => ({ fetcher }),
  skipDnsValidation: true,
});

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    if (input.method.toUpperCase() !== "GET") {
      throw new ProviderRequestError(400, "ClinicalTrials.gov proxy only supports GET");
    }
    const url = createProviderProxyUrl(clinicalTrialsGovApiBaseUrl, input.endpoint, input.query);
    assertAllowedProxyUrl(url);
    if (url.searchParams.get("format") === "json.zip") {
      throw new ProviderRequestError(400, "ClinicalTrials.gov JSON ZIP is not supported by the text response proxy");
    }
    const headers = normalizeProviderProxyHeaders(input.headers);
    if (!headers.has("accept")) headers.set("accept", "application/json");
    headers.set("user-agent", providerUserAgent);
    const timeout = createProviderTimeout(context.signal);
    try {
      const response = await fetchOfficialProxyResponse(url, headers, timeout.signal);
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (contentType.includes("application/zip") || contentType.includes("octet-stream")) {
        await response.body?.cancel().catch(() => {});
        throw new ProviderRequestError(
          400,
          "ClinicalTrials.gov binary responses are not supported by the text response proxy",
        );
      }
      if (!response.ok) {
        throw new ProviderRequestError(
          response.status,
          await readProviderProxyErrorMessage(response, `provider request failed with HTTP ${response.status}`),
        );
      }
      return { ok: true, response: await readProviderProxyResponse(response, { maxBytes: maxResponseBytes }) };
    } catch (error) {
      if (error instanceof ProviderRequestError || !timeout.didTimeout()) throw error;
      throw new ProviderRequestError(504, "ClinicalTrials.gov request timed out");
    } finally {
      timeout.cleanup();
    }
  } catch (error) {
    return toProviderProxyError(error, "ClinicalTrials.gov proxy request failed");
  }
};

async function fetchOfficialProxyResponse(initialUrl: URL, headers: Headers, signal: AbortSignal): Promise<Response> {
  const originalSearch = initialUrl.search;
  let url = initialUrl;
  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const response = await proxyFetch(url, { method: "GET", headers, redirect: "manual", signal });
    if (!redirectStatuses.has(response.status)) return response;
    const location = response.headers.get("location");
    if (!location || redirectCount === maxRedirects) {
      await response.body?.cancel().catch(() => {});
      throw new ProviderRequestError(502, "ClinicalTrials.gov returned an invalid or excessive redirect");
    }
    const redirectedUrl = new URL(location, url);
    assertAllowedProxyUrl(redirectedUrl, true);
    for (const [name, value] of new URLSearchParams(originalSearch)) {
      if (!redirectedUrl.searchParams.has(name)) redirectedUrl.searchParams.append(name, value);
    }
    await response.body?.cancel().catch(() => {});
    url = redirectedUrl;
  }
  throw new ProviderRequestError(502, "ClinicalTrials.gov redirect failed");
}

function assertAllowedProxyUrl(url: URL, redirected = false): void {
  if (url.origin === clinicalTrialsGovOrigin && (url.pathname === "/api/v2" || url.pathname.startsWith("/api/v2/"))) {
    return;
  }
  throw new ProviderRequestError(
    redirected ? 502 : 400,
    redirected
      ? "ClinicalTrials.gov redirected outside the official /api/v2 boundary"
      : "ClinicalTrials.gov proxy endpoint must stay within /api/v2",
  );
}
