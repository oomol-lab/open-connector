import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, defineProviderProxy, ProviderRequestError } from "../provider-runtime.ts";
import { theColonyActionHandlers, theColonyApiBaseUrl, validateTheColonyCredential } from "./runtime.ts";

const service = "the_colony";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, theColonyActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: theColonyApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  async customizeRequest({ credential, fetcher, headers }) {
    if (credential?.authType !== "api_key") throw new ProviderRequestError(401, "The Colony requires an API key");
    const response = await fetcher(`${theColonyApiBaseUrl}/auth/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ api_key: credential.apiKey }),
    });
    const payload = optionalRecord(await response.json());
    if (!response.ok)
      throw new ProviderRequestError(
        response.status,
        optionalString(payload?.error) ?? "The Colony token exchange failed",
        payload,
      );
    const token = optionalString(payload?.access_token);
    if (!token) throw new ProviderRequestError(502, "The Colony token response missing access_token");
    headers.set("authorization", `Bearer ${token}`);
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateTheColonyCredential(input.apiKey, fetcher, signal);
  },
};
