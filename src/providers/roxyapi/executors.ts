import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { optionalString, optionalRawString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  roxyapiActionHandlers,
  roxyapiBaseUrl,
  readRoxyapiError,
  requestRoxyapiJson,
  requireRoxyapiServerKey,
} from "./runtime.ts";

const service = "roxyapi";
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, roxyapiActionHandlers);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: roxyapiBaseUrl,
  auth: { type: "api_key_header", name: "X-API-Key" },
  readError: readRoxyapiError,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const usage = await requestRoxyapiJson(
      new URL(`${roxyapiBaseUrl}/usage`),
      requireRoxyapiServerKey(input.apiKey),
      fetcher,
      "validate",
      undefined,
      signal,
    );
    return {
      profile: { displayName: optionalString(usage.email) ?? "RoxyAPI API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl: roxyapiBaseUrl, validationEndpoint: "/usage", plan: optionalRawString(usage.plan) },
    };
  },
};
