import type {
  CredentialValidators,
  ProviderExecutors,
  ProviderProxyExecutor,
  ProxyRequestInput,
  ResolvedCredential,
} from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { BazhuayuRuntimeContext } from "./runtime.ts";

import {
  createProviderProxyUrl,
  createProviderTimeout,
  defineProviderExecutors,
  mapProviderActionHandlers,
  normalizeProviderProxyHeaders,
  providerFetch,
  providerUserAgent,
  readProviderProxyResponse,
  requireCustomCredential,
  toProviderProxyError,
} from "../provider-runtime.ts";
import { bazhuayuActions } from "./actions.ts";
import {
  bazhuayuApiBaseUrl,
  executeBazhuayuAction,
  expireBazhuayuAccessToken,
  getBazhuayuAccessToken,
  maximumBazhuayuResponseBytes,
  readBazhuayuCredential,
  readBazhuayuProxyError,
  validateBazhuayuCredential,
} from "./runtime.ts";

const service = "bazhuayu";
const requestTimeoutMs = 30_000;

const handlers: ProviderActionHandlers<
  "bazhuayu",
  ProviderRuntimeHandler<BazhuayuRuntimeContext>
> = mapProviderActionHandlers(
  service,
  bazhuayuActions,
  (_action, name) => (input, context) => executeBazhuayuAction(name, input, context),
);

export const executors: ProviderExecutors = defineProviderExecutors<BazhuayuRuntimeContext>({
  service,
  handlers,
  async createContext(context, fetcher): Promise<BazhuayuRuntimeContext> {
    const credential = await requireCustomCredential(context, service);
    return {
      credential: readBazhuayuCredential(credential.values),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async customCredential(input, options) {
    const profile = await validateBazhuayuCredential(input.values, options.fetcher, options.signal);
    return {
      profile: { ...profile, grantedScopes: [] },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: bazhuayuApiBaseUrl,
      },
    };
  },
};

export const proxy: ProviderProxyExecutor = async (input, context) => {
  try {
    const credential = await requireCustomCredential(context, service);
    const bazhuayuCredential = readBazhuayuCredential(credential.values);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const accessToken = await getBazhuayuAccessToken(bazhuayuCredential, providerFetch, context.signal);
      const response = await fetchProxy(input, credential, accessToken, context.signal);
      if (response.status === 401 && attempt === 0) {
        await response.body?.cancel().catch(() => undefined);
        expireBazhuayuAccessToken(bazhuayuCredential, accessToken);
        continue;
      }
      if (!response.ok) throw await readBazhuayuProxyError(response);
      return {
        ok: true,
        response: await readProviderProxyResponse(response, {
          maxBytes: maximumBazhuayuResponseBytes,
        }),
      };
    }
    throw new Error("unreachable");
  } catch (error) {
    return toProviderProxyError(error, "Bazhuayu request failed");
  }
};

async function fetchProxy(
  input: ProxyRequestInput,
  _credential: Extract<ResolvedCredential, { authType: "custom_credential" }>,
  accessToken: string,
  parentSignal?: AbortSignal,
): Promise<Response> {
  const url = createProviderProxyUrl(bazhuayuApiBaseUrl, input.endpoint, input.query);
  const headers = normalizeProviderProxyHeaders(input.headers);
  headers.set("accept", "application/json");
  headers.set("authorization", `Bearer ${accessToken}`);
  headers.set("user-agent", providerUserAgent);
  const init: RequestInit = { method: input.method, headers };
  if (input.body !== undefined) {
    init.body = typeof input.body === "string" ? input.body : JSON.stringify(input.body);
    if (!headers.has("content-type") && typeof input.body !== "string") {
      headers.set("content-type", "application/json");
    }
  }
  const timeout = createProviderTimeout(parentSignal, requestTimeoutMs);
  try {
    return await providerFetch(url, { ...init, signal: timeout.signal });
  } finally {
    timeout.cleanup();
  }
}
