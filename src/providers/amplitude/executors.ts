import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { AmplitudeActionContext } from "./runtime.ts";

import { optionalString, requiredString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import {
  amplitudeActionHandlers,
  buildAmplitudeBasicAuthorizationHeader,
  resolveAmplitudeCredentialBaseUrl,
  validateAmplitudeCredential,
} from "./runtime.ts";

const service = "amplitude";

export const executors: ProviderExecutors = defineProviderExecutors<AmplitudeActionContext>({
  service,
  handlers: amplitudeActionHandlers,
  skipDnsValidation: true,
  async createContext(context, fetcher): Promise<AmplitudeActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    const dataResidency =
      optionalString(credential.values.dataResidency) ?? optionalString(credential.metadata.dataResidency);
    return {
      apiKeyId: requireAmplitudeApiKeyId(credential.values),
      secretKey: credential.apiKey,
      baseUrl: resolveAmplitudeCredentialBaseUrl(dataResidency),
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateAmplitudeCredential(input, fetcher, signal);
  },
};

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  skipDnsValidation: true,
  baseUrl: async (context) => {
    const credential = await requireApiKeyCredential(context, service);
    const dataResidency =
      optionalString(credential.values.dataResidency) ?? optionalString(credential.metadata.dataResidency);
    return resolveAmplitudeCredentialBaseUrl(dataResidency);
  },
  auth: { type: "none" },
  async customizeRequest({ context, headers }) {
    const credential = await requireApiKeyCredential(context, service);
    headers.set("accept", "application/json");
    headers.set("user-agent", providerUserAgent);
    headers.set(
      "authorization",
      buildAmplitudeBasicAuthorizationHeader(requireAmplitudeApiKeyId(credential.values), credential.apiKey),
    );
  },
});

function requireAmplitudeApiKeyId(values: Record<string, string>): string {
  return requiredString(values.apiKeyId, "apiKeyId", (message) => new ProviderRequestError(400, message));
}
