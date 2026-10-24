import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { FormstackDocumentsContext } from "./runtime.ts";

import { Buffer } from "node:buffer";
import { requireCustomCredential } from "../provider-credentials.ts";
import { defineProviderExecutors } from "../provider-executors.ts";
import { defineProviderProxy } from "../provider-proxy.ts";
import {
  formstackDocumentsActionHandlers,
  formstackDocumentsApiBaseUrl,
  validateFormstackDocumentsCredential,
} from "./runtime.ts";

const service = "formstack_documents";

export const executors: ProviderExecutors = defineProviderExecutors<FormstackDocumentsContext>({
  service,
  handlers: formstackDocumentsActionHandlers,
  skipDnsValidation: true,
  async createContext(context, fetcher) {
    const credential = await requireCustomCredential(context, service);
    return { values: credential.values, fetcher };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: formstackDocumentsApiBaseUrl,
  auth: { type: "none" },
  skipDnsValidation: true,
  async customizeRequest({ context, headers }) {
    const credential = await requireCustomCredential(context, service);
    headers.set(
      "authorization",
      `Basic ${Buffer.from(`${credential.values.apiKey}:${credential.values.apiSecret}`).toString("base64")}`,
    );
  },
});

export const credentialValidators: CredentialValidators = {
  customCredential(input, { fetcher }) {
    return validateFormstackDocumentsCredential(input.values, fetcher);
  },
};
