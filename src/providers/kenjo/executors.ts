import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalRawString } from "../../core/cast.ts";
import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineProviderExecutors, mapProviderActionHandlers } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  ProviderRequestError,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
  readProviderTextBody,
} from "../provider-runtime.ts";
import { kenjoActions } from "./actions.ts";
function kenjoBaseUrl(environment: unknown) {
  if (environment === undefined || environment === "" || environment === "production") {
    return "https://api.kenjo.io/api/v1";
  }
  if (environment === "sandbox") return "https://sandbox-api.kenjo.io/api/v1";
  throw new ProviderRequestError(400, "Kenjo environment must be production or sandbox", undefined, "invalid_input");
}

function tokenRequest(baseUrl: string, apiKey: string) {
  return {
    url: `${baseUrl}/auth/login`,
    init: {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ apiKey }),
    },
  };
}

function readToken(payload: unknown) {
  const token = optionalRawString(optionalRecord(payload)?.token)?.trim();
  if (token === "Bearer") return null;
  return token?.startsWith("Bearer ") ? token.slice(7).trim() || null : token || null;
}

function providerError(response: Response, payload: unknown) {
  const body = optionalRecord(payload);
  return new ProviderRequestError(
    response.status,
    optionalRawString(body?.message) ?? `Kenjo request failed (${response.status})`,
    { providerCode: body?.code },
    "provider_error",
  );
}

async function requestJson(url: string, init: RequestInit, fetcher: typeof fetch) {
  const response = await fetcher(url, init);
  if (response.status === 204) return null;
  const text = await readProviderTextBody(response, "kenjo response", undefined, init.signal ?? undefined);
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }
  if (!response.ok) throw providerError(response, payload);
  if (payload === null)
    throw new ProviderRequestError(502, "Kenjo response is not valid JSON", undefined, "provider_error");
  return payload;
}

async function login(baseUrl: string, apiKey: string, fetcher: typeof fetch, signal: AbortSignal | undefined) {
  const request = tokenRequest(baseUrl, apiKey);
  const token = readToken(await requestJson(request.url, { ...request.init, signal }, fetcher));
  if (!token) throw new ProviderRequestError(502, "Kenjo access token is missing", undefined, "provider_error");
  return token;
}

const routes: Record<string, { method: string; path: string; list?: boolean }> = {
  list_companies: { method: "GET", path: "/companies", list: true },
  list_departments: { method: "GET", path: "/departments", list: true },
  list_calendars: { method: "GET", path: "/calendars", list: true },
  list_offices: { method: "GET", path: "/offices", list: true },
  get_office: { method: "GET", path: "/offices" },
  create_office: { method: "POST", path: "/offices" },
  update_office: { method: "PUT", path: "/offices" },
  delete_office: { method: "DELETE", path: "/offices" },
};

interface KenjoContext extends ApiKeyProviderContext {
  environment?: string;
}
const handlers = mapProviderActionHandlers(
  "kenjo",
  kenjoActions,
  (action) => async (values: Record<string, unknown>, context: KenjoContext) => {
    const route = routes[action.name]!;
    const { id, ...fields } = values;
    if (id === "." || id === "..") throw new ProviderRequestError(400, "Invalid office ID", undefined, "invalid_input");
    const baseUrl = kenjoBaseUrl(context.environment);
    const url = new URL(`${baseUrl}${route.path}${id === undefined ? "" : `/${encodeURIComponent(String(id))}`}`);
    if (route.list) {
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    const fetcher = context.fetcher;
    return runProviderRequest({ signal: context.signal, label: "Kenjo" }, async (signal) => {
      const token = await login(baseUrl, context.apiKey, fetcher, signal);
      const payload = await requestJson(
        url.toString(),
        {
          method: route.method,
          signal,
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: route.method === "POST" || route.method === "PUT" ? JSON.stringify(fields) : undefined,
        },
        fetcher,
      );
      if (route.method === "DELETE") return { deleted: true };
      if (route.list) {
        if (!Array.isArray(payload))
          throw new ProviderRequestError(502, "Kenjo list response is not an array", undefined, "provider_error");
        return { items: payload };
      }
      return { office: requiredResponseRecord(payload, "Kenjo office") };
    });
  },
);
export const executors: ProviderExecutors = defineProviderExecutors({
  service: "kenjo",
  handlers,
  async createContext(context, fetcher): Promise<KenjoContext> {
    const credential = await requireApiKeyCredential(context, "kenjo");
    return { apiKey: credential.apiKey, environment: credential.values?.environment, fetcher, signal: context.signal };
  },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher }) {
    const baseUrl = kenjoBaseUrl(input.values.environment);
    await runProviderRequest({ label: "Kenjo" }, (signal) =>
      login(baseUrl, requiredInputString(input.apiKey, "API Key"), fetcher, signal),
    );
    return {
      profile: { displayName: "Kenjo API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl },
    };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "kenjo",
  baseUrl: async (context) => kenjoBaseUrl((await requireApiKeyCredential(context, "kenjo")).values?.environment),
  auth: {
    type: "bearer_resolver",
    async resolve({ context, fetcher, signal }) {
      const credential = await requireApiKeyCredential(context, "kenjo");
      return {
        accessToken: await runProviderRequest({ label: "Kenjo", signal }, (budget) =>
          login(kenjoBaseUrl(credential.values?.environment), credential.apiKey, fetcher, budget),
        ),
      };
    },
  },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});
