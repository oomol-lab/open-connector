import type {
  CredentialValidationResult,
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
} from "../../core/types.ts";

import { defineProviderExecutors, requireCustomCredential } from "../provider-runtime.ts";
import { createMqttContext, mqttActionHandlers, validateMqttCredential } from "./runtime.ts";

const service = "mqtt";

export const executors: ProviderExecutors = defineProviderExecutors({
  service,
  handlers: mqttActionHandlers,
  async createContext(context: ExecutionContext) {
    const credential = await requireCustomCredential(context, service);
    return createMqttContext(credential.values, context.signal);
  },
});

export const credentialValidators: CredentialValidators = {
  customCredential(input, { signal }): Promise<CredentialValidationResult> {
    return validateMqttCredential(input.values, signal);
  },
};
