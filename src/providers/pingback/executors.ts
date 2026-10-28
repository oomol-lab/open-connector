import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  providerUserAgent,
  ProviderRequestError,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import actions from "./actions.ts";
const apiBaseUrl = "https://connect.pingback.com/v1";
async function execute(
  actionName: string,
  valuesInput: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const { email, developerMode, segmentationId, ...body } = valuesInput;
  const encodedEmail = encodeURIComponent(requiredInputString(email, "email"));
  let path = `/subscriber/${encodedEmail}`;
  let method = "GET";
  switch (actionName) {
    case "create_subscriber":
      path = "/subscriber";
      method = "POST";
      body.email = email;
      break;
    case "update_subscriber":
      method = "PUT";
      break;
    case "add_subscriber_to_segments":
      path = `/segmentation/add-subscriber/${encodedEmail}`;
      method = "POST";
      break;
    case "remove_subscriber_from_segment":
      path = `/segmentation/${encodeURIComponent(requiredInputString(segmentationId, "segmentationId"))}/remove-subscriber/${encodedEmail}`;
      method = "DELETE";
      break;
  }
  const headers = new Headers({
    accept: "application/json",
    "x-api-key": context.apiKey,
    "user-agent": providerUserAgent,
  });
  if (developerMode !== undefined) headers.set("x-developer-mode", String(developerMode));
  const hasBody = method === "POST" || method === "PUT";
  if (hasBody) headers.set("content-type", "application/json");
  return runProviderRequest({ signal: context.signal, label: "Pingback" }, async (signal) => {
    const response = await context.fetcher(`${apiBaseUrl}${path}`, {
      method,
      headers,
      body: hasBody ? JSON.stringify(body) : undefined,
      signal,
    });
    const text = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        `Pingback returned non-JSON response (HTTP ${response.status})`,
        undefined,
        response.status === 429 ? "rate_limited" : "provider_error",
      );
    }
    if (!response.ok) {
      const error = optionalRecord(payload);
      const code = optionalString(error?.errorCode);
      const message = optionalString(error?.error) ?? optionalString(error?.message) ?? `HTTP ${response.status}`;
      throw new ProviderRequestError(
        response.status,
        `Pingback${code ? ` ${code}` : ""}: ${message}`,
        undefined,
        response.status === 429 ? "rate_limited" : "provider_error",
      );
    }
    return requiredResponseRecord(payload, "Pingback response");
  });
}
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "pingback",
  Object.fromEntries(
    actions.map((action) => [
      action.name,
      (values: Record<string, unknown>, context: ApiKeyProviderContext) => execute(action.name, values, context),
    ]),
  ),
);
export const credentialValidators: CredentialValidators = {
  async apiKey(input) {
    requiredInputString(input.apiKey, "apiKey");
    return {
      profile: { displayName: "Pingback API Key" },
      grantedScopes: [],
      metadata: { apiBaseUrl, validationMode: "local_only" },
    };
  },
};
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "pingback",
  baseUrl: apiBaseUrl,
  auth: { type: "api_key_header", name: "x-api-key" },
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});
