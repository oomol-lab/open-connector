import type {
  CredentialValidators,
  ExecutionContext,
  ProviderExecutors,
  ProviderProxyExecutor,
} from "../../core/types.ts";

import { isPrivateNetworkAccessAllowed } from "../../core/request.ts";
import {
  createProviderFetch,
  defineProviderExecutors,
  defineProviderProxy,
  requireApiKeyCredential,
} from "../provider-runtime.ts";
import { invoiceNinjaActionHandlers, normalizeInvoiceNinjaUrls, validateInvoiceNinjaCredential } from "./runtime.ts";

interface InvoiceNinjaContext {
  apiKey: string;
  apiBaseUrl: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

const handlers: Record<string, (input: Record<string, unknown>, context: InvoiceNinjaContext) => Promise<unknown>> =
  Object.fromEntries(
    Object.entries(invoiceNinjaActionHandlers).map(([name, handler]) => [
      name,
      (input: Record<string, unknown>, context: InvoiceNinjaContext) =>
        handler(
          {
            apiKey: context.apiKey,
            providerMetadata: { apiBaseUrl: context.apiBaseUrl },
            input,
            signal: context.signal,
          },
          context.fetcher,
        ),
    ]),
  );

export const executors: ProviderExecutors = defineProviderExecutors({
  service: "invoice_ninja",
  handlers,
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
  async createContext(context: ExecutionContext, fetcher: typeof fetch) {
    const credential = await requireApiKeyCredential(context, "invoice_ninja");
    const urls = normalizeInvoiceNinjaUrls(credential.values.instanceUrl);
    return { apiKey: credential.apiKey, apiBaseUrl: urls.apiBaseUrl, fetcher, signal: context.signal };
  },
});

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service: "invoice_ninja",
  async baseUrl(context) {
    const credential = await requireApiKeyCredential(context, "invoice_ninja");
    return normalizeInvoiceNinjaUrls(
      credential.metadata.apiBaseUrl ?? credential.metadata.instanceUrl ?? credential.values.instanceUrl,
    ).apiBaseUrl;
  },
  auth: { type: "api_key_header", name: "X-API-TOKEN" },
  allowPrivateNetwork: isPrivateNetworkAccessAllowed,
  customizeRequest({ headers }) {
    if (!headers.has("accept")) headers.set("accept", "application/json");
    if (!headers.has("x-requested-with")) headers.set("x-requested-with", "XMLHttpRequest");
  },
});

export const credentialValidators: CredentialValidators = {
  apiKey(input, { fetcher, signal }) {
    const guardedFetcher = createProviderFetch({ fetch: fetcher, allowPrivateNetwork: isPrivateNetworkAccessAllowed });
    return validateInvoiceNinjaCredential({ apiKey: input.apiKey, ...input.values }, guardedFetcher, signal);
  },
};
