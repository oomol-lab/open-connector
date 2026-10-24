import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-executors.ts";

import { optionalRecord, optionalString, looseArray } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors } from "../provider-executors.ts";
import { downloadUploadSource } from "../provider-files.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import { createProviderFetch } from "../provider-runtime.ts";
import {
  requiredResponseRecord,
  requiredInputString,
  runProviderRequest,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  providerInputError,
  providerResponseError,
} from "../provider-runtime.ts";
import { magicHourActions } from "./actions.ts";
import { magicHourRoutes } from "./actions.ts";
const baseUrl = "https://api.magichour.ai";
async function requestMagicHour(
  url: URL,
  method: string,
  apiKey: string,
  body: Record<string, unknown> | undefined,
  fetcher: typeof fetch,
  validation = false,
  parentSignal?: AbortSignal,
) {
  return runProviderRequest({ label: "Magic Hour", signal: parentSignal }, async (signal) => {
    const response = await fetcher(url, {
      method,
      headers: {
        authorization: `Bearer ${apiKey}`,
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    if (response.status === 204 && response.ok) return { deleted: true };
    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      if (isAbortLikeError(error)) throw error;
      throw new ProviderRequestError(
        response.ok ? 502 : response.status,
        response.ok ? "Magic Hour returned invalid JSON" : `Magic Hour request failed (HTTP ${response.status})`,
        undefined,
        "provider_error",
      );
    }
    if (!response.ok) {
      const error = optionalRecord(payload);
      const code = optionalString(error?.code);
      const message = optionalString(error?.message) ?? `Magic Hour request failed (HTTP ${response.status})`;
      throw new ProviderRequestError(
        code === "unauthorized" && validation ? 400 : response.status,
        code ? `${code}: ${message}` : message,
        undefined,
        code === "unauthorized" ? (validation ? "invalid_input" : "authorization_failed") : "provider_error",
      );
    }
    return requiredResponseRecord(payload, "Magic Hour response");
  });
}
async function uploadAsset(
  values: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
  parentSignal?: AbortSignal,
) {
  return runProviderRequest(
    { label: "Magic Hour asset upload", timeoutMs: 120000, signal: parentSignal },
    async (signal) => {
      const source = await downloadUploadSource({
        url: requiredInputString(values.fileUrl, "fileUrl"),
        fieldName: "fileUrl",
        fetcher,
        signal,
      });
      const result = await requestMagicHour(
        new URL("/v1/files/upload-urls", baseUrl),
        "POST",
        apiKey,
        { items: [{ type: values.type, extension: values.extension }] },
        fetcher,
        undefined,
        signal,
      );
      const item = optionalRecord(looseArray(result.items)[0]);
      const uploadUrl = optionalString(item?.upload_url);
      const filePath = optionalString(item?.file_path);
      if (!uploadUrl || !filePath)
        throw providerResponseError("Magic Hour upload response is missing upload_url or file_path");
      const uploadFetch = createProviderFetch({ fetch: fetcher });
      const response = await uploadFetch(uploadUrl, {
        method: "PUT",
        headers: { "content-type": source.contentType ?? "application/octet-stream" },
        body: new Uint8Array(source.bytes),
        signal,
      });
      await response.body?.cancel();
      if (!response.ok)
        throw new ProviderRequestError(
          response.status,
          `Magic Hour asset upload failed (HTTP ${response.status})`,
          undefined,
          "provider_error",
        );
      return { file_path: filePath };
    },
  );
}
async function execute(
  actionName: string,
  values: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  const { apiKey, fetcher } = context;
  const route = magicHourRoutes.get(actionName);
  if (actionName === "upload_asset") return uploadAsset(values, apiKey, fetcher, context.signal);
  if (!route) throw providerInputError("Unknown action route");
  let pathname = route.path;
  const query = new URLSearchParams();
  for (const parameter of route.parameters) {
    const value = values[parameter.name];
    if (value === undefined || value === null) continue;
    if (parameter.in === "path") {
      const segment = String(value);
      if (segment === "." || segment === "..")
        throw providerInputError(`${parameter.name} must not be a dot path segment`);
      pathname = pathname.replace(`{${parameter.name}}`, encodeURIComponent(segment));
    } else query.set(parameter.name, String(value));
  }
  const url = new URL(pathname, baseUrl);
  url.search = query.toString();
  return requestMagicHour(
    url,
    route.method,
    apiKey,
    route.body ? values : undefined,
    fetcher,
    undefined,
    context.signal,
  );
}
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const result = await requestMagicHour(
      new URL("/v1/account", baseUrl),
      "GET",
      input.apiKey,
      undefined,
      fetcher,
      true,
      signal,
    );
    return {
      profile: { displayName: optionalString(result.email) ?? "Magic Hour Account" },
      grantedScopes: [],
      metadata: {
        accountId: optionalString(result.id),
        validationEndpoint: "/v1/account",
      },
    };
  },
};
export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  "magichour",
  Object.fromEntries(
    magicHourActions.map((action) => [action.name, (values, context) => execute(action.name, values, context)]),
  ),
);
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "magichour",
  baseUrl: baseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("user-agent", providerUserAgent);
  },
});
