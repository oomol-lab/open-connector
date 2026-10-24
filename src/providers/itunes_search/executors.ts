import type { ExecutionContext, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { looseArray, optionalBoolean, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  ProviderRequestError,
  providerResponseError,
  requiredInputString,
  runProviderRequest,
} from "../provider-runtime.ts";
import { lookupIdentifierFields } from "./actions.ts";

const service = "itunes_search";
const baseUrl = "https://itunes.apple.com";
interface Context {
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

async function request(
  context: Context,
  path: string,
  query: Record<string, string | undefined>,
): Promise<Record<string, unknown>> {
  const url = new URL(path, baseUrl);
  for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, value);
  return runProviderRequest({ signal: context.signal, label: "iTunes Search" }, async (signal) => {
    const response = await context.fetcher(url, { headers: { accept: "application/json" }, signal });
    const text = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw providerResponseError("iTunes Search API response is not JSON");
    }
    const record = optionalRecord(payload);
    const errorMessage = optionalString(record?.errorMessage);
    if (errorMessage)
      throw new ProviderRequestError(400, `iTunes Search API rejected the request: ${errorMessage}`, payload);
    if (response.status === 403 || response.status === 429)
      throw new ProviderRequestError(
        429,
        `iTunes Search API is throttling this client (HTTP ${response.status}).`,
        payload,
      );
    if (!response.ok)
      throw new ProviderRequestError(
        response.status,
        `iTunes Search API request failed with HTTP ${response.status}`,
        payload,
      );
    if (!record || !Array.isArray(record.results))
      throw providerResponseError("iTunes Search API response is missing a results array");
    return {
      resultCount: Number.isInteger(record.resultCount) ? record.resultCount : record.results.length,
      returnedCount: record.results.length,
      results: record.results,
    };
  });
}
const handlers: Record<string, (input: Record<string, unknown>, context: Context) => Promise<unknown>> = {
  search_store(input, context) {
    return request(context, "/search", {
      term: requiredInputString(input.term, "term"),
      country: optionalString(input.country),
      media: optionalString(input.media),
      entity: optionalString(input.entity),
      attribute: optionalString(input.attribute),
      limit: optionalNumber(input.limit) === undefined ? undefined : String(optionalNumber(input.limit)),
      lang: optionalString(input.lang),
      explicit:
        optionalBoolean(input.explicit) === undefined ? undefined : optionalBoolean(input.explicit) ? "Yes" : "No",
      version: optionalNumber(input.version) === undefined ? undefined : String(optionalNumber(input.version)),
    });
  },
  lookup_store(input, context) {
    const provided = lookupIdentifierFields.flatMap((field) => {
      const values = looseArray(input[field]);
      return values.length ? [{ field, values: values.map((item) => requiredInputString(item, field)) }] : [];
    });
    if (provided.length !== 1) throw new ProviderRequestError(400, "exactly one lookup identifier field is required");
    const identifier = provided[0]!;
    if (identifier.values.some((item) => item.includes(",")))
      throw new ProviderRequestError(400, `${identifier.field} entries must not contain a comma`);
    return request(context, "/lookup", {
      [identifier.field]: identifier.values.join(","),
      entity: optionalString(input.entity),
      limit: optionalNumber(input.limit) === undefined ? undefined : String(optionalNumber(input.limit)),
      sort: optionalString(input.sort),
      country: optionalString(input.country),
      lang: optionalString(input.lang),
    });
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<Context>({
  service,
  handlers,
  createContext(context: ExecutionContext, fetcher) {
    return { fetcher, signal: context.signal };
  },
  skipDnsValidation: true,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl,
  auth: { type: "none" },
  skipDnsValidation: true,
  allowedEndpoint(endpoint) {
    return endpoint === "/search" || endpoint === "/lookup";
  },
});
