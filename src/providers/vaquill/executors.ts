import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalString, looseArray } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  requiredResponseRecord,
  isAbortLikeError,
  runProviderRequest,
  ProviderRequestError,
  providerInputError,
} from "../provider-runtime.ts";
import { vaquillActions } from "./actions.ts";
import { vaquillOperationByName } from "./actions.ts";
const baseUrl = "https://api.vaquill.ai";
function redactErrorValue(value: unknown, secrets: readonly string[]): unknown {
  if (typeof value === "string") {
    return secrets.reduce((text, secret) => text.replaceAll(secret, "[REDACTED]"), value);
  }
  if (Array.isArray(value)) return value.map((item) => redactErrorValue(item, secrets));
  const object = optionalRecord(value);
  return object
    ? Object.fromEntries(Object.entries(object).map(([key, item]) => [key, redactErrorValue(item, secrets)]))
    : value;
}
function errorMessage(body: unknown): string | undefined {
  const object = optionalRecord(body);
  const detail = optionalString(object?.detail);
  const nested = optionalRecord(object?.detail);
  const fields = [...looseArray(object?.errors), ...looseArray(object?.detail)].flatMap((value) => {
    const field = optionalRecord(value);
    const message = optionalString(field?.msg);
    return message ? [`${looseArray(field?.loc).join(".")}: ${message}`] : [];
  });
  return (
    [
      detail ?? optionalString(nested?.message) ?? optionalString(object?.message),
      optionalString(object?.reason),
      ...fields,
    ]
      .filter(Boolean)
      .join(": ") || undefined
  );
}
async function request(
  name: string,
  input: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
  parentSignal?: AbortSignal,
) {
  const operation = vaquillOperationByName.get(name);
  if (!operation) throw providerInputError(`Unknown Vaquill action: ${name}`);
  return runProviderRequest({ label: "Vaquill", signal: parentSignal }, async (signal) => {
    let path = operation.path;
    const payload = { ...input };
    for (const key of operation.pathKeys) {
      const value = String(payload[key]);
      if (value === "." || value === ".." || value.includes("/")) {
        throw providerInputError(`${key} must be a single path segment; resolve citations containing slashes first`);
      }
      path = path.replace(`{${key}}`, encodeURIComponent(value));
      delete payload[key];
    }
    const url = new URL(path, baseUrl);
    for (const key of operation.query) {
      const value = payload[key];
      if (value == null) continue;
      for (const item of Array.isArray(value) ? value : [value]) {
        url.searchParams.append(key, String(item));
      }
    }
    const response = await fetcher(url, {
      method: operation.method,
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: operation.method === "POST" || operation.method === "PATCH" ? JSON.stringify(payload) : undefined,
      signal,
    });
    if (response.status === 204 && name === "delete_watch") return { deleted: true };
    const body: unknown = await response.json().catch((error: unknown) => {
      if (isAbortLikeError(error)) throw error;
      return undefined;
    });
    if (!response.ok) {
      const upstream = optionalRecord(body);
      const recovery = Object.fromEntries(
        [
          "actId",
          "sessionLawId",
          "reason",
          "didYouMean",
          "defaultSessionLawId",
          "jurisdictions",
          "candidateCount",
          "truncated",
          "sessionCoverage",
        ]
          .filter((key) => upstream?.[key] !== undefined)
          .map((key) => [key, upstream?.[key]]),
      );
      const auth = optionalRecord(input.webhookAuth);
      const secrets = [apiKey, optionalString(input.webhookSecret), optionalString(auth?.secret)].filter(
        (secret): secret is string => Boolean(secret),
      );
      const message = optionalString(redactErrorValue(errorMessage(body), secrets));
      const data = Object.keys(recovery).length ? redactErrorValue(recovery, secrets) : undefined;
      throw new ProviderRequestError(
        response.status,
        `Vaquill request failed (${response.status})${message ? `: ${message}` : ""}`,
        data,
        "provider_error",
      );
    }
    return requiredResponseRecord(body, "Vaquill response");
  });
}
async function execute(
  actionName: string,
  values: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const { apiKey, fetcher } = context;
  const operation = vaquillOperationByName.get(actionName);
  if (!operation) throw providerInputError(`Unknown Vaquill action: ${actionName}`);
  const normalized = { ...values };
  for (const key of ["state", "jurisdiction"]) {
    const value = normalized[key];
    if (typeof value === "string") normalized[key] = value.toLowerCase();
    else if (Array.isArray(value))
      normalized[key] = value.map((item) => (typeof item === "string" ? item.toLowerCase() : item));
  }
  if (actionName === "list_divisions" && typeof normalized.corpusType === "string") {
    normalized.corpusType = normalized.corpusType.toUpperCase();
  }
  const payload = normalized;
  if (actionName === "create_watch") {
    const channel = payload.channel ?? "webhook";
    if (channel !== "email" && !optionalString(payload.webhookUrl)?.trim()) {
      throw providerInputError("webhookUrl is required for webhook and both channels");
    }
    if (channel !== "webhook" && !optionalString(payload.emailAddress)?.trim()) {
      throw providerInputError("emailAddress is required for email and both channels");
    }
  }
  return request(actionName, payload, apiKey, fetcher, context.signal);
}
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await request("get_balance", {}, input.apiKey, fetcher, signal);
    return { profile: { displayName: "Vaquill API Key" }, grantedScopes: [], metadata: { apiBaseUrl: baseUrl } };
  },
};
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "vaquill",
  Object.fromEntries(
    vaquillActions.map((action) => [action.name, (values, context) => execute(action.name, values, context)]),
  ),
);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "vaquill",
  baseUrl: baseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
  },
});
