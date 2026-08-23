import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";

import { defineProviderExecutors, requireApiKeyCredential } from "../provider-runtime.ts";
import { getresponseActionHandlers, validateGetresponseCredential } from "./runtime.ts";

interface GetresponseContext {
  apiKey: string;
  values: Record<string, string>;
  metadata: Record<string, unknown>;
  fetcher: typeof fetch;
}

const handlers: Record<string, (input: Record<string, unknown>, context: GetresponseContext) => Promise<unknown>> =
  Object.fromEntries(
    Object.entries(getresponseActionHandlers).map(([name, handler]) => [
      name,
      (input: Record<string, unknown>, context: GetresponseContext) =>
        handler(
          { apiKey: context.apiKey, providerMetadata: context.metadata, input, actionName: name },
          context.fetcher,
        ),
    ]),
  );

export const executors: ProviderExecutors = defineProviderExecutors({
  service: "getresponse",
  handlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, "getresponse");
    return { apiKey: credential.apiKey, values: credential.values, metadata: credential.metadata, fetcher };
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher }) {
    return validateGetresponseCredential({ apiKey: input.apiKey, ...input.values }, fetcher);
  },
};
