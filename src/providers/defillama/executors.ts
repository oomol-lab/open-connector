import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { DefillamaRoute } from "./actions.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  isAbortLikeError,
  runProviderRequest,
  ProviderRequestError,
  providerInputError,
  providerResponseError,
} from "../provider-runtime.ts";
import { defillamaActions } from "./actions.ts";
import { defillamaRoutes } from "./actions.ts";
const baseUrl = "https://pro-api.llama.fi";
function redactKey(message: string, apiKey?: string): string {
  if (!apiKey) return message;
  return message.replaceAll(encodeURIComponent(apiKey), "[REDACTED]").replaceAll(apiKey, "[REDACTED]");
}
function encodeSegment(value: unknown): string {
  const segment = String(value);
  if (segment === "." || segment === "..") throw providerInputError("Path parameters cannot be dot segments");
  return encodeURIComponent(segment);
}
function fillPath(path: string, input: Record<string, unknown>): string {
  return path
    .split("/")
    .map((part) => (part.startsWith("{") && part.endsWith("}") ? encodeSegment(input[part.slice(1, -1)]) : part))
    .join("/");
}
function credentialUrl(url: URL, apiKey: string): URL {
  const key = encodeSegment(apiKey);
  const target = new URL(url);
  target.pathname = target.pathname === "/usage" ? `/usage/${key}` : `/${key}${target.pathname}`;
  return target;
}
async function fetchResponse(
  url: URL,
  init: RequestInit,
  apiKey: string | undefined,
  fetcher: typeof fetch,
): Promise<Response> {
  const target = apiKey ? credentialUrl(url, apiKey) : new URL(url);
  try {
    const response = await fetcher(target, { ...init, redirect: "manual" });
    if (!response.ok) {
      const text = await response.text();
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        body = undefined;
      }
      const record = optionalRecord(body);
      const error = optionalRecord(record?.error);
      const code = optionalString(record?.code) ?? optionalString(error?.code);
      const detail =
        optionalString(record?.message) ??
        optionalString(record?.error) ??
        optionalString(error?.message) ??
        text.slice(0, 1000);
      throw new ProviderRequestError(
        response.status,
        `DeFiLlama request failed (${response.status}): ${redactKey([code, detail].filter(Boolean).join(": "), apiKey)}`,
        undefined,
        "provider_error",
      );
    }
    return response;
  } catch (error) {
    if (isAbortLikeError(error)) throw error;
    if (error instanceof ProviderRequestError)
      throw new ProviderRequestError(error.status, redactKey(error.message, apiKey), undefined, error.code);
    throw providerResponseError(
      `DeFiLlama request failed: ${redactKey(error instanceof Error ? error.message : "Transport error", apiKey)}`,
    );
  }
}
function freeProxyUrl(url: URL): URL {
  for (const route of defillamaRoutes.values()) {
    if (!route.free) continue;
    const pattern = route.path.split("/");
    const segments = url.pathname.split("/");
    if (pattern.length !== segments.length) continue;
    const input: Record<string, unknown> = {};
    const matches = pattern.every((part, index) => {
      if (part.startsWith("{")) {
        try {
          input[part.slice(1, -1)] = decodeURIComponent(segments[index]!);
        } catch {
          return false;
        }
        return Boolean(segments[index]);
      }
      return part === segments[index];
    });
    if (matches) {
      const target = new URL(fillPath(route.free.path, input), route.free.baseUrl);
      target.search = url.search;
      return target;
    }
  }
  throw providerInputError("This DeFiLlama endpoint requires an API plan key");
}
async function request(
  route: DefillamaRoute,
  input: Record<string, unknown>,
  apiKey: string | undefined,
  fetcher: typeof fetch,
  parentSignal?: AbortSignal,
) {
  if (!apiKey && !route.free) throw providerInputError("This DeFiLlama action requires an API plan key");
  const path = route.path.startsWith("/usage/") ? "/usage" : route.path;
  const url = new URL(fillPath(apiKey ? path : route.free!.path, input), apiKey ? baseUrl : route.free!.baseUrl);
  for (const parameter of route.parameters) {
    if (parameter.in !== "query") continue;
    const value = input[parameter.name];
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const entry of value) url.searchParams.append(parameter.name, String(entry));
    } else url.searchParams.set(parameter.name, typeof value === "object" ? JSON.stringify(value) : String(value));
  }
  return runProviderRequest({ label: "DeFiLlama", signal: parentSignal }, async (signal) => {
    const response = await fetchResponse(url, { headers: { accept: "application/json" }, signal }, apiKey, fetcher);
    let body: unknown;
    try {
      body = JSON.parse(redactKey(await response.text(), apiKey));
    } catch (error) {
      if (isAbortLikeError(error)) throw error;
      throw providerResponseError("DeFiLlama returned invalid JSON");
    }
    return route.wrap ? { data: body } : body;
  });
}
async function execute(
  actionName: string,
  values: Record<string, unknown>,
  context: DefillamaContext,
): Promise<unknown> {
  const { apiKey, fetcher } = context;
  const route = defillamaRoutes.get(actionName);
  if (!route) throw providerInputError("Unknown DeFiLlama action");
  return request(route, values, apiKey, fetcher, context.signal);
}
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const output = await request(defillamaRoutes.get("get_usage")!, {}, input.apiKey, fetcher, signal);
    if (typeof optionalRecord(output)?.creditsLeft !== "number")
      throw providerResponseError("DeFiLlama usage response is missing creditsLeft");
    return { profile: { displayName: "DeFiLlama API Key" }, grantedScopes: [], metadata: {} };
  },
};
interface DefillamaContext {
  apiKey?: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}
