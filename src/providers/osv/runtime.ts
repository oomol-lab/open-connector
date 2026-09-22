import type { ProviderActionHandlers, ProviderFetch } from "../provider-runtime.ts";

import { compactObject, optionalRawString, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  providerResponseError,
  providerUserAgent,
  ProviderRequestError,
  readProviderJsonBody,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

export const osvApiBaseUrl = "https://api.osv.dev";

export interface OsvRuntimeContext {
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

type OsvActionHandler = (input: Record<string, unknown>, context: OsvRuntimeContext) => Promise<unknown>;

export const osvActionHandlers: ProviderActionHandlers<"osv", OsvActionHandler> = {
  async query_vulnerabilities(input, context) {
    const payload = requiredResponseRecord(
      await requestOsvJson(
        "/v1/query",
        {
          method: "POST",
          body: JSON.stringify(
            compactObject({
              package: {
                ecosystem: requiredInputString(input.ecosystem, "ecosystem"),
                name: requiredInputString(input.package, "package"),
              },
              version: optionalString(input.version),
              page_token: optionalString(input.pageToken),
            }),
          ),
        },
        context,
      ),
      "OSV query response",
    );
    const vulnerabilities = payload.vulns === undefined ? [] : payload.vulns;
    if (!Array.isArray(vulnerabilities)) {
      throw providerResponseError("OSV query vulnerabilities must be an array of objects");
    }
    if (!vulnerabilities.every((vulnerability) => optionalRecord(vulnerability))) {
      throw providerResponseError("OSV query vulnerabilities must be an array of objects");
    }
    return {
      vulnerabilities,
      nextPageToken: optionalString(payload.next_page_token),
    };
  },
  async get_vulnerability(input, context) {
    const id = encodeURIComponent(requiredInputString(input.id, "id"));
    return requiredResponseRecord(
      await requestOsvJson(`/v1/vulns/${id}`, { method: "GET" }, context),
      "OSV vulnerability response",
    );
  },
};

async function requestOsvJson(path: string, init: RequestInit, context: OsvRuntimeContext): Promise<unknown> {
  return runProviderRequest({ label: "OSV", signal: context.signal }, async (signal) => {
    const response = await context.fetcher(`${osvApiBaseUrl}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: null,
      invalidJsonMessage: "OSV returned invalid JSON",
      invalidJsonFallback: response.ok ? undefined : (text) => text.trim(),
    });
    if (!response.ok) {
      throw createOsvError(response.status, payload);
    }
    return payload;
  });
}

function createOsvError(status: number, payload: unknown): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalRawString(payload) ??
    optionalString(record?.message) ??
    optionalString(record?.error) ??
    `OSV request failed with status ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(502, message, payload);
  }
  return new ProviderRequestError(status || 502, message, payload);
}
