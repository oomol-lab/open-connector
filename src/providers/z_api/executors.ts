import type { CredentialValidators, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  defineProviderProxy,
  defineProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

interface Context {
  baseUrl: string;
  clientToken: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}
async function request(
  path: string,
  input: Record<string, unknown>,
  context: Context,
  method = "POST",
): Promise<unknown> {
  const body: Record<string, unknown> = { ...input, image: input.imageUrl };
  delete body.imageUrl;
  const response = await context.fetcher(new URL(path, context.baseUrl), {
    method,
    headers: {
      accept: "application/json",
      "client-token": context.clientToken,
      "content-type": "application/json",
      "user-agent": providerUserAgent,
    },
    body: method === "GET" ? undefined : JSON.stringify(body),
    signal: context.signal,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) throw new ProviderRequestError(response.status || 502, "Z-API request failed", payload);
  return payload;
}
const handlers: ProviderActionHandlers<"z_api", ProviderRuntimeHandler<Context>> = {
  get_instance_status: (input, context) => request("status", input, context, "GET"),
  send_text: (input, context) => request("send-text", input, context),
  send_image: (input, context) => request("send-image", input, context),
  send_location: (input, context) => request("send-location", input, context),
};

export const executors: import("../../core/types.ts").ProviderExecutors = defineProviderExecutors<Context>({
  service: "z_api",
  skipDnsValidation: true,
  async createContext(context, fetcher) {
    const credential = await requireApiKeyCredential(context, "z_api");
    const instanceId = credential.values.instanceId;
    const instanceToken = credential.values.instanceToken;
    if (!instanceId || !instanceToken)
      throw new ProviderRequestError(401, "Configure the Z-API instance ID and token first.");
    return {
      baseUrl: `https://api.z-api.io/instances/${encodeURIComponent(instanceId)}/token/${encodeURIComponent(instanceToken)}/`,
      clientToken: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
  handlers,
});
export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "z_api",
  baseUrl: "https://api.z-api.io",
  auth: { type: "none" },
  skipDnsValidation: true,
  async customizeRequest({ context, url, headers }) {
    const credential = await requireApiKeyCredential(context, "z_api");
    const instanceId = credential.values.instanceId;
    const instanceToken = credential.values.instanceToken;
    if (!instanceId || !instanceToken)
      throw new ProviderRequestError(401, "Configure the Z-API instance ID and token first.");
    const requestedPath = url.pathname === "/" ? "" : url.pathname;
    url.pathname = `/instances/${encodeURIComponent(instanceId)}/token/${encodeURIComponent(instanceToken)}${requestedPath}`;
    headers.set("client-token", credential.apiKey);
    headers.set("accept", "application/json");
    headers.set("content-type", "application/json");
    headers.set("user-agent", providerUserAgent);
  },
});
export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const instanceId = input.values.instanceId;
    const instanceToken = input.values.instanceToken;
    if (!instanceId || !instanceToken) throw new ProviderRequestError(400, "instanceId and instanceToken are required");
    await request(
      "status",
      {},
      {
        baseUrl: `https://api.z-api.io/instances/${encodeURIComponent(instanceId)}/token/${encodeURIComponent(instanceToken)}/`,
        clientToken: input.apiKey,
        fetcher,
        signal,
      },
      "GET",
    );
    return {
      profile: { accountId: instanceId, displayName: `Z-API ${instanceId}` },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: "https://api.z-api.io",
        instanceId,
        validationEndpoint: "/status",
        credentialHelpUrl: "https://developer.z-api.io/en/security/introduction",
      },
    };
  },
};
