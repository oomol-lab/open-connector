import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  combineProviderActionHandlers,
  createProviderFetch,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
} from "../provider-runtime.ts";
import { pixellabCharacterActionHandlers } from "./runtime-character.ts";
import { pixellabImageExtraActionHandlers } from "./runtime-image-extra.ts";
import { pixellabImageActionHandlers } from "./runtime-image.ts";
import { pixellabObjectActionHandlers } from "./runtime-object.ts";
import { pixellabUiActionHandlers } from "./runtime-ui.ts";
import { pixellabActionHandlers, pixellabApiBaseUrl, validatePixellabCredential } from "./runtime.ts";

const service = "pixellab";

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(
  service,
  combineProviderActionHandlers<"pixellab", ProviderRuntimeHandler<ApiKeyProviderContext>>(
    service,
    pixellabActionHandlers,
    pixellabImageActionHandlers,
    pixellabImageExtraActionHandlers,
    pixellabUiActionHandlers,
    pixellabCharacterActionHandlers,
    pixellabObjectActionHandlers,
  ),
  { skipDnsValidation: true },
);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: pixellabApiBaseUrl,
  auth: { type: "api_key_authorization", prefix: "Bearer " },
  skipDnsValidation: true,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    const credentialFetch = createProviderFetch({ fetch: fetcher, skipDnsValidation: true });
    return validatePixellabCredential(input.apiKey, credentialFetch, signal);
  },
};
