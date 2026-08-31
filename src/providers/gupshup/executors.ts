import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";

import {
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
  requiredStringArray,
} from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "gupshup";
const baseUrl = "https://api.gupshup.io";
interface Context {
  apiKey: string;
  appId: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}
async function request(
  context: Context,
  path: string,
  method: "GET" | "POST",
  values: Record<string, unknown>,
): Promise<unknown> {
  const url = new URL(path, baseUrl);
  let body: URLSearchParams | undefined;
  if (method === "GET")
    for (const [key, value] of Object.entries(values))
      if (value !== undefined) url.searchParams.set(key, String(value));
      else {
        body = new URLSearchParams();
        for (const [key, value] of Object.entries(values)) if (value !== undefined) body.set(key, String(value));
      }
  const response = await context.fetcher(url, {
    method,
    headers: {
      accept: "application/json",
      apikey: context.apiKey,
      "user-agent": providerUserAgent,
      ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    body,
    signal: context.signal,
  });
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new ProviderRequestError(502, "Gupshup returned malformed JSON");
  }
  if (!response.ok) {
    const record = optionalRecord(payload);
    const nested = optionalRecord(record?.message);
    throw new ProviderRequestError(
      response.status,
      optionalString(record?.message) ??
        optionalString(nested?.message) ??
        `Gupshup request failed with status ${response.status}`,
      payload,
    );
  }
  return payload;
}
const handlers = {
  send_text_message(input: Record<string, unknown>, context: Context) {
    return request(context, "/wa/api/v1/msg", "POST", {
      channel: "whatsapp",
      source: requiredString(input.source, "source", providerInputError),
      destination: requiredString(input.destination, "destination", providerInputError),
      "src.name": requiredString(input.appName, "appName", providerInputError),
      message: JSON.stringify({ type: "text", text: requiredString(input.text, "text", providerInputError) }),
      disablePreview: typeof input.disablePreview === "boolean" ? String(input.disablePreview) : undefined,
    });
  },
  send_template_message(input: Record<string, unknown>, context: Context) {
    return request(context, "/wa/api/v1/template/msg", "POST", {
      channel: "whatsapp",
      source: requiredString(input.source, "source", providerInputError),
      destination: requiredString(input.destination, "destination", providerInputError),
      "src.name": requiredString(input.appName, "appName", providerInputError),
      template: JSON.stringify({
        id: requiredString(input.templateId, "templateId", providerInputError),
        params:
          input.parameters === undefined ? [] : requiredStringArray(input.parameters, "parameters", providerInputError),
      }),
    });
  },
  async list_templates(input: Record<string, unknown>, context: Context) {
    return request(context, `/wa/app/${encodeURIComponent(context.appId)}/template`, "GET", {
      pageNo: optionalInteger(input.pageNo),
      pageSize: optionalInteger(input.pageSize),
      templateStatus: optionalString(input.templateStatus),
      templateCategory: optionalString(input.templateCategory),
      templateType: optionalString(input.templateType),
      quality: optionalString(input.quality),
      languageCode: optionalString(input.languageCode),
    });
  },
};
export const executors: ProviderExecutors = defineProviderExecutors<Context>({
  service,
  handlers,
  skipDnsValidation: true,
  async createContext(context, fetcher) {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      appId: requiredString(credential.metadata.appId ?? credential.values.appId, "appId", providerInputError),
      fetcher,
      signal: context.signal,
    };
  },
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl,
  auth: { type: "api_key_header", name: "apikey" },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    headers.set("accept", "application/json");
    headers.set("user-agent", providerUserAgent);
  },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const appId = requiredString(input.values.appId, "appId", providerInputError);
    const validationEndpoint = `/wa/app/${encodeURIComponent(appId)}/template`;
    await request({ apiKey: input.apiKey, appId, fetcher, signal }, validationEndpoint, "GET", {
      pageNo: 0,
      pageSize: 1,
    });
    return {
      profile: { accountId: appId, displayName: "Gupshup WhatsApp App" },
      grantedScopes: [],
      metadata: { apiBaseUrl: baseUrl, appId, validationEndpoint },
    };
  },
};
