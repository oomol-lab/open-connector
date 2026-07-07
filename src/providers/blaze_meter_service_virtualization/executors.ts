import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";
import type { BlazeMeterServiceVirtualizationContext } from "./runtime.ts";

import { optionalString } from "../../core/cast.ts";
import { createBlazeMeterProxyExecutor } from "../blaze-meter-runtime.ts";
import { defineProviderExecutors, requireApiKeyCredential } from "../provider-runtime.ts";
import {
  blazeMeterServiceVirtualizationActionHandlers,
  requireBlazeMeterServiceVirtualizationApiKeyId,
  validateBlazeMeterServiceVirtualizationCredential,
} from "./runtime.ts";

const service = "blaze_meter_service_virtualization";

export const executors: ProviderExecutors = defineProviderExecutors<BlazeMeterServiceVirtualizationContext>({
  service,
  handlers: blazeMeterServiceVirtualizationActionHandlers,
  async createContext(
    context: ExecutionContext,
    fetcher: typeof fetch,
  ): Promise<BlazeMeterServiceVirtualizationContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKeyId: requireBlazeMeterServiceVirtualizationApiKeyId(
        optionalString(credential.values.apiKeyId) ?? optionalString(credential.metadata.apiKeyId),
      ),
      apiSecret: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const proxy: ProviderProxyExecutor = createBlazeMeterProxyExecutor(service);

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    return validateBlazeMeterServiceVirtualizationCredential(input, fetcher, signal);
  },
};
