import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { requireApiKeyCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  basicAuthorizationHeader,
  providerInputError,
  ProviderRequestError,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import { chatraActions } from "./actions.ts";

const baseUrl = "https://app.chatra.io/api";
const defaultHeaders = { accept: "application/json", "content-type": "application/json" };

interface Route {
  method: string;
  resource: string;
  idField?: string;
}

const routes: Record<string, Route> = {
  send_message: { method: "POST", resource: "messages" },
  get_message: { method: "GET", resource: "messages", idField: "id" },
  update_message: { method: "PUT", resource: "messages", idField: "id" },
  delete_message: { method: "DELETE", resource: "messages", idField: "id" },
  send_pushed_message: { method: "POST", resource: "pushedMessages" },
  get_pushed_message: { method: "GET", resource: "pushedMessages", idField: "id" },
  update_pushed_message: { method: "PUT", resource: "pushedMessages", idField: "id" },
  delete_pushed_message: { method: "DELETE", resource: "pushedMessages", idField: "id" },
  get_client: { method: "GET", resource: "clients", idField: "clientId" },
  update_client: { method: "PUT", resource: "clients", idField: "clientId" },
};

async function execute(actionName: string, values: Record<string, unknown>, context: ChatraContext): Promise<unknown> {
  const route = routes[actionName];
  if (!route) throw providerInputError(`Unknown Chatra action: ${actionName}`);
  if (route.idField) {
    const value = requiredInputString(values[route.idField], route.idField).trim();
    if (!value || value === "." || value === "..") throw providerInputError("Invalid resource ID");
    values = { ...values, [route.idField]: value };
  }
  const suffix = route.idField ? encodeURIComponent(requiredInputString(values[route.idField], route.idField)) : "";
  const body = Object.fromEntries(Object.entries(values).filter(([key]) => key !== route.idField));
  const authorization = basicAuthorizationHeader(
    `${requiredInputString(context.publicKey, "publicKey")}:${context.apiKey}`,
  );
  return runProviderRequest({ label: "Chatra", signal: context.signal }, async (signal) => {
    const response = await context.fetcher(`${baseUrl}/${route.resource}/${suffix}`, {
      method: route.method,
      headers: { ...defaultHeaders, authorization },
      signal,
      body: route.method === "POST" || route.method === "PUT" ? JSON.stringify(body) : undefined,
    });
    const payload: unknown = await response.json().catch((error: unknown) => {
      if (error instanceof SyntaxError) return undefined;
      throw error;
    });
    if (!response.ok) {
      const message =
        optionalString(optionalRecord(payload)?.message) ?? `Chatra request failed with HTTP ${response.status}`;
      throw new ProviderRequestError(
        response.status,
        message,
        undefined,
        response.status === 429 ? "rate_limited" : "provider_error",
      );
    }
    return requiredResponseRecord(payload, "Chatra response");
  });
}

interface ChatraContext extends ApiKeyProviderContext {
  publicKey: string;
}

export const executors: ProviderExecutors = defineProviderExecutors({
  service: "chatra",
  handlers: Object.fromEntries(
    chatraActions.map((action) => [
      action.name,
      (values: Record<string, unknown>, context: ChatraContext) => execute(action.name, values, context),
    ]),
  ),
  async createContext(context, fetcher) {
    const c = await requireApiKeyCredential(context, "chatra");
    return {
      apiKey: c.apiKey,
      publicKey: requiredInputString(c.values?.publicKey, "publicKey"),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input) {
    requiredInputString(input.apiKey, "apiKey");
    requiredInputString(input.values.publicKey, "publicKey");
    return {
      profile: { displayName: "Chatra API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl, validationMode: "local_non_empty_keys" },
    };
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "chatra",
  baseUrl: baseUrl,
  auth: { type: "none" },
  async customizeRequest({ headers: proxyHeaders, context, service }) {
    for (const [name, value] of Object.entries(defaultHeaders))
      if (!proxyHeaders.has(name)) proxyHeaders.set(name, value);
    const c = await requireApiKeyCredential(context, service);
    proxyHeaders.set(
      "authorization",
      basicAuthorizationHeader(requiredInputString(c.values?.publicKey, "publicKey") + ":" + c.apiKey),
    );
  },
});
