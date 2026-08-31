import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { AutotaskActionContext } from "./runtime.ts";

import { optionalString, requiredString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import { autotaskActionHandlers, resolveAutotaskApiBaseUrl, validateAutotaskCredential } from "./runtime.ts";

const service = "autotask";
const autotaskApiVersionPath = "v1.0";

export const executors: ProviderExecutors = defineProviderExecutors<AutotaskActionContext>({
  service,
  handlers: autotaskActionHandlers,
  async createContext(context, fetcher): Promise<AutotaskActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      username: credential.apiKey,
      secret: requiredCredentialValue(credential.values.secret, "secret"),
      integrationCode: requiredCredentialValue(credential.values.integrationCode, "integrationCode"),
      apiBaseUrl: resolveAutotaskApiBaseUrl(credential.metadata),
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, service);
    // Reject an incomplete credential before header normalization, keeping the 401/400 precedence.
    requiredCredentialValue(credential.values.secret, "secret");
    requiredCredentialValue(credential.values.integrationCode, "integrationCode");
    return `${resolveAutotaskApiBaseUrl(credential.metadata)}/${autotaskApiVersionPath}`;
  },
  auth: { type: "api_key_header", name: "username" },
  async customizeRequest({ context, headers }) {
    const credential = await requireApiKeyCredential(context, service);
    headers.set("accept", "application/json");
    headers.set("secret", requiredCredentialValue(credential.values.secret, "secret"));
    headers.set("apiintegrationcode", requiredCredentialValue(credential.values.integrationCode, "integrationCode"));
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateAutotaskCredential(
      {
        username: input.apiKey,
        secret: requiredCredentialValue(input.values.secret, "secret"),
        integrationCode: requiredCredentialValue(input.values.integrationCode, "integrationCode"),
      },
      fetcher,
      signal,
    );
  },
};

function requiredCredentialValue(value: unknown, fieldName: string): string {
  return requiredString(optionalString(value), fieldName, (message) => new ProviderRequestError(400, message));
}