export const executors: ProviderExecutors = defineProviderExecutors<DefillamaContext>({
  service: "defillama",
  handlers: Object.fromEntries(
    defillamaActions.map((action) => [action.name, (values, context) => execute(action.name, values, context)]),
  ),
  async createContext(context, fetcher) {
    const credential = await context.getCredential("defillama");
    return {
      apiKey: credential?.authType === "api_key" ? credential.apiKey : undefined,
      fetcher,
      signal: context.signal,
    };
  },
});
const executeProxy = defineProviderProxy({
  service: "defillama",
  baseUrl,
  auth: { type: "none" },
  redirect: "manual",
  allowedOrigins: [
    ...new Set(
      [...defillamaRoutes.values()].flatMap((route) => (route.free ? [new URL(route.free.baseUrl).origin] : [])),
    ),
  ],
  async customizeRequest({ url, headers, context }) {
    if (url.origin !== baseUrl) {
      throw providerInputError("DeFiLlama proxy endpoints must use pro-api.llama.fi");
    }
    const credential = await context.getCredential("defillama");
    const key = credential?.authType === "api_key" ? credential.apiKey : undefined;
    const target = key ? credentialUrl(url, key) : freeProxyUrl(url);
    url.href = target.href;
    headers.delete("authorization");
    headers.delete("x-api-key");
    headers.set("accept", "application/json");
  },
});
// The API key is part of the URL; redact transport errors and echoed response values.
export const proxy: ProviderProxyExecutor = async (input, context) => {
  const credential = await context.getCredential("defillama");
  const key = credential?.authType === "api_key" ? credential.apiKey : undefined;
  const result = await executeProxy(input, context);
  if (!key) return result;
  const redact = (value: unknown): unknown => {
    if (typeof value === "string") return redactKey(value, key);
    if (Array.isArray(value)) return value.map(redact);
    const object = optionalRecord(value);
    return object
      ? Object.fromEntries(Object.entries(object).map(([name, child]) => [redactKey(name, key), redact(child)]))
      : value;
  };
  if (result.ok) {
    const headers = Object.fromEntries(
      Object.entries(result.response.headers).map(([name, value]) => [name, redactKey(value, key)]),
    );
    return { ...result, response: { ...result.response, headers, data: redact(result.response.data) } };
  }
  return {
    ok: false,
    error: { ...result.error, message: redactKey(result.error.message, key), details: redact(result.error.details) },
  };
};
