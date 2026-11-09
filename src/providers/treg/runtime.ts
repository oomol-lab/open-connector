import type { ProviderRuntimeHandler } from "../provider-executors.ts";

import { optionalNumber, optionalRawString, optionalRecord, requiredArray } from "../../core/cast.ts";
import {
  ProviderRequestError,
  providerInputError,
  providerResponseError,
  providerUserAgent,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";

export interface TregContext {
  apiKey: string;
  team?: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

const baseUrl = "https://treg.to";

const blockedHeaders = [
  "x-treg-token",
  "x-treg-org",
  "host",
  "authorization",
  "cookie",
  "connection",
  "content-length",
  "transfer-encoding",
  "upgrade",
  "trailer",
  "te",
];

interface RequestOptions extends TregContext {
  path: string;
  method?: string;
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
  body?: unknown;
}

function encodeSegment(value: string): string {
  if (value === "." || value === ".." || value.includes("\\") || value.includes("/")) {
    throw new ProviderRequestError(
      400,
      "Treg identifiers and path segments cannot contain traversal or path separators",
      undefined,
      "invalid_input",
    );
  }

  return encodeURIComponent(value);
}

export function readHome(payload: unknown): { team: string; balance_micro: number } {
  const home = requiredResponseRecord(payload, "Treg home response");
  const team = optionalRawString(home.team);
  if (!team)
    throw new ProviderRequestError(
      400,
      "Select a Treg team by supplying its team slug, or use a team API key",
      undefined,
      "invalid_input",
    );

  const balance = optionalNumber(home.balance_micro);
  if (balance === undefined)
    throw new ProviderRequestError(502, "Treg home response is missing balance_micro", undefined, "provider_error");

  return { team, balance_micro: balance };
}

export async function requestTreg(input: RequestOptions): Promise<{ payload: unknown; response: Response }> {
  return runProviderRequest({ label: "Treg", signal: input.signal }, async (signal) => {
    const url = new URL(input.path, baseUrl);
    for (const [key, value] of Object.entries(input.query ?? {})) {
      if (value === undefined) continue;
      for (const item of Array.isArray(value) ? value : [value]) url.searchParams.append(key, String(item));
    }

    const headers = new Headers({ accept: "application/json", "user-agent": providerUserAgent });
    for (const [key, value] of Object.entries(input.headers ?? {})) {
      if (blockedHeaders.includes(key.toLowerCase()))
        throw new ProviderRequestError(
          400,
          `Header ${key} is managed by the Treg connection`,
          undefined,
          "invalid_input",
        );

      headers.set(key, value);
    }

    headers.set("X-Treg-Token", input.apiKey);
    if (input.team) headers.set("X-Treg-Org", input.team);
    if (input.body !== undefined) headers.set("content-type", "application/json");
    const response = await input.fetcher(url.toString(), {
      method: input.method ?? "GET",
      headers,
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal,
    });

    const text = await response.text();
    let payload: unknown = null;
    if (text.trim()) {
      try {
        payload = JSON.parse(text);
      } catch {
        throw new ProviderRequestError(
          response.ok ? 502 : response.status,
          response.ok
            ? "Treg returned a non-JSON response; this action supports JSON tools only"
            : `Treg request failed (${response.status}): ${text.slice(0, 1000)}`,
          undefined,
          "provider_error",
        );
      }
    }

    if (!response.ok) {
      const record = optionalRecord(payload);
      const detail = optionalRecord(record?.detail);
      const error = optionalRecord(record?.error);
      const message =
        optionalRawString(record?.detail) ??
        optionalRawString(detail?.error) ??
        optionalRawString(detail?.message) ??
        optionalRawString(error?.message) ??
        optionalRawString(record?.error) ??
        optionalRawString(record?.message) ??
        `Treg request failed (${response.status})`;
      throw new ProviderRequestError(
        response.status,
        message,
        undefined,
        response.status === 429 ? "rate_limited" : "provider_error",
      );
    }

    return { payload, response };
  });
}

export const tregActionHandlers: Record<string, ProviderRuntimeHandler<TregContext>> = {
  async catalog_search(input, context) {
    const { payload } = await requestTreg({ ...context, path: "/catalog/search", query: input });
    return requiredResponseRecord(payload, "Treg catalog response");
  },
  async catalog_get(input, context) {
    const endpointId = encodeSegment(String(input.endpoint_id));
    const { payload } = await requestTreg({ ...context, path: `/catalog/endpoints/${endpointId}` });
    return requiredResponseRecord(payload, "Treg catalog response");
  },
  async list_tools(_input, context) {
    const { payload } = await requestTreg({ ...context, path: "/tools" });
    return { tools: requiredArray(payload, "Treg tools response", providerResponseError) };
  },
  async get_balance(_input, context) {
    const { payload } = await requestTreg({ ...context, path: "/home" });
    return readHome(payload);
  },
  async call_tool(input, context) {
    let path = `/call/${encodeSegment(String(input.tool))}`;
    const suffix = optionalRawString(input.path);
    if (suffix) path += `/${suffix.split("/").map(encodeSegment).join("/")}`;
    const method = optionalRawString(input.method) ?? "GET";
    if ((method === "GET" || method === "HEAD") && input.body !== undefined) {
      throw providerInputError("GET and HEAD tool calls cannot include a body");
    }

    const { payload, response } = await requestTreg({
      ...context,
      path,
      method,
      query: optionalRecord(input.query),
      headers: optionalRecord(input.headers) as Record<string, string> | undefined,
      body: input.body,
    });

    const cost = response.headers.get("x-treg-cost-micro");
    const costNumber = cost === null || cost.trim() === "" ? NaN : Number(cost);
    return {
      result: payload,
      status: response.status,
      cost_micro: Number.isSafeInteger(costNumber) ? costNumber : null,
      served_by: response.headers.get("x-treg-served-by"),
    };
  },
};
